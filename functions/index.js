/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * CORRECTION : Cette version passe correctement l'email du client à Firebase Auth
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialiser Firebase Admin
admin.initializeApp();

// Initialiser Stripe avec la config Firebase
const stripe = require('stripe')(functions.config().stripe.secret_key);

/**
 * Webhook Stripe - Écoute les événements de paiement
 * URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhook
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
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
