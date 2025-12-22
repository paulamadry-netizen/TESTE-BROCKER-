"use strict";
/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * Version TypeScript avec typage strict
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialiser Firebase Admin
admin.initializeApp();
// Initialiser Stripe avec gestion d'erreur améliorée
let stripe = null;
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
                res.status(500).send('Configuration Stripe manquante - stripe object not found');
                return;
            }
            if (!config.stripe.secret_key) {
                console.error('❌ config.stripe.secret_key est undefined');
                console.error('Stripe config:', JSON.stringify(config.stripe));
                res.status(500).send('Configuration Stripe manquante - secret_key not found');
                return;
            }
            const secretKey = config.stripe.secret_key;
            console.log('✅ Clé Stripe trouvée (premiers chars):', secretKey.substring(0, 10) + '...');
            stripe = new stripe_1.default(secretKey, {
                apiVersion: '2023-10-16'
            });
            console.log('✅ Stripe initialisé avec succès');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Erreur initialisation Stripe:', errorMessage);
            res.status(500).send('Erreur initialisation Stripe: ' + errorMessage);
            return;
        }
    }
    // Vérification de la signature Stripe (sécurité)
    const sig = req.headers['stripe-signature'];
    const config = functions.config();
    const webhookSecret = config.stripe?.webhook_secret;
    if (!sig || typeof sig !== 'string') {
        res.status(400).send('Missing stripe-signature header');
        return;
    }
    let event;
    try {
        // Vérifier que la requête vient bien de Stripe
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
            console.log('✅ Signature webhook vérifiée');
        }
        else {
            console.warn('⚠️ Pas de webhook secret configuré, signature non vérifiée');
            event = req.body;
        }
    }
    catch (err) {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erreur traitement webhook:', errorMessage);
        res.status(500).json({ error: errorMessage });
    }
});
/**
 * Gérer la complétion d'un paiement Stripe
 * @param session - Session de checkout Stripe
 * @param stripeInstance - Instance Stripe initialisée
 */
async function handleCheckoutCompleted(session, stripeInstance) {
    console.log('💳 Paiement complété pour la session:', session.id);
    // Récupérer l'email du client (plusieurs sources possibles)
    const customerEmail = session.customer_details?.email ||
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
        const customerId = typeof session.customer === 'string' ? session.customer : '';
        const amountTotal = session.amount_total || 0;
        const profitTarget = session.metadata?.profitTarget ? parseFloat(session.metadata.profitTarget) : 10;
        const maxDrawdown = session.metadata?.maxDrawdown ? parseFloat(session.metadata.maxDrawdown) : 5;
        const userData = {
            email: customerEmail,
            stripeCustomerId: customerId,
            stripeSessionId: session.id,
            challengeType: session.metadata?.challengeType || 'standard',
            accountBalance: amountTotal / 100,
            accountStatus: 'active',
            profitTarget,
            maxDrawdown,
            tradingDays: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await admin.firestore().collection('users').doc(userRecord.uid).set(userData);
        console.log('✅ Document Firestore créé');
        // Générer un lien de réinitialisation de mot de passe
        const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);
        console.log('🔗 Lien de réinitialisation généré');
        console.log('   Link:', resetLink);
        // Envoyer un email de bienvenue au client avec le lien
        await sendWelcomeEmail(customerEmail, resetLink, session);
        console.log('✅ Traitement terminé avec succès pour:', customerEmail);
    }
    catch (error) {
        // Si l'utilisateur existe déjà, mettre à jour ses données
        if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/email-already-exists') {
            console.log('ℹ️ Utilisateur existe déjà:', customerEmail);
            const existingUser = await admin.auth().getUserByEmail(customerEmail);
            const customerId = typeof session.customer === 'string' ? session.customer : '';
            const amountTotal = session.amount_total || 0;
            await admin.firestore().collection('users').doc(existingUser.uid).update({
                stripeCustomerId: customerId,
                stripeSessionId: session.id,
                accountStatus: 'active',
                accountBalance: amountTotal / 100,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log('✅ Données utilisateur mises à jour');
        }
        else {
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
async function handleSubscriptionChange(subscription, stripeInstance) {
    console.log('📊 Abonnement modifié:', subscription.id);
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    const customer = await stripeInstance.customers.retrieve(customerId);
    const email = customer.email;
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erreur mise à jour abonnement:', errorMessage);
    }
}
/**
 * Gérer la suppression d'abonnement
 * @param subscription - Objet abonnement Stripe
 * @param stripeInstance - Instance Stripe initialisée
 */
async function handleSubscriptionDeleted(subscription, stripeInstance) {
    console.log('🗑️ Abonnement supprimé:', subscription.id);
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    const customer = await stripeInstance.customers.retrieve(customerId);
    const email = customer.email;
    if (!email)
        return;
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.firestore().collection('users').doc(user.uid).update({
            accountStatus: 'inactive',
            subscriptionStatus: 'canceled',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('✅ Compte désactivé pour:', email);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erreur désactivation compte:', errorMessage);
    }
}
/**
 * Générer un mot de passe aléatoire sécurisé
 * @returns Mot de passe généré aléatoirement
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
 * @param email - Email du destinataire
 * @param resetLink - Lien de réinitialisation du mot de passe
 * @param session - Session de checkout Stripe
 */
async function sendWelcomeEmail(email, resetLink, session) {
    console.log('📧 Email de bienvenue à envoyer à:', email);
    console.log('   - Lien de réinitialisation:', resetLink);
    console.log('   - Challenge type:', session.metadata?.challengeType);
    console.log('   - Dashboard: https://dash-board-claude-ia.onrender.com/login');
    // Ajouter à la collection 'mail' pour déclencher une extension email
    try {
        const emailData = {
            to: email,
            template: {
                name: 'welcome',
                data: {
                    email,
                    resetLink,
                    dashboardUrl: 'https://dash-board-claude-ia.onrender.com/login',
                    challengeType: session.metadata?.challengeType || 'standard',
                }
            }
        };
        await admin.firestore().collection('mail').add(emailData);
        console.log('✅ Email ajouté à la queue');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('⚠️ Impossible d\'envoyer l\'email:', errorMessage);
        // Ne pas bloquer si l'email échoue
    }
}
