/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * Version TypeScript avec Firebase Functions v2 et Secrets
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { StripeCheckoutSession, StripeSubscription } from './types/stripe.types';
import { UserDocument, EmailTemplate } from './types/firebase.types';

// Initialiser Firebase Admin
admin.initializeApp();

// Définir les secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

/**
 * Webhook Stripe - Écoute les événements de paiement (v2 with Secrets)
 * URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhookV2
 */
export const stripeWebhookV2 = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res): Promise<void> => {
    console.log('🔍 Webhook Stripe appelé (v2 with secrets)');

    // Initialiser Stripe avec le secret
    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: '2023-10-16'
    });

    console.log('✅ Stripe initialisé avec secret');

    // Vérification de la signature Stripe (sécurité)
    const sig = req.headers['stripe-signature'];
    const webhookSecretValue = stripeWebhookSecret.value();

    if (!sig || typeof sig !== 'string') {
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    let event: Stripe.Event;

    try {
      // Vérifier que la requête vient bien de Stripe
      event = stripe.webhooks.constructEvent(
        req.rawBody as Buffer,
        sig,
        webhookSecretValue
      );
      console.log('✅ Signature webhook vérifiée');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Erreur de vérification webhook:', errorMessage);
      res.status(400).send(`Webhook Error: ${errorMessage}`);
      return;
    }

    console.log('✅ Événement Stripe reçu:', event.type);

    // Gérer les différents types d'événements
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as StripeCheckoutSession, stripe);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionChange(event.data.object as StripeSubscription, stripe);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as StripeSubscription, stripe);
          break;

        case 'identity.verification_session.verified':
          await handleKycVerified(event.data.object as any);
          break;

        case 'identity.verification_session.requires_input':
          await handleKycRequiresInput(event.data.object as any);
          break;

        default:
          console.log(`ℹ️ Événement non géré: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Erreur traitement webhook:', errorMessage);
      res.status(500).json({ error: errorMessage });
    }
  }
);

/**
 * Gérer la complétion d'un paiement Stripe
 * @param session - Session de checkout Stripe
 * @param stripeInstance - Instance Stripe initialisée
 */
async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  stripeInstance: Stripe
): Promise<void> {
  console.log('💳 Paiement complété pour la session:', session.id);

  // Récupérer l'email du client (plusieurs sources possibles)
  const customerEmail: string | undefined =
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
  const randomPassword: string = generateSecurePassword();

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
    const customerId = typeof session.customer === 'string' ? session.customer : '';
    const amountTotal = session.amount_total || 0;
    const amountInEuros = amountTotal / 100; // Stripe utilise les centimes

    // Déterminer le capital de trading en fonction du montant payé
    const tradingCapital = determineTradingCapital(amountInEuros);
    const planName = tradingCapital === 100000 ? 'Or' : tradingCapital === 50000 ? 'Argent' : 'Bronze';
    const accountName = `Challenge ${planName} #1`;

    console.log(`💰 Montant payé: ${amountInEuros}€ → Capital de trading: ${tradingCapital}$`);

    // Créer le premier compte dans la sous-collection accounts
    const accountRef = await admin.firestore()
      .collection('users').doc(userRecord.uid)
      .collection('accounts').add({
        accountName: accountName,
        stripeSessionId: session.id,
        accountStatus: 'active',
        accountBalance: tradingCapital,
        initialBalance: tradingCapital,
        brokerPassword: randomPassword,
        challengeType: 'standard',
        planType: planName,
        profitTarget: 10,
        maxDrawdown: 5,
        tradingDays: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log('✅ Premier compte créé:', accountRef.id, '-', accountName);

    // Créer le document utilisateur principal
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: customerEmail,
      stripeCustomerId: customerId,
      activeAccountId: accountRef.id,
      totalAccounts: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Document utilisateur créé');

    // Envoyer un email de bienvenue au client avec le mot de passe
    await sendWelcomeEmail(customerEmail, randomPassword, session, accountName);

    console.log('✅ Traitement terminé avec succès pour:', customerEmail);

  } catch (error) {
    // Si l'utilisateur existe déjà, créer un nouveau compte (challenge) pour lui
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/email-already-exists') {
      console.log('ℹ️ Utilisateur existe déjà, création d\'un nouveau compte:', customerEmail);

      const existingUser = await admin.auth().getUserByEmail(customerEmail);
      const customerId = typeof session.customer === 'string' ? session.customer : '';
      const amountTotal = session.amount_total || 0;
      const amountInEuros = amountTotal / 100;
      const tradingCapital = determineTradingCapital(amountInEuros);
      const planName = tradingCapital === 100000 ? 'Or' : tradingCapital === 50000 ? 'Argent' : 'Bronze';

      // Générer un mot de passe unique pour ce compte broker
      const brokerPassword: string = generateSecurePassword();
      console.log('🔐 Mot de passe broker généré pour nouveau compte');

      // Compter les comptes existants pour générer un numéro
      const accountsSnapshot = await admin.firestore()
        .collection('users').doc(existingUser.uid)
        .collection('accounts').get();
      const accountNumber = accountsSnapshot.size + 1;
      const accountName = `Challenge ${planName} #${accountNumber}`;

      // Créer un nouveau compte dans la sous-collection accounts
      const newAccountRef = await admin.firestore()
        .collection('users').doc(existingUser.uid)
        .collection('accounts').add({
          accountName: accountName,
          stripeSessionId: session.id,
          accountStatus: 'active',
          accountBalance: tradingCapital,
          initialBalance: tradingCapital,
          brokerPassword: brokerPassword,
          challengeType: 'standard',
          planType: planName,
          profitTarget: 10,
          maxDrawdown: 5,
          tradingDays: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log('✅ Nouveau compte créé:', newAccountRef.id, '-', accountName);

      // Mettre à jour le document utilisateur principal avec le dernier compte actif
      await admin.firestore().collection('users').doc(existingUser.uid).set({
        email: customerEmail,
        stripeCustomerId: customerId,
        activeAccountId: newAccountRef.id,
        totalAccounts: accountNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Envoyer l'email avec les identifiants broker
      await sendWelcomeEmail(customerEmail, brokerPassword, session, accountName);
      console.log('✅ Email envoyé avec identifiants broker');
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Erreur création utilisateur:', errorMessage);
      throw error;
    }
  }
}

/**
 * Gérer les changements d'abonnement
 * @param subscription - Objet abonnement Stripe
 * @param stripeInstance - Instance Stripe initialisée
 */
async function handleSubscriptionChange(
  subscription: StripeSubscription,
  stripeInstance: Stripe
): Promise<void> {
  console.log('📊 Abonnement modifié:', subscription.id);

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  const customer = await stripeInstance.customers.retrieve(customerId) as Stripe.Customer;
  const email: string | null = customer.email;

  if (!email) {
    console.error('❌ Email manquant pour le customer:', customerId);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erreur mise à jour abonnement:', errorMessage);
  }
}

/**
 * Gérer la suppression d'abonnement
 * @param subscription - Objet abonnement Stripe
 * @param stripeInstance - Instance Stripe initialisée
 */
async function handleSubscriptionDeleted(
  subscription: StripeSubscription,
  stripeInstance: Stripe
): Promise<void> {
  console.log('🗑️ Abonnement supprimé:', subscription.id);

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  const customer = await stripeInstance.customers.retrieve(customerId) as Stripe.Customer;
  const email: string | null = customer.email;

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erreur désactivation compte:', errorMessage);
  }
}
/**
 * Déterminer le capital de trading en fonction du montant payé
 * Plans:
 * - 200€ → 25 000$ (Plan Bronze)
 * - 285€ → 50 000$ (Plan Argent)
 * - 550€ → 100 000$ (Plan Or)
 * @param amountInEuros - Montant payé en euros
 * @returns Capital de trading (25000, 50000 ou 100000)
 */
function determineTradingCapital(amountInEuros: number): number {
  // Plan Bronze: 200€ → 25 000$
  if (amountInEuros >= 180 && amountInEuros <= 220) {
    return 25000;
  }
  // Plan Argent: 285€ → 50 000$
  else if (amountInEuros >= 260 && amountInEuros <= 310) {
    return 50000;
  }
  // Plan Or: 550€ → 100 000$
  else if (amountInEuros >= 500 && amountInEuros <= 600) {
    return 100000;
  }

  // Par défaut, si le montant ne correspond à aucune tranche
  console.warn(`⚠️ Montant ${amountInEuros}€ ne correspond à aucune tranche connue. Capital par défaut: 25000$`);
  return 25000;
}

/**
 * Générer un mot de passe aléatoire sécurisé
 * @returns Mot de passe généré aléatoirement
 */
function generateSecurePassword(): string {
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
 * @param email - Email du destinataire
 * @param password - Mot de passe généré automatiquement
 * @param session - Session de checkout Stripe
 */
async function sendWelcomeEmail(
  email: string,
  password: string,
  session: StripeCheckoutSession,
  accountName?: string
): Promise<void> {
  const amountTotal = session.amount_total || 0;
  const amountInEuros = amountTotal / 100;
  const tradingCapital = determineTradingCapital(amountInEuros);
  const planName = accountName || (tradingCapital === 100000 ? 'Plan Or' : tradingCapital === 50000 ? 'Plan Argent' : 'Plan Bronze');
  
  console.log('📧 Email de bienvenue à envoyer à:', email);
  console.log('   - Plan:', planName, '- Capital:', tradingCapital + '$');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0e1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1a1f2e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00d9b8,#00f0cc);padding:40px;text-align:center;">
              <h1 style="margin:0;color:#0a0e1a;font-size:32px;font-weight:700;">AMA Firm</h1>
              <p style="margin:10px 0 0;color:#0a0e1a;font-size:14px;opacity:0.8;">Pro Trading Platform</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#00d9b8;font-size:24px;margin:0 0 20px;">🎉 Félicitations !</h2>
              <p style="color:#e8edf4;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Votre compte de trading <strong style="color:#00d9b8;">${planName}</strong> a été activé avec succès !
              </p>
              <p style="color:#9ba3b4;font-size:14px;line-height:1.6;margin:0 0 30px;">
                Vous disposez maintenant d'un capital de <strong style="color:#00d9b8;">${tradingCapital.toLocaleString('fr-FR')} $</strong> pour relever le challenge et devenir un trader financé.
              </p>
              
              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1419;border-radius:12px;border:1px solid #252b3d;margin-bottom:30px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="color:#9ba3b4;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Vos identifiants de connexion</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#9ba3b4;font-size:14px;">Email :</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <span style="color:#e8edf4;font-size:14px;font-weight:600;">${email}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#9ba3b4;font-size:14px;">Mot de passe :</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <code style="background-color:#252b3d;color:#00d9b8;padding:4px 12px;border-radius:6px;font-size:14px;font-family:monospace;">${password}</code>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://teste-brocker.web.app/login.html" style="display:inline-block;background:linear-gradient(135deg,#00d9b8,#00f0cc);color:#0a0e1a;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600;">
                      Accéder à la plateforme
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Rules Reminder -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;background-color:#0f1419;border-radius:12px;border:1px solid #252b3d;">
                <tr>
                  <td style="padding:24px;">
                    <p style="color:#00d9b8;font-size:14px;font-weight:600;margin:0 0 12px;">📋 Règles du Challenge</p>
                    <ul style="color:#9ba3b4;font-size:13px;line-height:1.8;margin:0;padding-left:20px;">
                      <li>Objectif de profit : <strong style="color:#e8edf4;">10%</strong></li>
                      <li>Drawdown journalier max : <strong style="color:#e8edf4;">3%</strong></li>
                      <li>Drawdown total max : <strong style="color:#e8edf4;">8%</strong></li>
                      <li>Minimum 3 jours de trading</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#0f1419;padding:30px;text-align:center;border-top:1px solid #252b3d;">
              <p style="color:#9ba3b4;font-size:13px;margin:0 0 10px;">
                Besoin d'aide ? Contactez-nous à <a href="mailto:support@amafirm.com" style="color:#00d9b8;text-decoration:none;">support@amafirm.com</a>
              </p>
              <p style="color:#6b7280;font-size:12px;margin:0;">
                © 2024 AMA Firm. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await admin.firestore().collection('mail').add({
      to: email,
      message: {
        subject: `🎉 Bienvenue chez AMA Firm - Votre ${planName} est activé !`,
        text: `Bienvenue chez AMA Firm !\n\nEmail: ${email}\nMot de passe: ${password}\n\nAccès: https://teste-brocker.web.app/login.html`,
        html: htmlContent
      }
    });
    console.log('✅ Email ajouté à la file Firestore mail');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('⚠️ Impossible d\'envoyer l\'email:', errorMessage);
  }
}

/**
 * Gérer la vérification KYC complétée
 * @param verificationSession - Session de vérification Stripe Identity
 */
async function handleKycVerified(verificationSession: any): Promise<void> {
  console.log('✅ Vérification KYC complétée:', verificationSession.id);

  const userId = verificationSession.metadata?.userId;

  if (!userId) {
    console.error('❌ User ID manquant dans les métadonnées de la vérification');
    return;
  }

  try {
    // Mettre à jour le statut KYC de l'utilisateur
    await admin.firestore().collection('users').doc(userId).update({
      kycVerified: true,
      kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      kycVerificationId: verificationSession.id,
      kycStatus: verificationSession.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Statut KYC mis à jour pour:', userId);

    // Log d'audit
    await admin.firestore().collection('audit_logs').add({
      action: 'kyc_verified',
      userId,
      details: {
        verificationId: verificationSession.id,
        status: verificationSession.status
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erreur mise à jour KYC:', errorMessage);
  }
}

/**
 * Gérer les vérifications KYC nécessitant une action
 * @param verificationSession - Session de vérification Stripe Identity
 */
async function handleKycRequiresInput(verificationSession: any): Promise<void> {
  console.log('⚠️ Vérification KYC nécessite une action:', verificationSession.id);

  const userId = verificationSession.metadata?.userId;

  if (!userId) {
    console.error('❌ User ID manquant dans les métadonnées de la vérification');
    return;
  }

  try {
    await admin.firestore().collection('users').doc(userId).update({
      kycStatus: 'requires_input',
      kycLastCheckId: verificationSession.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Statut KYC updated (requires input) pour:', userId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erreur mise à jour KYC:', errorMessage);
  }
}

// ==========================================
// FONCTION: CRÉER UNE SESSION DE VÉRIFICATION KYC
// ==========================================

/**
 * Créer une session de vérification Stripe Identity (KYC)
 */
export const createKycVerification = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Non authentifié');
    }

    const userId = request.auth.uid;

    console.log(`🔐 Création session KYC pour: ${userId}`);

    // Charger l'utilisateur
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'Utilisateur introuvable');
    }

    const userData = userDoc.data()!;

    // Vérifier si déjà vérifié
    if (userData.kycVerified) {
      throw new HttpsError('failed-precondition', 'Vous êtes déjà vérifié');
    }

    try {
      // Initialiser Stripe
      const stripe = new Stripe(stripeSecretKey.value(), {
        apiVersion: '2023-10-16'
      });

      // Créer la session de vérification
      const verificationSession = await stripe.identity.verificationSessions.create({
        type: 'document',
        metadata: {
          userId: userId
        },
        options: {
          document: {
            // Accepter les passeports, cartes d'identité et permis de conduire
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_matching_selfie: true // Selfie pour vérifier l'identité
          }
        }
      });

      console.log('✅ Session KYC créée:', verificationSession.id);

      // Sauvegarder la session ID dans Firestore
      await admin.firestore().collection('users').doc(userId).update({
        kycSessionId: verificationSession.id,
        kycStatus: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log d'audit
      await admin.firestore().collection('audit_logs').add({
        action: 'kyc_session_created',
        userId,
        details: {
          sessionId: verificationSession.id
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        sessionId: verificationSession.id,
        clientSecret: verificationSession.client_secret,
        url: verificationSession.url
      };

    } catch (error: any) {
      console.error('❌ Erreur création session KYC:', error);
      throw new HttpsError('internal', `Erreur: ${error.message}`);
    }
  }
);

// ==========================================
// EXPORT DES FONCTIONS DE SÉCURITÉ TRADING
// ==========================================

export {
  executeTrade,
  closeTrade,
  updateTradingDays,
  calculateDrawdowns,
  closeTradesBeforeWeekend,
  upgradeChallenge,
  requestPayout,
  approvePayout
} from './tradeSecurity';

// ==========================================
// SURVEILLANCE SL/TP ET ORDRES EN ATTENTE
// ==========================================

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as https from 'https';

const PRICE_ENGINE_URL = 'https://ig-price-engine-44407447466.europe-west1.run.app';

interface PriceData {
  bid: number;
  offer: number;
}

interface PricesResponse {
  prices: { [symbol: string]: PriceData };
}

function httpGet(url: string): Promise<PricesResponse> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
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
export const checkSlTp = onSchedule('every 1 minutes', async () => {
  console.log('🔍 Vérification des SL/TP...');
  
  try {
    const tradesSnapshot = await admin.firestore()
      .collection('trades')
      .where('status', '==', 'open')
      .get();
    
    if (tradesSnapshot.empty) {
      console.log('ℹ️ Aucune position ouverte');
      return;
    }
    
    console.log(`📊 ${tradesSnapshot.size} positions ouvertes à vérifier`);
    
    const positionsBySymbol: { [symbol: string]: any[] } = {};
    tradesSnapshot.forEach(doc => {
      const trade = doc.data();
      if (!trade.symbolApi) return;
      if (!positionsBySymbol[trade.symbolApi]) {
        positionsBySymbol[trade.symbolApi] = [];
      }
      positionsBySymbol[trade.symbolApi].push({ id: doc.id, ...trade });
    });
    
    let prices: { [symbol: string]: PriceData } = {};
    
    try {
      const pricesData = await httpGet(`${PRICE_ENGINE_URL}/api/prices`);
      if (pricesData && pricesData.prices) {
        prices = pricesData.prices;
      }
    } catch (e: any) {
      console.error('❌ Erreur récupération prix:', e.message);
      return;
    }
    
    const closedTrades: any[] = [];
    
    for (const symbol of Object.keys(positionsBySymbol)) {
      const currentPrice = prices[symbol];
      if (!currentPrice) {
        console.log(`⚠️ Pas de prix pour ${symbol}`);
        continue;
      }
      
      const mid = (currentPrice.bid + currentPrice.offer) / 2;
      
      for (const trade of positionsBySymbol[symbol]) {
        const { id, side, takeProfit, stopLoss, entryPrice, lots, userId } = trade;
        
        if (!takeProfit && !stopLoss) continue;
        
        let shouldClose = false;
        let closeReason = '';
        let closePrice = mid;
        
        if (side === 'BUY') {
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
          console.log(`🎯 ${closeReason} touché pour ${symbol} (${side}) - Prix: ${mid}`);
          
          const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
          const pips = side === 'BUY' 
            ? (closePrice - entryPrice) / pipValue 
            : (entryPrice - closePrice) / pipValue;
          const pnl = pips * lots * 10;
          
          await admin.firestore().collection('trades').doc(id).update({
            status: 'closed',
            closePrice: closePrice,
            pnl: pnl,
            closeReason: closeReason,
            closedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          
          if (userId) {
            const userRef = admin.firestore().collection('users').doc(userId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              const newBalance = (userData?.accountBalance || 0) + pnl;
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
    }
  } catch (error: any) {
    console.error('❌ Erreur checkSlTp:', error);
  }
});

/**
 * Surveillance des ordres limites - Exécutée toutes les minutes
 */
export const checkPendingOrders = onSchedule('every 1 minutes', async () => {
  console.log('🔍 Vérification des ordres en attente...');
  
  try {
    const ordersSnapshot = await admin.firestore()
      .collection('orders')
      .where('status', '==', 'pending')
      .get();
    
    if (ordersSnapshot.empty) {
      console.log('ℹ️ Aucun ordre en attente');
      return;
    }
    
    console.log(`📊 ${ordersSnapshot.size} ordres en attente à vérifier`);
    
    const ordersBySymbol: { [symbol: string]: any[] } = {};
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      if (!order.symbolApi) return;
      if (!ordersBySymbol[order.symbolApi]) {
        ordersBySymbol[order.symbolApi] = [];
      }
      ordersBySymbol[order.symbolApi].push({ id: doc.id, ...order });
    });
    
    let prices: { [symbol: string]: PriceData } = {};
    
    try {
      const pricesData = await httpGet(`${PRICE_ENGINE_URL}/api/prices`);
      if (pricesData && pricesData.prices) {
        prices = pricesData.prices;
      }
    } catch (e: any) {
      console.error('❌ Erreur récupération prix:', e.message);
      return;
    }
    
    const executedOrders: any[] = [];
    
    for (const symbol of Object.keys(ordersBySymbol)) {
      const currentPrice = prices[symbol];
      if (!currentPrice) continue;
      
      const mid = (currentPrice.bid + currentPrice.offer) / 2;
      
      for (const order of ordersBySymbol[symbol]) {
        const { id, side, orderType, price, lots, takeProfit, stopLoss, userId } = order;
        
        let shouldExecute = false;
        
        if (orderType === 'limit') {
          if (side === 'BUY' && mid <= price) shouldExecute = true;
          if (side === 'SELL' && mid >= price) shouldExecute = true;
        } else if (orderType === 'stop') {
          if (side === 'BUY' && mid >= price) shouldExecute = true;
          if (side === 'SELL' && mid <= price) shouldExecute = true;
        }
        
        if (shouldExecute) {
          console.log(`🎯 Ordre ${orderType} exécuté: ${side} ${symbol} @ ${price}`);
          
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
    }
  } catch (error: any) {
    console.error('❌ Erreur checkPendingOrders:', error);
  }
});
