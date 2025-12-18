/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * Version corrigée avec meilleure gestion des erreurs
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialiser Firebase Admin
admin.initializeApp();

// Initialiser Stripe avec gestion d'erreur améliorée
let stripe;

/**
 * Webhook Stripe - Écoute les événements de paiement
 * URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhook
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  // Initialiser Stripe si pas encore fait
  if (!stripe) {
    try {
      const config = functions.config();

      // Debug : afficher la config disponible
      console.log('🔍 Vérification config...');
      console.log('Config keys:', Object.keys(config));

      if (!config.stripe) {
        console.error('❌ config.stripe est undefined');
        console.error('Config disponible:', JSON.stringify(config));
        return res.status(500).send('Configuration Stripe manquante - stripe object not found');
      }

      if (!config.stripe.secret_key) {
        console.error('❌ config.stripe.secret_key est undefined');
        console.error('Stripe config:', JSON.stringify(config.stripe));
        return res.status(500).send('Configuration Stripe manquante - secret_key not found');
      }

      const secretKey = config.stripe.secret_key;
      console.log('✅ Clé Stripe trouvée (premiers chars):', secretKey.substring(0, 10) + '...');

      stripe = require('stripe')(secretKey);
      console.log('✅ Stripe initialisé avec succès');

    } catch (error) {
      console.error('❌ Erreur initialisation Stripe:', error);
      return res.status(500).send('Erreur initialisation Stripe: ' + error.message);
    }
  }

  // Vérification de la signature Stripe (sécurité)
  const sig = req.headers['stripe-signature'];
  const config = functions.config();
  const webhookSecret = config.stripe ? config.stripe.webhook_secret : null;

  let event;

  try {
    // Vérifier que la requête vient bien de Stripe
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      console.log('✅ Signature webhook vérifiée');
    } else {
      console.warn('⚠️ Pas de webhook secret configuré, signature non vérifiée');
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
        await handleCheckoutCompleted(event.data.object, stripe);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object, stripe);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, stripe);
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
 */
async function handleCheckoutCompleted(session, stripeInstance) {
  console.log('💳 Paiement complété pour la session:', session.id);

  // Récupérer l'email du client (plusieurs sources possibles)
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
    // Créer l'utilisateur dans Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: customerEmail,
      password: randomPassword,
      emailVerified: false,
    });

    console.log('✅ Utilisateur créé avec succès!');
    console.log('   - UID:', userRecord.uid);
    console.log('   - Email:', customerEmail);
    console.log('   - Password:', randomPassword);

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

    // Envoyer un email de bienvenue au client avec le lien
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
        accountBalance: session.amount_total ? session.amount_total / 100 : 0,
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
async function handleSubscriptionChange(subscription, stripeInstance) {
  console.log('📊 Abonnement modifié:', subscription.id);

  const customer = await stripeInstance.customers.retrieve(subscription.customer);
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
async function handleSubscriptionDeleted(subscription, stripeInstance) {
  console.log('🗑️ Abonnement supprimé:', subscription.id);

  const customer = await stripeInstance.customers.retrieve(subscription.customer);
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
 * Envoyer un email de bienvenue
 */
async function sendWelcomeEmail(email, resetLink, session) {
  console.log('📧 Email de bienvenue à envoyer à:', email);
  console.log('   - Lien de réinitialisation:', resetLink);
  console.log('   - Challenge type:', session.metadata?.challengeType);
  console.log('   - Dashboard: https://dash-board-claude-ia.onrender.com/login');

  // Ajouter à la collection 'mail' pour déclencher une extension email
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
