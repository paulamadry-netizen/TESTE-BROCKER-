import express from 'express';
import fetch from 'node-fetch';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.static('.')); // Pour servir index.html

// Initialiser Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialiser Firebase Admin
try {
  const serviceAccount = JSON.parse(
    readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json', 'utf8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✅ Firebase Admin initialisé');
} catch (error) {
  console.warn('⚠️ Firebase non configuré:', error.message);
  console.warn('ℹ️ Le webhook Stripe ne pourra pas créer de comptes');
}
const CACHE_TTL = 15000;
const cache = {};
const MAPPINGS = {
  DJI: '^DJI',
  SPX: '^GSPC',
  NASDAQ: '^IXIC',
  DAX: '^GDAXI',
  FCHI: '^FCHI'
};

function now() {
  return Date.now();
}

async function fetchFromYahoo(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const payload = await res.json();
  return payload.quoteResponse.result;
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

/**
 * Génère un mot de passe aléatoire sécurisé
 */
function generateRandomPassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

/**
 * Crée un compte utilisateur dans Firestore
 */
async function createUserAccount(email, stripeCustomerId, paymentIntentId) {
  try {
    const db = admin.firestore();
    const password = generateRandomPassword();

    const userData = {
      email: email,
      password: password, // ⚠️ En production, hash ce mot de passe !
      stripeCustomerId: stripeCustomerId,
      paymentIntentId: paymentIntentId,
      balance: 50000, // Balance initiale (à adapter selon votre offre)
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null
    };

    // Créer le document dans Firestore
    await db.collection('users').doc(email).set(userData);

    console.log(`✅ Compte créé pour ${email}`);
    return { success: true, email, password };
  } catch (error) {
    console.error('❌ Erreur création compte:', error);
    return { success: false, error: error.message };
  }
}

// ========================================
// WEBHOOK STRIPE
// ========================================

/**
 * Endpoint pour recevoir les webhooks de Stripe
 * Déclenché automatiquement après un paiement réussi
 */
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Vérifier la signature du webhook (sécurité)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Gérer les différents types d'événements Stripe
  switch (event.type) {
    case 'checkout.session.completed':
      // Paiement via Stripe Checkout
      const session = event.data.object;
      console.log('💳 Paiement reçu via Checkout:', session.id);

      if (session.customer_email) {
        const result = await createUserAccount(
          session.customer_email,
          session.customer,
          session.payment_intent
        );

        if (result.success) {
          console.log(`📧 Mot de passe généré: ${result.password}`);
          // TODO: Envoyer l'email au client avec ses identifiants
        }
      }
      break;

    case 'payment_intent.succeeded':
      // Paiement direct via Payment Intent
      const paymentIntent = event.data.object;
      console.log('💳 Paiement reçu via Payment Intent:', paymentIntent.id);

      if (paymentIntent.receipt_email) {
        const result = await createUserAccount(
          paymentIntent.receipt_email,
          paymentIntent.customer,
          paymentIntent.id
        );

        if (result.success) {
          console.log(`📧 Mot de passe généré: ${result.password}`);
          // TODO: Envoyer l'email au client avec ses identifiants
        }
      }
      break;

    default:
      console.log(`ℹ️ Événement non géré: ${event.type}`);
  }

  // Répondre à Stripe que le webhook a été reçu
  res.json({ received: true });
});

// Middleware JSON pour les autres routes (après le webhook)
app.use(express.json());

// ========================================
// ROUTES API
// ========================================

app.get('/quotes', async (req, res) => {
  const requested = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
  const symbols = requested.length ? requested : Object.keys(MAPPINGS);
  try {
    const cacheKey = symbols.join(',');
    if (cache[cacheKey] && now() - cache[cacheKey].ts < CACHE_TTL) {
      return res.json(cache[cacheKey].data);
    }
    const yahooSymbols = symbols.map(sym => MAPPINGS[sym] || sym);
    const result = await fetchFromYahoo(yahooSymbols);
    const payload = result.map(item => ({
      symbol: item.symbol,
      price: item.regularMarketPrice,
      change: item.regularMarketChange,
      changePercent: item.regularMarketChangePercent,
      timestamp: item.regularMarketTime
    }));
    cache[cacheKey] = { ts: now(), data: payload };
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend prêt sur http://localhost:${PORT}`);
});
