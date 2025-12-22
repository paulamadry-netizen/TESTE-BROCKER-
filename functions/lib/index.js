"use strict";
/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * Version TypeScript avec Firebase Functions v2 et Secrets
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
exports.approvePayout = exports.requestPayout = exports.upgradeChallenge = exports.closeTradesBeforeWeekend = exports.calculateDrawdowns = exports.updateTradingDays = exports.closeTrade = exports.executeTrade = exports.createKycVerification = exports.stripeWebhookV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialiser Firebase Admin
admin.initializeApp();
// Définir les secrets
const stripeSecretKey = (0, params_1.defineSecret)('STRIPE_SECRET_KEY');
const stripeWebhookSecret = (0, params_1.defineSecret)('STRIPE_WEBHOOK_SECRET');
/**
 * Webhook Stripe - Écoute les événements de paiement (v2 with Secrets)
 * URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhookV2
 */
exports.stripeWebhookV2 = (0, https_1.onRequest)({ secrets: [stripeSecretKey, stripeWebhookSecret] }, async (req, res) => {
    console.log('🔍 Webhook Stripe appelé (v2 with secrets)');
    // Initialiser Stripe avec le secret
    const stripe = new stripe_1.default(stripeSecretKey.value(), {
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
    let event;
    try {
        // Vérifier que la requête vient bien de Stripe
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecretValue);
        console.log('✅ Signature webhook vérifiée');
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
            case 'identity.verification_session.verified':
                await handleKycVerified(event.data.object);
                break;
            case 'identity.verification_session.requires_input':
                await handleKycRequiresInput(event.data.object);
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
    var _a, _b, _c, _d, _e;
    console.log('💳 Paiement complété pour la session:', session.id);
    // Récupérer l'email du client (plusieurs sources possibles)
    const customerEmail = ((_a = session.customer_details) === null || _a === void 0 ? void 0 : _a.email) ||
        session.customer_email ||
        ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.email);
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
        const amountInEuros = amountTotal / 100; // Stripe utilise les centimes
        // Déterminer le capital de trading en fonction du montant payé
        const tradingCapital = determineTradingCapital(amountInEuros);
        console.log(`💰 Montant payé: ${amountInEuros}€ → Capital de trading: ${tradingCapital}€`);
        const profitTarget = ((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.profitTarget) ? parseFloat(session.metadata.profitTarget) : 10;
        const maxDrawdown = ((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.maxDrawdown) ? parseFloat(session.metadata.maxDrawdown) : 5;
        const userData = {
            email: customerEmail,
            stripeCustomerId: customerId,
            stripeSessionId: session.id,
            challengeType: ((_e = session.metadata) === null || _e === void 0 ? void 0 : _e.challengeType) || 'standard',
            accountBalance: tradingCapital,
            accountStatus: 'active',
            profitTarget,
            maxDrawdown,
            tradingDays: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await admin.firestore().collection('users').doc(userRecord.uid).set(userData);
        console.log('✅ Document Firestore créé');
        // Envoyer un email de bienvenue au client avec le mot de passe
        await sendWelcomeEmail(customerEmail, randomPassword, session);
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
 * Déterminer le capital de trading en fonction du montant payé
 * @param amountInEuros - Montant payé en euros
 * @returns Capital de trading (25000, 50000 ou 100000)
 */
function determineTradingCapital(amountInEuros) {
    if (amountInEuros >= 150 && amountInEuros <= 230) {
        return 25000;
    }
    else if (amountInEuros > 230 && amountInEuros <= 330) {
        return 50000;
    }
    else if (amountInEuros >= 450 && amountInEuros <= 650) {
        return 100000;
    }
    // Par défaut, si le montant ne correspond à aucune tranche, utiliser 25000
    console.warn(`⚠️ Montant ${amountInEuros}€ ne correspond à aucune tranche connue. Capital par défaut: 25000€`);
    return 25000;
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
 * @param password - Mot de passe généré automatiquement
 * @param session - Session de checkout Stripe
 */
async function sendWelcomeEmail(email, password, session) {
    var _a, _b;
    console.log('📧 Email de bienvenue à envoyer à:', email);
    console.log('   - Mot de passe:', password);
    console.log('   - Challenge type:', (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.challengeType);
    console.log('   - Dashboard: https://dash-board-claude-ia.onrender.com/login');
    // Ajouter à la collection 'mail' pour déclencher une extension email
    try {
        const emailData = {
            to: email,
            template: {
                name: 'welcome',
                data: {
                    email,
                    password,
                    dashboardUrl: 'https://dash-board-claude-ia.onrender.com/login',
                    challengeType: ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.challengeType) || 'standard',
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
/**
 * Gérer la vérification KYC complétée
 * @param verificationSession - Session de vérification Stripe Identity
 */
async function handleKycVerified(verificationSession) {
    var _a;
    console.log('✅ Vérification KYC complétée:', verificationSession.id);
    const userId = (_a = verificationSession.metadata) === null || _a === void 0 ? void 0 : _a.userId;
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Erreur mise à jour KYC:', errorMessage);
    }
}
/**
 * Gérer les vérifications KYC nécessitant une action
 * @param verificationSession - Session de vérification Stripe Identity
 */
async function handleKycRequiresInput(verificationSession) {
    var _a;
    console.log('⚠️ Vérification KYC nécessite une action:', verificationSession.id);
    const userId = (_a = verificationSession.metadata) === null || _a === void 0 ? void 0 : _a.userId;
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
    }
    catch (error) {
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
exports.createKycVerification = (0, https_1.onCall)({ secrets: [stripeSecretKey] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Non authentifié');
    }
    const userId = request.auth.uid;
    console.log(`🔐 Création session KYC pour: ${userId}`);
    // Charger l'utilisateur
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Utilisateur introuvable');
    }
    const userData = userDoc.data();
    // Vérifier si déjà vérifié
    if (userData.kycVerified) {
        throw new https_1.HttpsError('failed-precondition', 'Vous êtes déjà vérifié');
    }
    try {
        // Initialiser Stripe
        const stripe = new stripe_1.default(stripeSecretKey.value(), {
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
    }
    catch (error) {
        console.error('❌ Erreur création session KYC:', error);
        throw new https_1.HttpsError('internal', `Erreur: ${error.message}`);
    }
});
// ==========================================
// EXPORT DES FONCTIONS DE SÉCURITÉ TRADING
// ==========================================
var tradeSecurity_1 = require("./tradeSecurity");
Object.defineProperty(exports, "executeTrade", { enumerable: true, get: function () { return tradeSecurity_1.executeTrade; } });
Object.defineProperty(exports, "closeTrade", { enumerable: true, get: function () { return tradeSecurity_1.closeTrade; } });
Object.defineProperty(exports, "updateTradingDays", { enumerable: true, get: function () { return tradeSecurity_1.updateTradingDays; } });
Object.defineProperty(exports, "calculateDrawdowns", { enumerable: true, get: function () { return tradeSecurity_1.calculateDrawdowns; } });
Object.defineProperty(exports, "closeTradesBeforeWeekend", { enumerable: true, get: function () { return tradeSecurity_1.closeTradesBeforeWeekend; } });
Object.defineProperty(exports, "upgradeChallenge", { enumerable: true, get: function () { return tradeSecurity_1.upgradeChallenge; } });
Object.defineProperty(exports, "requestPayout", { enumerable: true, get: function () { return tradeSecurity_1.requestPayout; } });
Object.defineProperty(exports, "approvePayout", { enumerable: true, get: function () { return tradeSecurity_1.approvePayout; } });
//# sourceMappingURL=index.js.map