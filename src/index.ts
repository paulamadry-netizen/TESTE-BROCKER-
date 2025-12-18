import express, { Request, Response, Application } from 'express';
import fetch from 'node-fetch';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  YahooFinanceResponse,
  YahooQuoteResult,
  QuoteData,
  SymbolMapping,
  CacheStore
} from './types/yahoo.types';
import { CreateUserResult, UserAccountData } from './types/firebase.types';

// Charger les variables d'environnement
dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '4000', 10);

// Middleware
app.use(cors());
app.use(express.static('.')); // Pour servir index.html

// Initialiser Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required in environment variables');
}
const stripe: Stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Initialiser Firebase Admin
try {
  const serviceAccountPath: string = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
  const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, 'utf8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✅ Firebase Admin initialisé');
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.warn('⚠️ Firebase non configuré:', errorMessage);
  console.warn('ℹ️ Le webhook Stripe ne pourra pas créer de comptes');
}

// Cache configuration
const CACHE_TTL: number = 15000;
const cache: CacheStore = {};

// Symbol mappings for Yahoo Finance
const MAPPINGS: SymbolMapping = {
  DJI: '^DJI',
  SPX: '^GSPC',
  NASDAQ: '^IXIC',
  DAX: '^GDAXI',
  FCHI: '^FCHI'
};

/**
 * Get current timestamp in milliseconds
 */
function now(): number {
  return Date.now();
}

/**
 * Fetch stock quotes from Yahoo Finance API
 * @param symbols - Array of stock symbols to fetch
 * @returns Promise resolving to array of quote results
 */
async function fetchFromYahoo(symbols: string[]): Promise<YahooQuoteResult[]> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.status}`);
  }

  const payload = await res.json() as YahooFinanceResponse;
  return payload.quoteResponse.result;
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

/**
 * Génère un mot de passe aléatoire sécurisé
 * @param length - Longueur du mot de passe (défaut: 12)
 * @returns Mot de passe généré
 */
function generateRandomPassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  return password;
}

/**
 * Crée un compte utilisateur dans Firestore
 * @param email - Email de l'utilisateur
 * @param stripeCustomerId - ID client Stripe
 * @param paymentIntentId - ID de l'intention de paiement
 * @returns Résultat de la création du compte
 */
async function createUserAccount(
  email: string,
  stripeCustomerId: string,
  paymentIntentId: string
): Promise<CreateUserResult> {
  try {
    const db = admin.firestore();
    const password: string = generateRandomPassword();

    const userData: UserAccountData = {
      email,
      password, // ⚠️ En production, hash ce mot de passe !
      stripeCustomerId,
      paymentIntentId,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erreur création compte:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ========================================
// WEBHOOK STRIPE
// ========================================

/**
 * Endpoint pour recevoir les webhooks de Stripe
 * Déclenché automatiquement après un paiement réussi
 */
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret: string | undefined = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  if (!webhookSecret) {
    res.status(500).send('Webhook secret not configured');
    return;
  }

  let event: Stripe.Event;

  try {
    // Vérifier la signature du webhook (sécurité)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('⚠️ Webhook signature invalide:', errorMessage);
    res.status(400).send(`Webhook Error: ${errorMessage}`);
    return;
  }

  // Gérer les différents types d'événements Stripe
  switch (event.type) {
    case 'checkout.session.completed': {
      // Paiement via Stripe Checkout
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('💳 Paiement reçu via Checkout:', session.id);

      if (session.customer_email) {
        const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
        const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : '';

        const result = await createUserAccount(
          session.customer_email,
          customer,
          paymentIntent
        );

        if (result.success) {
          console.log(`📧 Mot de passe généré: ${result.password}`);
          // TODO: Envoyer l'email au client avec ses identifiants
        }
      }
      break;
    }

    case 'payment_intent.succeeded': {
      // Paiement direct via Payment Intent
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('💳 Paiement reçu via Payment Intent:', paymentIntent.id);

      if (paymentIntent.receipt_email) {
        const customer = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : '';

        const result = await createUserAccount(
          paymentIntent.receipt_email,
          customer,
          paymentIntent.id
        );

        if (result.success) {
          console.log(`📧 Mot de passe généré: ${result.password}`);
          // TODO: Envoyer l'email au client avec ses identifiants
        }
      }
      break;
    }

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

/**
 * GET /quotes - Récupère les prix des symboles financiers
 * @query symbols - Liste de symboles séparés par des virgules (optionnel)
 */
app.get('/quotes', async (req: Request, res: Response): Promise<void> => {
  const requestedSymbols = (req.query.symbols as string || '').split(',').map(s => s.trim()).filter(Boolean);
  const symbols: string[] = requestedSymbols.length ? requestedSymbols : Object.keys(MAPPINGS);

  try {
    const cacheKey = symbols.join(',');

    // Check cache
    if (cache[cacheKey] && now() - cache[cacheKey].ts < CACHE_TTL) {
      res.json(cache[cacheKey].data);
      return;
    }

    // Map symbols to Yahoo format
    const yahooSymbols = symbols.map(sym => MAPPINGS[sym] || sym);
    const result = await fetchFromYahoo(yahooSymbols);

    // Transform response
    const payload: QuoteData[] = result.map(item => ({
      symbol: item.symbol,
      price: item.regularMarketPrice,
      change: item.regularMarketChange,
      changePercent: item.regularMarketChangePercent,
      timestamp: item.regularMarketTime
    }));

    // Update cache
    cache[cacheKey] = { ts: now(), data: payload };

    res.json(payload);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: errorMessage });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend prêt sur http://localhost:${PORT}`);
});
