/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * et la surveillance des SL/TP en temps réel
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const https = require('https');

// Initialiser Firebase Admin
admin.initializeApp();

// URL du backend de prix
const PRICE_ENGINE_URL = 'https://ig-price-engine-44407447466.europe-west1.run.app';

// Initialiser Stripe (sera chargé au runtime avec la config)
let stripe;

/**
 * Webhook Stripe - Écoute les événements de paiement
 * URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhook
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  // Initialiser Stripe si pas encore fait
  if (!stripe) {
    stripe = require('stripe')(functions.config().stripe.secret_key);
  }

  // Vérification de la signature Stripe (sécurité)
  const sig = req.headers['stripe-signature'];
  const webhookSecret = functions.config().stripe.webhook_secret;

  let event;

  try {
    // Vérifier que la requête vient bien de Stripe
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } else {
      event = req.body;
    }
  } catch (err) {
    console.error('❌ Erreur de vérification webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Événement Stripe reçu:', event.type);

  // Gérer les différents types d'événements
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      default:
        console.log(`ℹ️ Événement non géré: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Erreur traitement webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Gérer la complétion d'un paiement Stripe
 * ✅ CORRECTION : Cette fonction passe maintenant l'email correctement
 */
async function handleCheckoutCompleted(session) {
  console.log('💳 Paiement complété pour la session:', session.id);

  // ✅ RÉCUPÉRER L'EMAIL DU CLIENT (plusieurs sources possibles)
  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email;

  if (!customerEmail) {
    console.error('❌ ERREUR CRITIQUE: Aucun email trouvé dans la session Stripe');
    console.log('Session data:', JSON.stringify(session, null, 2));
    throw new Error('Email manquant dans la session Stripe');
  }

  console.log('📧 Email du client:', customerEmail);

  // Générer un mot de passe aléatoire sécurisé
  const randomPassword = generateSecurePassword();

  try {
    // ✅ CRÉER L'UTILISATEUR AVEC L'EMAIL
    const userRecord = await admin.auth().createUser({
      email: customerEmail,  // ← FIX PRINCIPAL : L'email est maintenant passé !
      password: randomPassword,
      emailVerified: false,
    });

    console.log('✅ Utilisateur créé avec succès!');
    console.log('   - UID:', userRecord.uid);
    console.log('   - Email:', customerEmail);

    // Créer le document utilisateur dans Firestore
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: customerEmail,
      stripeCustomerId: session.customer,
      stripeSessionId: session.id,
      challengeType: session.metadata?.challengeType || 'standard',
      accountBalance: session.amount_total ? session.amount_total / 100 : 0,
      accountStatus: 'active',
      profitTarget: session.metadata?.profitTarget || 10,
      maxDrawdown: session.metadata?.maxDrawdown || 5,
      tradingDays: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Document Firestore créé');

    // Générer un lien de réinitialisation de mot de passe
    const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);

    console.log('🔗 Lien de réinitialisation généré');
    console.log('   Link:', resetLink);

    // TODO: Envoyer un email de bienvenue au client avec le lien
    // Vous pouvez utiliser SendGrid, Mailgun, ou Firebase Extensions Email
    await sendWelcomeEmail(customerEmail, resetLink, session);

    console.log('✅ Traitement terminé avec succès pour:', customerEmail);

  } catch (error) {
    // Si l'utilisateur existe déjà, mettre à jour ses données
    if (error.code === 'auth/email-already-exists') {
      console.log('ℹ️ Utilisateur existe déjà:', customerEmail);

      const existingUser = await admin.auth().getUserByEmail(customerEmail);

      await admin.firestore().collection('users').doc(existingUser.uid).update({
        stripeCustomerId: session.customer,
        stripeSessionId: session.id,
        accountStatus: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Données utilisateur mises à jour');
    } else {
      console.error('❌ Erreur création utilisateur:', error);
      throw error;
    }
  }
}

/**
 * Gérer les changements d'abonnement
 */
async function handleSubscriptionChange(subscription) {
  console.log('📊 Abonnement modifié:', subscription.id);

  const customer = await stripe.customers.retrieve(subscription.customer);
  const email = customer.email;

  if (!email) {
    console.error('❌ Email manquant pour le customer:', subscription.customer);
    return;
  }

  try {
    const user = await admin.auth().getUserByEmail(email);

    await admin.firestore().collection('users').doc(user.uid).update({
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Abonnement mis à jour pour:', email);
  } catch (error) {
    console.error('❌ Erreur mise à jour abonnement:', error);
  }
}

/**
 * Gérer la suppression d'abonnement
 */
async function handleSubscriptionDeleted(subscription) {
  console.log('🗑️ Abonnement supprimé:', subscription.id);

  const customer = await stripe.customers.retrieve(subscription.customer);
  const email = customer.email;

  if (!email) return;

  try {
    const user = await admin.auth().getUserByEmail(email);

    await admin.firestore().collection('users').doc(user.uid).update({
      accountStatus: 'inactive',
      subscriptionStatus: 'canceled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Compte désactivé pour:', email);
  } catch (error) {
    console.error('❌ Erreur désactivation compte:', error);
  }
}

/**
 * Générer un mot de passe aléatoire sécurisé
 */
function generateSecurePassword() {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }

  return password;
}

/**
 * Envoyer un email de bienvenue (à implémenter)
 * Vous pouvez utiliser SendGrid, Mailgun, ou Firebase Extensions
 */
async function sendWelcomeEmail(email, resetLink, session) {
  console.log('📧 Email de bienvenue à envoyer à:', email);

  // TODO: Implémenter l'envoi d'email
  // Option 1: Extension Firebase "Trigger Email"
  // Option 2: SendGrid API
  // Option 3: Mailgun API

  // Pour l'instant, on log juste les infos
  console.log('   - Lien de réinitialisation:', resetLink);
  console.log('   - Challenge type:', session.metadata?.challengeType);
  console.log('   - Dashboard: https://dash-board-claude-ia.onrender.com/login');

  // Exemple avec Firestore pour déclencher une extension email
  try {
    await admin.firestore().collection('mail').add({
      to: email,
      template: {
        name: 'welcome',
        data: {
          email: email,
          resetLink: resetLink,
          dashboardUrl: 'https://dash-board-claude-ia.onrender.com/login',
          challengeType: session.metadata?.challengeType || 'standard',
        }
      }
    });
    console.log('✅ Email ajouté à la queue');
  } catch (error) {
    console.error('⚠️ Impossible d\'envoyer l\'email:', error);
    // Ne pas bloquer si l'email échoue
  }
}

/**
 * Fonction utilitaire pour faire une requête HTTP GET
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Surveillance des SL/TP - Exécutée toutes les minutes
 * Vérifie les positions ouvertes et ferme celles dont le SL ou TP est touché
 */
exports.checkSlTp = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  console.log('🔍 Vérification des SL/TP...');
  
  try {
    // Récupérer toutes les positions ouvertes avec SL ou TP défini
    const tradesSnapshot = await admin.firestore()
      .collection('trades')
      .where('status', '==', 'open')
      .get();
    
    if (tradesSnapshot.empty) {
      console.log('ℹ️ Aucune position ouverte');
      return null;
    }
    
    console.log(`📊 ${tradesSnapshot.size} positions ouvertes à vérifier`);
    
    // Grouper les positions par symbole pour optimiser les appels API
    const positionsBySymbol = {};
    tradesSnapshot.forEach(doc => {
      const trade = doc.data();
      if (!trade.symbolApi) return;
      if (!positionsBySymbol[trade.symbolApi]) {
        positionsBySymbol[trade.symbolApi] = [];
      }
      positionsBySymbol[trade.symbolApi].push({ id: doc.id, ...trade });
    });
    
    // Récupérer les prix actuels
    const symbols = Object.keys(positionsBySymbol);
    let prices = {};
    
    try {
      const pricesData = await httpGet(`${PRICE_ENGINE_URL}/api/prices`);
      if (pricesData && pricesData.prices) {
        prices = pricesData.prices;
      }
    } catch (e) {
      console.error('❌ Erreur récupération prix:', e.message);
      return null;
    }
    
    // Vérifier chaque position
    const closedTrades = [];
    
    for (const symbol of symbols) {
      const currentPrice = prices[symbol];
      if (!currentPrice) {
        console.log(`⚠️ Pas de prix pour ${symbol}`);
        continue;
      }
      
      const mid = (currentPrice.bid + currentPrice.offer) / 2;
      
      for (const trade of positionsBySymbol[symbol]) {
        const { id, side, takeProfit, stopLoss, entryPrice, lots, userId } = trade;
        
        // Vérifier si SL ou TP est défini
        if (!takeProfit && !stopLoss) continue;
        
        let shouldClose = false;
        let closeReason = '';
        let closePrice = mid;
        
        if (side === 'BUY') {
          // BUY: TP atteint si prix >= TP, SL atteint si prix <= SL
          if (takeProfit && mid >= takeProfit) {
            shouldClose = true;
            closeReason = 'TP';
            closePrice = takeProfit;
          } else if (stopLoss && mid <= stopLoss) {
            shouldClose = true;
            closeReason = 'SL';
            closePrice = stopLoss;
          }
        } else if (side === 'SELL') {
          // SELL: TP atteint si prix <= TP, SL atteint si prix >= SL
          if (takeProfit && mid <= takeProfit) {
            shouldClose = true;
            closeReason = 'TP';
            closePrice = takeProfit;
          } else if (stopLoss && mid >= stopLoss) {
            shouldClose = true;
            closeReason = 'SL';
            closePrice = stopLoss;
          }
        }
        
        if (shouldClose) {
          console.log(`🎯 ${closeReason} touché pour ${symbol} (${side}) - Prix: ${mid}, ${closeReason}: ${closeReason === 'TP' ? takeProfit : stopLoss}`);
          
          // Calculer le PnL
          const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
          const pips = side === 'BUY' 
            ? (closePrice - entryPrice) / pipValue 
            : (entryPrice - closePrice) / pipValue;
          const pnl = pips * lots * 10; // Approximation
          
          // Mettre à jour le trade dans Firestore
          await admin.firestore().collection('trades').doc(id).update({
            status: 'closed',
            closePrice: closePrice,
            pnl: pnl,
            closeReason: closeReason,
            closedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          
          // Mettre à jour le solde utilisateur
          if (userId) {
            const userRef = admin.firestore().collection('users').doc(userId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              const newBalance = (userData.accountBalance || 0) + pnl;
              await userRef.update({
                accountBalance: newBalance,
                updatedAt: new Date().toISOString()
              });
              console.log(`💰 Solde mis à jour pour ${userId}: ${newBalance}`);
            }
          }
          
          closedTrades.push({ id, symbol, side, closeReason, pnl });
        }
      }
    }
    
    if (closedTrades.length > 0) {
      console.log(`✅ ${closedTrades.length} position(s) fermée(s) automatiquement`);
    } else {
      console.log('ℹ️ Aucune position à fermer');
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erreur checkSlTp:', error);
    return null;
  }
});

/**
 * Surveillance des ordres limites - Exécutée toutes les minutes
 * Vérifie les ordres en attente et les exécute si le prix est atteint
 */
exports.checkPendingOrders = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  console.log('🔍 Vérification des ordres en attente...');
  
  try {
    // Récupérer tous les ordres en attente
    const ordersSnapshot = await admin.firestore()
      .collection('orders')
      .where('status', '==', 'pending')
      .get();
    
    if (ordersSnapshot.empty) {
      console.log('ℹ️ Aucun ordre en attente');
      return null;
    }
    
    console.log(`📊 ${ordersSnapshot.size} ordres en attente à vérifier`);
    
    // Grouper les ordres par symbole
    const ordersBySymbol = {};
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      if (!order.symbolApi) return;
      if (!ordersBySymbol[order.symbolApi]) {
        ordersBySymbol[order.symbolApi] = [];
      }
      ordersBySymbol[order.symbolApi].push({ id: doc.id, ...order });
    });
    
    // Récupérer les prix actuels
    const symbols = Object.keys(ordersBySymbol);
    let prices = {};
    
    try {
      const pricesData = await httpGet(`${PRICE_ENGINE_URL}/api/prices`);
      if (pricesData && pricesData.prices) {
        prices = pricesData.prices;
      }
    } catch (e) {
      console.error('❌ Erreur récupération prix:', e.message);
      return null;
    }
    
    // Vérifier chaque ordre
    const executedOrders = [];
    
    for (const symbol of symbols) {
      const currentPrice = prices[symbol];
      if (!currentPrice) continue;
      
      const mid = (currentPrice.bid + currentPrice.offer) / 2;
      
      for (const order of ordersBySymbol[symbol]) {
        const { id, side, orderType, price, lots, takeProfit, stopLoss, userId } = order;
        
        let shouldExecute = false;
        
        if (orderType === 'limit') {
          // Limit: BUY si prix <= target, SELL si prix >= target
          if (side === 'BUY' && mid <= price) shouldExecute = true;
          if (side === 'SELL' && mid >= price) shouldExecute = true;
        } else if (orderType === 'stop') {
          // Stop: BUY si prix >= target, SELL si prix <= target
          if (side === 'BUY' && mid >= price) shouldExecute = true;
          if (side === 'SELL' && mid <= price) shouldExecute = true;
        }
        
        if (shouldExecute) {
          console.log(`🎯 Ordre ${orderType} exécuté: ${side} ${symbol} @ ${price}`);
          
          // Créer un nouveau trade
          const tradeRef = await admin.firestore().collection('trades').add({
            userId: userId,
            symbolApi: symbol,
            symbol: symbol,
            side: side,
            entryPrice: price,
            currentPrice: mid,
            lots: lots,
            takeProfit: takeProfit || null,
            stopLoss: stopLoss || null,
            status: 'open',
            openedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
          
          // Mettre à jour l'ordre comme exécuté
          await admin.firestore().collection('orders').doc(id).update({
            status: 'executed',
            executedAt: new Date().toISOString(),
            tradeId: tradeRef.id,
            updatedAt: new Date().toISOString()
          });
          
          executedOrders.push({ id, symbol, side, price });
        }
      }
    }
    
    if (executedOrders.length > 0) {
      console.log(`✅ ${executedOrders.length} ordre(s) exécuté(s)`);
    } else {
      console.log('ℹ️ Aucun ordre à exécuter');
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erreur checkPendingOrders:', error);
    return null;
  }
});
