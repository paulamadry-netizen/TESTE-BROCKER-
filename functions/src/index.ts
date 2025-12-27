/**
 * Cloud Function Firebase pour gérer les webhooks Stripe
 * Version TypeScript avec Firebase Functions v2 et Secrets
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as functionsV1 from 'firebase-functions';
import Stripe from 'stripe';
import { StripeCheckoutSession, StripeSubscription } from './types/stripe.types';
import { UserDocument, EmailTemplate } from './types/firebase.types';

// Initialiser Firebase Admin
admin.initializeApp();

type PurchasedPlanKind = 'challenge' | 'instant_funded';

interface PurchasedPlan {
  code: string;
  kind: PurchasedPlanKind;
  tradingCapital: number;
  planName: string;
  targetPriceEur: number;
}

const PLAN_CATALOG: PurchasedPlan[] = [
  // Challenges
  { code: 'CHALLENGE_25K', kind: 'challenge', tradingCapital: 25000, planName: 'Bronze', targetPriceEur: 200 },
  { code: 'CHALLENGE_50K', kind: 'challenge', tradingCapital: 50000, planName: 'Argent', targetPriceEur: 285 },
  { code: 'CHALLENGE_100K', kind: 'challenge', tradingCapital: 100000, planName: 'Or', targetPriceEur: 550 },

  // Instant funded
  { code: 'INSTANT_2500', kind: 'instant_funded', tradingCapital: 2500, planName: 'Instant 2 500$', targetPriceEur: 112 },
  { code: 'INSTANT_5000', kind: 'instant_funded', tradingCapital: 5000, planName: 'Instant 5 000$', targetPriceEur: 210 },
  { code: 'INSTANT_10000', kind: 'instant_funded', tradingCapital: 10000, planName: 'Instant 10 000$', targetPriceEur: 400 },
  { code: 'INSTANT_20000', kind: 'instant_funded', tradingCapital: 20000, planName: 'Instant 20 000$', targetPriceEur: 770 },
  { code: 'INSTANT_40000', kind: 'instant_funded', tradingCapital: 40000, planName: 'Instant 40 000$', targetPriceEur: 1650 },
  { code: 'INSTANT_80000', kind: 'instant_funded', tradingCapital: 80000, planName: 'Instant 80 000$', targetPriceEur: 3290 },
  { code: 'INSTANT_120000', kind: 'instant_funded', tradingCapital: 120000, planName: 'Instant 120 000$', targetPriceEur: 5000 },
];

function determinePurchasedPlan(amountInEuros: number): PurchasedPlan | null {
  const amount = Number(amountInEuros);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const candidates = PLAN_CATALOG
    .map((p) => {
      const tolerance = Math.max(5, p.targetPriceEur * 0.1);
      const diff = Math.abs(amount - p.targetPriceEur);
      return { p, diff, tolerance };
    })
    .filter((x) => x.diff <= x.tolerance)
    .sort((a, b) => a.diff - b.diff);

  return candidates.length ? candidates[0].p : null;
}

function resolvePurchasedPlanFromSession(session: StripeCheckoutSession, amountInEuros: number): PurchasedPlan {
  const md = (session as any)?.metadata || {};
  const kind = typeof md.planKind === 'string' ? String(md.planKind).trim() : '';
  const code = typeof md.planCode === 'string' ? String(md.planCode).trim() : '';
  const tradingCapitalRaw = typeof md.tradingCapital === 'string' ? String(md.tradingCapital).trim() : '';
  const tradingCapital = tradingCapitalRaw ? Number(tradingCapitalRaw) : NaN;

  if (kind && code && Number.isFinite(tradingCapital) && tradingCapital > 0) {
    const matched = PLAN_CATALOG.find((p) => p.code === code);
    if (matched && matched.kind === kind && matched.tradingCapital === tradingCapital) {
      return matched;
    }
  }

  const fallback = determinePurchasedPlan(amountInEuros);
  if (!fallback) {
    console.warn(`⚠️ Montant ${amountInEuros}€ ne correspond à aucune tranche connue.`);
    return PLAN_CATALOG[0];
  }
  return fallback;
}

export const brokerLogin = onCall(
  {
    cors: true,
  },
  async (request) => {
    const data = request.data as { email?: string; identifier?: string; login?: string; password?: string };
    const rawLogin = (data?.login || data?.identifier || data?.email || '').trim();
    const email = rawLogin.includes('@') ? rawLogin.trim().toLowerCase() : '';
    const identifier = !email ? rawLogin.trim().toUpperCase() : '';
    const password = (data?.password || '').trim();

    console.log('🔐 brokerLogin attempt:', {
      hasEmail: Boolean(email),
      hasIdentifier: Boolean(identifier),
      identifier: identifier || null,
    });

    if ((!email && !identifier) || !password) {
      throw new HttpsError('invalid-argument', 'Missing login or password');
    }

    let userRecord: admin.auth.UserRecord;
    try {
      if (email) {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        const mapSnap = await admin.firestore().collection('broker_identifiers').doc(identifier).get();
        if (mapSnap.exists) {
          const mapData = mapSnap.data() as any;
          const mappedUid = typeof mapData?.uid === 'string' ? mapData.uid : '';
          if (!mappedUid) {
            throw new HttpsError('not-found', 'User not found');
          }
          userRecord = await admin.auth().getUser(mappedUid);
        } else {
          // Fallback: si la map n'existe pas (ancien user), tenter via users.brokerIdentifier
          const qSnap = await admin.firestore()
            .collection('users')
            .where('brokerIdentifier', '==', identifier)
            .limit(1)
            .get();
          if (qSnap.empty) {
            throw new HttpsError('not-found', 'User not found');
          }
          const mappedUid = qSnap.docs[0].id;
          userRecord = await admin.auth().getUser(mappedUid);
        }
      }
    } catch (e) {
      throw new HttpsError('not-found', 'User not found');
    }

    const userId = userRecord.uid;

    console.log('🔐 brokerLogin user resolved:', {
      uid: userId,
      via: email ? 'email' : 'identifier',
    });

    const userSnap = await admin.firestore().collection('users').doc(userId).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User profile not found');
    }

    const userData = userSnap.data() as any;
    const activeAccountId: string | undefined = userData?.activeAccountId;

    if (!activeAccountId) {
      throw new HttpsError('failed-precondition', 'No active account');
    }

    const accountSnap = await admin
      .firestore()
      .collection('users')
      .doc(userId)
      .collection('accounts')
      .doc(activeAccountId)
      .get();

    if (!accountSnap.exists) {
      throw new HttpsError('not-found', 'Active account not found');
    }

    const accountData = accountSnap.data() as any;

    let resolvedActiveAccountId = activeAccountId;
    let resolvedAccountData = accountData;
    let matchedVia: 'activeAccountId' | 'otherAccount' = 'activeAccountId';

    // Si le mot de passe ne matche pas l'account actif, on cherche parmi tous les accounts.
    if (!resolvedAccountData?.brokerPassword || resolvedAccountData.brokerPassword !== password) {
      const accountsSnap = await admin
        .firestore()
        .collection('users')
        .doc(userId)
        .collection('accounts')
        .get();

      let foundId: string | null = null;
      let foundData: any = null;

      accountsSnap.forEach((docSnap) => {
        if (foundId) return;
        const d = docSnap.data() as any;
        if (d?.accountStatus && d.accountStatus !== 'active') return;
        if (d?.brokerPassword && d.brokerPassword === password) {
          foundId = docSnap.id;
          foundData = d;
        }
      });

      if (!foundId || !foundData) {
        console.log('🔐 brokerLogin password did not match any account for uid:', userId);
        throw new HttpsError('permission-denied', 'Invalid credentials');
      }

      resolvedActiveAccountId = foundId;
      resolvedAccountData = foundData;
      matchedVia = 'otherAccount';

      // Basculer l'account actif sur celui correspondant au mot de passe
      await admin.firestore().collection('users').doc(userId).set({
        activeAccountId: resolvedActiveAccountId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (resolvedAccountData?.accountStatus && resolvedAccountData.accountStatus !== 'active') {
      throw new HttpsError('failed-precondition', 'Account not active');
    }

    const token = await admin.auth().createCustomToken(userId, {
      activeAccountId: resolvedActiveAccountId,
      broker: true,
    });

    console.log('🔐 brokerLogin success:', {
      uid: userId,
      activeAccountId: resolvedActiveAccountId,
      matchedVia,
    });

    return { token };
  }
);

export const contactPublicHttpV1 = functionsV1.region('us-central1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const data = (req.body || {}) as { email?: string; subject?: string; message?: string };
  const email = String(data?.email || '').trim().toLowerCase();
  const subject = String(data?.subject || '').trim();
  const message = String(data?.message || '').trim();

  if (!email || !email.includes('@') || email.length > 254) {
    res.status(400).json({ success: false, error: 'Email invalide' });
    return;
  }
  if (!subject || subject.length < 3 || subject.length > 120) {
    res.status(400).json({ success: false, error: 'Objet invalide' });
    return;
  }
  if (!message || message.length < 10 || message.length > 5000) {
    res.status(400).json({ success: false, error: 'Message invalide' });
    return;
  }

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

  const supportInbox = 'paul.ama.firm.fr@gmail.com';
  const from = 'AMA FIRM <ama.firm.fr@gmail.com>';

  const text =
    `Nouvelle demande via la vitrine\n\n` +
    `Email: ${email}\n` +
    `Objet: ${subject}\n\n` +
    `${message}`;

  const html = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Contact (vitrine)</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Message envoyé depuis le site vitrine</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;">
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div><strong>Objet:</strong> ${safeSubject}</div>
      </div>
      <div style="margin-top:14px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:1.7;">${safeMessage}</div>
    </div>
  </div>
</body>
</html>`;

  try {
    await admin.firestore().collection('mail').add({
      to: [supportInbox],
      message: {
        from,
        replyTo: email,
        subject: `Contact vitrine — ${subject}`,
        text,
        html,
        headers: {
          'X-AMA-Email': 'contact_public_http_v1',
        },
      },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    const debugId = admin.firestore().collection('contact_public_errors').doc().id;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    const safeRawError = (() => {
      try {
        return JSON.stringify(error);
      } catch (e) {
        return String(error);
      }
    })();

    console.error('❌ contactPublicHttpV1 failed:', {
      debugId,
      errorMessage,
      error,
    });
    if (errorStack) {
      console.error('❌ contactPublicHttpV1 stack:', errorStack);
    }

    try {
      await admin.firestore().collection('contact_public_errors').doc(debugId).set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        email,
        subject,
        messageLength: message.length,
        errorMessage,
        errorStack: errorStack || null,
        rawError: safeRawError,
        source: 'contactPublicHttpV1',
      });
    } catch (logError) {
      const logErrorMessage = logError instanceof Error ? logError.message : 'Unknown log error';
      console.error('❌ contactPublicHttpV1 failed to write debug log:', logErrorMessage);
    }

    res.status(500).json({ success: false, debugId });
  }
});

// Définir les secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

function generateBrokerIdentifier(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'AMA-';
  for (let i = 0; i < 8; i++) {
    out += charset[Math.floor(Math.random() * charset.length)];
  }
  return out;
}

async function ensureBrokerIdentifier(uid: string): Promise<string> {
  const userRef = admin.firestore().collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? (userSnap.data() as any)?.brokerIdentifier : null;
  if (typeof existing === 'string' && existing.trim()) {
    const identifier = existing.trim().toUpperCase();
    try {
      await admin.firestore().collection('broker_identifiers').doc(identifier).set({
        uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
    }
    return identifier;
  }

  for (let i = 0; i < 10; i++) {
    const identifier = generateBrokerIdentifier();
    const mapRef = admin.firestore().collection('broker_identifiers').doc(identifier);
    try {
      await mapRef.create({
        uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await userRef.set({
        brokerIdentifier: identifier,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return identifier;
    } catch (e) {
    }
  }

  throw new Error('Unable to generate broker identifier');
}

export const createCheckoutFromPaymentLink = onCall(
  {
    cors: true,
    secrets: [stripeSecretKey],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const authEmail = typeof request.auth.token.email === 'string' ? request.auth.token.email : undefined;
    console.log('🧾 createCheckoutFromPaymentLink called:', {
      uid: request.auth.uid,
      email: authEmail || null,
    });

    const data = request.data as { paymentLinkUrl?: string };
    const paymentLinkUrl = (data?.paymentLinkUrl || '').trim();

    console.log('🧾 createCheckoutFromPaymentLink paymentLinkUrl:', paymentLinkUrl);

    if (!paymentLinkUrl) {
      throw new HttpsError('invalid-argument', 'Missing payment link');
    }

    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: '2023-10-16',
    });

    const normalizeStripeUrl = (url: string): string => {
      try {
        return url.trim().replace(/\/+$/, '');
      } catch {
        return (url || '').trim();
      }
    };

    // Retrieve the payment link id from its url
    const normalizedTargetUrl = normalizeStripeUrl(paymentLinkUrl);
    let paymentLink: Stripe.PaymentLink | undefined;
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const paymentLinks = await stripe.paymentLinks.list({
        limit: 100,
        active: true,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      } as any);

      paymentLink = paymentLinks.data.find((pl) => normalizeStripeUrl(pl.url) === normalizedTargetUrl);
      if (paymentLink) break;

      if (!paymentLinks.has_more || paymentLinks.data.length === 0) break;
      startingAfter = paymentLinks.data[paymentLinks.data.length - 1].id;
    }

    if (!paymentLink) {
      throw new HttpsError(
        'not-found',
        'Payment link not found in Stripe. Vérifie que le lien est ACTIF et que la clé Stripe (TEST/LIVE) correspond au Payment Link utilisé.'
      );
    }

    const paymentLinkLineItems = await stripe.paymentLinks.listLineItems(paymentLink.id, {
      limit: 10,
      expand: ['data.price'],
    } as any);

    const line_items = paymentLinkLineItems.data
      .map((li) => {
        const price = li ? (li as any).price : null;
        const priceId = typeof price === 'string' ? price : price?.id;
        if (!priceId) return null;
        return {
          price: priceId,
          quantity: li.quantity || 1,
        };
      })
      .filter((x): x is { price: string; quantity: number } => Boolean(x));

    if (!line_items.length) {
      throw new HttpsError('failed-precondition', 'Payment link has no line items');
    }

    // Calculer le capital du plan à partir du montant (Stripe en centimes)
    const estimatedAmountCents = paymentLinkLineItems.data
      .map((li) => {
        const price = li ? (li as any).price : null;
        const unitAmount = typeof price?.unit_amount === 'number' ? price.unit_amount : null;
        const quantity = typeof li?.quantity === 'number' ? li.quantity : 1;
        if (!unitAmount) return 0;
        return unitAmount * quantity;
      })
      .reduce((sum, v) => sum + v, 0);
    const estimatedAmountEuros = estimatedAmountCents / 100;
    const purchasedPlan = determinePurchasedPlan(estimatedAmountEuros);
    if (!purchasedPlan) {
      throw new HttpsError('invalid-argument', 'Unknown plan');
    }
    const estimatedTradingCapital = purchasedPlan.tradingCapital;

    // ================================
    // LIMITES D'ACHAT
    // - Max 3 challenges actifs en cours
    // - Max 1 000 000 de capital funded cumulé
    // ================================

    const accountsSnap = await admin
      .firestore()
      .collection('users')
      .doc(request.auth.uid)
      .collection('accounts')
      .get();

    let activeChallengesCount = 0;
    let totalFundedCapital = 0;

    accountsSnap.forEach((docSnap) => {
      const a = docSnap.data() as any;
      const status = typeof a?.accountStatus === 'string' ? a.accountStatus : '';
      if (status !== 'active') return;

      const accountTypeRaw = typeof a?.accountType === 'string' ? a.accountType : '';
      const accountKindRaw = typeof a?.accountKind === 'string' ? a.accountKind : '';
      const isFunded = Boolean(a?.isFunded);
      const resolvedType = (accountTypeRaw || accountKindRaw || (isFunded ? 'funded' : 'challenge')).toLowerCase();

      const balanceBase = Number(a?.initialBalance ?? a?.initialFundedBalance ?? a?.accountBalance ?? 0);
      if (resolvedType === 'funded') {
        if (Number.isFinite(balanceBase) && balanceBase > 0) {
          totalFundedCapital += balanceBase;
        }
        return;
      }

      // Par défaut, tout compte actif non-funded compte comme challenge en cours
      activeChallengesCount += 1;
    });

    if (purchasedPlan.kind === 'challenge' && activeChallengesCount >= 3) {
      throw new HttpsError(
        'failed-precondition',
        'Vous avez déjà 3 challenges en cours. Terminez-en un avant d\'en acheter un nouveau.'
      );
    }

    const FUNDED_CAP = 1_000_000;
    if (totalFundedCapital >= FUNDED_CAP) {
      throw new HttpsError(
        'failed-precondition',
        'Plafond de 1 000 000€ de capital financé atteint. Achat de challenge bloqué.'
      );
    }
    if (totalFundedCapital + estimatedTradingCapital > FUNDED_CAP) {
      throw new HttpsError(
        'failed-precondition',
        'Cet achat dépasserait le plafond de 1 000 000€ de capital financé. Achat de challenge bloqué.'
      );
    }

    const baseUrl = 'https://amafirm.web.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      client_reference_id: request.auth.uid,
      customer_email: authEmail,
      success_url: `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?canceled=1`,
      metadata: {
        uid: request.auth.uid,
        authEmail: authEmail || '',
        planCode: purchasedPlan.code,
        planKind: purchasedPlan.kind,
        tradingCapital: String(purchasedPlan.tradingCapital),
      },
    } as any);

    console.log('🧾 createCheckoutFromPaymentLink session created:', {
      sessionId: session.id,
      hasUrl: Boolean(session.url),
      clientReferenceId: request.auth.uid,
    });

    if (!session.url) {
      throw new HttpsError('internal', 'No session url returned');
    }

    return { url: session.url };
  }
);

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

  const uidFromClientReferenceId =
    typeof (session as unknown as { client_reference_id?: unknown }).client_reference_id === 'string'
      ? (session as unknown as { client_reference_id: string }).client_reference_id.trim()
      : '';

  const uidFromMetadataRaw = (session as any)?.metadata?.uid;
  const uidFromMetadata = typeof uidFromMetadataRaw === 'string' ? uidFromMetadataRaw.trim() : '';

  const targetUid = uidFromClientReferenceId || uidFromMetadata;
  const uidSource = uidFromClientReferenceId ? 'client_reference_id' : uidFromMetadata ? 'metadata.uid' : 'none';
  console.log('🧩 UID detection:', { uidSource, targetUid: targetUid || null });

  // Récupérer l'email du client (plusieurs sources possibles)
  const customerEmail: string | undefined =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email;

  const authEmailFromMetadataRaw = (session as any)?.metadata?.authEmail;
  const authEmailFromMetadata = typeof authEmailFromMetadataRaw === 'string' ? authEmailFromMetadataRaw.trim().toLowerCase() : '';

  const resolvedEmailForProcessing = (authEmailFromMetadata || customerEmail || '').trim().toLowerCase();

  if (!resolvedEmailForProcessing) {
    console.error('❌ ERREUR CRITIQUE: Aucun email trouvé dans la session Stripe');
    console.log('Session data:', JSON.stringify(session, null, 2));
    throw new Error('Email manquant dans la session Stripe');
  }

  console.log('📧 Email (Stripe ou Auth):', resolvedEmailForProcessing);

  try {
    await admin.firestore().collection('stripe_webhook_debug').doc(session.id).set({
      event: 'checkout.session.completed',
      sessionId: session.id,
      customerEmail: customerEmail || null,
      authEmailFromMetadata: authEmailFromMetadata || null,
      uidFromClientReferenceId: uidFromClientReferenceId || null,
      uidFromMetadata: uidFromMetadata || null,
      uidSource,
      clientReferenceId: targetUid || null,
      amountTotal: session.amount_total || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('⚠️ Debug write failed (non-blocking)');
  }

  // Générer un mot de passe aléatoire sécurisé
  const randomPassword: string = generateSecurePassword();

  // Si l'achat vient d'un utilisateur déjà connecté, on rattache le challenge à son UID
  if (targetUid) {
    const customerId = typeof session.customer === 'string' ? session.customer : '';
    const amountTotal = session.amount_total || 0;
    const amountInEuros = amountTotal / 100;
    const purchasedPlan = resolvePurchasedPlanFromSession(session, amountInEuros);
    const tradingCapital = purchasedPlan.tradingCapital;
    const planName = purchasedPlan.planName;

    const accountEmail = resolvedEmailForProcessing;

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().getUser(targetUid);
    } catch (e) {
      try {
        userRecord = await admin.auth().createUser({
          uid: targetUid,
          email: accountEmail,
          password: randomPassword,
          emailVerified: false,
        });
      } catch (createErr) {
        // Si l'email existe déjà sur un autre UID, on fallback sur l'utilisateur existant.
        if (createErr && typeof createErr === 'object' && 'code' in createErr && createErr.code === 'auth/email-already-exists') {
          userRecord = await admin.auth().getUserByEmail(accountEmail);
        } else {
          throw createErr;
        }
      }
    }

    const brokerIdentifier = await ensureBrokerIdentifier(userRecord.uid);

    const brokerPassword: string = generateSecurePassword();

    const accountsSnapshot = await admin.firestore()
      .collection('users').doc(userRecord.uid)
      .collection('accounts').get();
    const accountNumber = accountsSnapshot.size + 1;
    const accountName = purchasedPlan.kind === 'instant_funded'
      ? `Financement instantané ${tradingCapital.toLocaleString('fr-FR')} $ #${accountNumber}`
      : `Challenge ${planName} #${accountNumber}`;

    const newAccountRef = await admin.firestore()
      .collection('users').doc(userRecord.uid)
      .collection('accounts').add({
        accountName: accountName,
        stripeSessionId: session.id,
        accountStatus: 'active',
        accountBalance: tradingCapital,
        initialBalance: tradingCapital,
        brokerPassword: brokerPassword,
        accountType: purchasedPlan.kind === 'instant_funded' ? 'funded' : 'challenge',
        isFunded: purchasedPlan.kind === 'instant_funded',
        fundedAt: purchasedPlan.kind === 'instant_funded' ? admin.firestore.FieldValue.serverTimestamp() : null,
        initialFundedBalance: purchasedPlan.kind === 'instant_funded' ? tradingCapital : null,
        challengeType: purchasedPlan.kind === 'instant_funded' ? 'instant_funded' : 'standard',
        planType: planName,
        profitTarget: purchasedPlan.kind === 'instant_funded' ? 0 : 10,
        maxDrawdown: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
        maxTotalDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
        maxDailyDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? null : 3,
        tradingDays: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      stripeCustomerId: customerId,
      activeAccountId: newAccountRef.id,
      totalAccounts: accountNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const destinationEmail = (userRecord.email || accountEmail).trim().toLowerCase();
    await sendWelcomeEmail(destinationEmail, brokerIdentifier, brokerPassword, session, accountName);
    console.log('✅ Challenge rattaché à l\'UID:', userRecord.uid, '- Compte:', newAccountRef.id);

    try {
      await admin.firestore().collection('stripe_webhook_debug').doc(session.id).set({
        resolvedUid: userRecord.uid,
        createdAccountId: newAccountRef.id,
        branch: 'client_reference_id',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('⚠️ Debug update failed (non-blocking)');
    }

    return;
  }

  try {
    // Créer l'utilisateur dans Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: resolvedEmailForProcessing,
      password: randomPassword,
      emailVerified: false,
    });

    const brokerIdentifier = await ensureBrokerIdentifier(userRecord.uid);

    console.log('✅ Utilisateur créé avec succès!');
    console.log('   - UID:', userRecord.uid);
    console.log('   - Email:', customerEmail);
    console.log('   - Password:', randomPassword);

    // Créer le document utilisateur dans Firestore
    const customerId = typeof session.customer === 'string' ? session.customer : '';
    const amountTotal = session.amount_total || 0;
    const amountInEuros = amountTotal / 100; // Stripe utilise les centimes

    // Déterminer le capital de trading en fonction du montant payé
    const purchasedPlan = resolvePurchasedPlanFromSession(session, amountInEuros);
    const tradingCapital = purchasedPlan.tradingCapital;
    const planName = purchasedPlan.planName;
    const accountName = purchasedPlan.kind === 'instant_funded'
      ? `Financement instantané ${tradingCapital.toLocaleString('fr-FR')} $ #1`
      : `Challenge ${planName} #1`;

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
        accountType: purchasedPlan.kind === 'instant_funded' ? 'funded' : 'challenge',
        isFunded: purchasedPlan.kind === 'instant_funded',
        fundedAt: purchasedPlan.kind === 'instant_funded' ? admin.firestore.FieldValue.serverTimestamp() : null,
        initialFundedBalance: purchasedPlan.kind === 'instant_funded' ? tradingCapital : null,
        challengeType: purchasedPlan.kind === 'instant_funded' ? 'instant_funded' : 'standard',
        planType: planName,
        profitTarget: purchasedPlan.kind === 'instant_funded' ? 0 : 10,
        maxDrawdown: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
        maxTotalDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
        maxDailyDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? null : 3,
        tradingDays: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log('✅ Premier compte créé:', accountRef.id, '-', accountName);

    // Créer le document utilisateur principal
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email: resolvedEmailForProcessing,
      stripeCustomerId: customerId,
      activeAccountId: accountRef.id,
      totalAccounts: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Document utilisateur créé');

    // Envoyer un email de bienvenue au client avec le mot de passe
    await sendWelcomeEmail(resolvedEmailForProcessing, brokerIdentifier, randomPassword, session, accountName);

    console.log('✅ Traitement terminé avec succès pour:', resolvedEmailForProcessing);

  } catch (error) {
    // Si l'utilisateur existe déjà, créer un nouveau compte (challenge) pour lui
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/email-already-exists') {
      console.log('ℹ️ Utilisateur existe déjà, création d\'un nouveau compte:', resolvedEmailForProcessing);

      const existingUser = await admin.auth().getUserByEmail(resolvedEmailForProcessing);
      const brokerIdentifier = await ensureBrokerIdentifier(existingUser.uid);
      const customerId = typeof session.customer === 'string' ? session.customer : '';
      const amountTotal = session.amount_total || 0;
      const amountInEuros = amountTotal / 100;
      const purchasedPlan = resolvePurchasedPlanFromSession(session, amountInEuros);
      const tradingCapital = purchasedPlan.tradingCapital;
      const planName = purchasedPlan.planName;

      // Générer un mot de passe unique pour ce compte broker
      const brokerPassword: string = generateSecurePassword();
      console.log('🔐 Mot de passe broker généré pour nouveau compte');

      // Compter les comptes existants pour générer un numéro
      const accountsSnapshot = await admin.firestore()
        .collection('users').doc(existingUser.uid)
        .collection('accounts').get();
      const accountNumber = accountsSnapshot.size + 1;
      const accountName = purchasedPlan.kind === 'instant_funded'
        ? `Financement instantané ${tradingCapital.toLocaleString('fr-FR')} $ #${accountNumber}`
        : `Challenge ${planName} #${accountNumber}`;

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
          accountType: purchasedPlan.kind === 'instant_funded' ? 'funded' : 'challenge',
          isFunded: purchasedPlan.kind === 'instant_funded',
          fundedAt: purchasedPlan.kind === 'instant_funded' ? admin.firestore.FieldValue.serverTimestamp() : null,
          initialFundedBalance: purchasedPlan.kind === 'instant_funded' ? tradingCapital : null,
          challengeType: purchasedPlan.kind === 'instant_funded' ? 'instant_funded' : 'standard',
          planType: planName,
          profitTarget: purchasedPlan.kind === 'instant_funded' ? 0 : 10,
          maxDrawdown: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
          maxTotalDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? 10 : 8,
          maxDailyDrawdownPercent: purchasedPlan.kind === 'instant_funded' ? null : 3,
          tradingDays: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log('✅ Nouveau compte créé:', newAccountRef.id, '-', accountName);

      // Mettre à jour le document utilisateur principal avec le dernier compte actif
      await admin.firestore().collection('users').doc(existingUser.uid).set({
        email: resolvedEmailForProcessing,
        stripeCustomerId: customerId,
        activeAccountId: newAccountRef.id,
        totalAccounts: accountNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Envoyer l'email avec les identifiants broker
      const destinationEmail = (existingUser.email || resolvedEmailForProcessing).trim().toLowerCase();
      await sendWelcomeEmail(destinationEmail, brokerIdentifier, brokerPassword, session, accountName);
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
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^*_-';
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
  brokerIdentifier: string,
  password: string,
  session: StripeCheckoutSession,
  accountName?: string
): Promise<void> {
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const amountTotal = session.amount_total || 0;
  const amountInEuros = amountTotal / 100;
  const purchasedPlan = resolvePurchasedPlanFromSession(session, amountInEuros);
  const tradingCapital = purchasedPlan.tradingCapital;
  const planName = accountName || (purchasedPlan.kind === 'instant_funded' ? 'Financement instantané' : (tradingCapital === 100000 ? 'Plan Or' : tradingCapital === 50000 ? 'Plan Argent' : 'Plan Bronze'));
  const safePlanName = escapeHtml(planName);
  const safeEmail = escapeHtml(email);
  const safeBrokerIdentifier = escapeHtml(brokerIdentifier);
  const safePassword = escapeHtml(password);
  const brokerLoginUrl = 'https://teste-brocker.web.app/login.html';
  const vitrineUrl = 'https://amafirm.web.app/';
  const supportEmail = 'support@amafirm.com';
  const from = 'AMA FIRM <ama.firm.fr@gmail.com>';
  
  console.log('📧 Email de bienvenue à envoyer à:', email);
  console.log('   - Plan:', planName, '- Capital:', tradingCapital + '$');

  const subject = `Bienvenue chez AMA FIRM — Accès à votre ${planName}`;

  const textContent =
`Bonjour,\n\n` +
`Votre compte AMA FIRM (${planName}) est prêt.\n` +
`Capital: ${tradingCapital.toLocaleString('fr-FR')} $\n\n` +
`Accès plateforme: ${brokerLoginUrl}\n\n` +
`Identifiants de connexion\n` +
`Identifiant: ${brokerIdentifier}\n` +
`Mot de passe Broker: ${password}\n\n` +
`Rappel règles du challenge\n` +
`- Objectif profit: 10%\n` +
`- Drawdown journalier max: 3%\n` +
`- Drawdown total max: 8%\n` +
`- Minimum 3 jours de trading\n\n` +
`Besoin d'aide ? ${supportEmail}\n` +
`Site: ${vitrineUrl}\n\n` +
`Si vous n'êtes pas à l'origine de cet achat, contactez-nous immédiatement.`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Votre compte AMA FIRM est prêt — accès et identifiants à l'intérieur.
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 16px 50px rgba(17,24,39,0.10);">
          <tr>
            <td style="padding:28px 28px 18px;text-align:left;">
              <div style="font-weight:800;font-size:20px;letter-spacing:0.2px;color:#0f172a;">AMA FIRM</div>
              <div style="margin-top:6px;color:#64748b;font-size:13px;">Prop firm — accès à votre espace</div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 24px;">
              <h1 style="margin:0;color:#0f172a;font-size:22px;line-height:1.3;">Bienvenue chez AMA FIRM</h1>
              <p style="margin:10px 0 0;color:#334155;font-size:14px;line-height:1.7;">
                Votre compte <strong>${safePlanName}</strong> est prêt. Capital: <strong>${tradingCapital.toLocaleString('fr-FR')} $</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-radius:12px;border:1px solid #e5e7eb;background:#f8fafc;">
                <tr>
                  <td style="padding:18px;">
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:10px;">Accès à la plateforme</div>
                    <a href="${brokerLoginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700;">
                      Se connecter
                    </a>
                    <div style="margin-top:10px;color:#64748b;font-size:12px;">Si le bouton ne fonctionne pas : ${brokerLoginUrl}</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;">
                <tr>
                  <td style="padding:18px;">
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:10px;">Identifiants</div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">
                      <tr>
                        <td style="padding:6px 0;">Identifiant</td>
                        <td style="padding:6px 0;text-align:right;font-weight:700;color:#0f172a;">${safeBrokerIdentifier}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">Mot de passe Broker</td>
                        <td style="padding:6px 0;text-align:right;">
                          <code style="background:#0f172a;color:#ffffff;padding:4px 10px;border-radius:8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${safePassword}</code>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top:10px;color:#64748b;font-size:12px;">Conseil : changez votre mot de passe après la première connexion.</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:12px;border:1px solid #e5e7eb;background:#f8fafc;">
                <tr>
                  <td style="padding:18px;">
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:8px;">Rappel règles du challenge</div>
                    <ul style="margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.7;">
                      <li>Objectif de profit : <strong>10%</strong></li>
                      <li>Drawdown journalier max : <strong>3%</strong></li>
                      <li>Drawdown total max : <strong>8%</strong></li>
                      <li>Minimum : <strong>3</strong> jours de trading</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.6;">
                Si vous n'êtes pas à l'origine de cet achat, contactez-nous immédiatement :
                <a href="mailto:${supportEmail}" style="color:#0f172a;text-decoration:underline;">${supportEmail}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 26px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.6;">
              <div style="margin-bottom:8px;">Support : <a href="mailto:${supportEmail}" style="color:#0f172a;text-decoration:underline;">${supportEmail}</a></div>
              <div>Site : <a href="${vitrineUrl}" style="color:#0f172a;text-decoration:underline;">${vitrineUrl}</a></div>
              <div style="margin-top:12px;">© 2024 AMA FIRM. Tous droits réservés.</div>
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
      to: [email],
      message: {
        from,
        replyTo: supportEmail,
        subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-AMA-Email': 'welcome',
          'X-Stripe-Session': session.id
        }
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

export const contactSupport = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Non authentifié');
    }

    const data = request.data as { email?: string; subject?: string; message?: string };
    const email = String(data?.email || '').trim().toLowerCase();
    const subject = String(data?.subject || '').trim();
    const message = String(data?.message || '').trim();

    if (!email || !email.includes('@')) {
      throw new HttpsError('invalid-argument', 'Email invalide');
    }
    if (!subject || subject.length < 3 || subject.length > 120) {
      throw new HttpsError('invalid-argument', 'Objet invalide');
    }
    if (!message || message.length < 10 || message.length > 5000) {
      throw new HttpsError('invalid-argument', 'Message invalide');
    }

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

    const supportInbox = 'paul.ama.firm.fr@gmail.com';
    const from = 'AMA FIRM <ama.firm.fr@gmail.com>';

    const text =
      `Nouvelle demande via le dashboard\n\n` +
      `Utilisateur: ${request.auth.uid}\n` +
      `Email: ${email}\n` +
      `Objet: ${subject}\n\n` +
      `${message}`;

    const html = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Contact</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Message envoyé depuis le dashboard</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;">
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        <div><strong>Utilisateur:</strong> ${request.auth.uid}</div>
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div><strong>Objet:</strong> ${safeSubject}</div>
      </div>
      <div style="margin-top:14px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:1.7;">${safeMessage}</div>
    </div>
  </div>
</body>
</html>`;

    try {
      await admin.firestore().collection('mail').add({
        to: [supportInbox],
        message: {
          from,
          replyTo: email,
          subject: `Contact — ${subject}`,
          text,
          html,
          headers: {
            'X-AMA-Email': 'contact',
            'X-AMA-UserId': request.auth.uid,
          },
        },
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ contactSupport failed:', errorMessage);
      throw new HttpsError('internal', 'Impossible d\'envoyer le message');
    }
  }
);

export const contactPublic = onCall(
  {
    cors: true,
  },
  async (request) => {
    const data = request.data as { email?: string; subject?: string; message?: string };
    const email = String(data?.email || '').trim().toLowerCase();
    const subject = String(data?.subject || '').trim();
    const message = String(data?.message || '').trim();

    if (!email || !email.includes('@') || email.length > 254) {
      throw new HttpsError('invalid-argument', 'Email invalide');
    }
    if (!subject || subject.length < 3 || subject.length > 120) {
      throw new HttpsError('invalid-argument', 'Objet invalide');
    }
    if (!message || message.length < 10 || message.length > 5000) {
      throw new HttpsError('invalid-argument', 'Message invalide');
    }

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

    const supportInbox = 'paul.ama.firm.fr@gmail.com';
    const from = 'AMA FIRM <ama.firm.fr@gmail.com>';

    const text =
      `Nouvelle demande via la vitrine\n\n` +
      `Email: ${email}\n` +
      `Objet: ${subject}\n\n` +
      `${message}`;

    const html = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Contact (vitrine)</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Message envoyé depuis le site vitrine</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;">
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div><strong>Objet:</strong> ${safeSubject}</div>
      </div>
      <div style="margin-top:14px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:1.7;">${safeMessage}</div>
    </div>
  </div>
</body>
</html>`;

    try {
      await admin.firestore().collection('mail').add({
        to: [supportInbox],
        message: {
          from,
          replyTo: email,
          subject: `Contact vitrine — ${subject}`,
          text,
          html,
          headers: {
            'X-AMA-Email': 'contact_public',
          },
        },
      });
      return { success: true };
    } catch (error) {
      const debugId = admin.firestore().collection('contact_public_errors').doc().id;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      const safeRawError = (() => {
        try {
          return JSON.stringify(error);
        } catch (e) {
          return String(error);
        }
      })();

      console.error('❌ contactPublic failed:', {
        debugId,
        errorMessage,
        error,
      });
      if (errorStack) {
        console.error('❌ contactPublic stack:', errorStack);
      }

      try {
        await admin.firestore().collection('contact_public_errors').doc(debugId).set({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          email,
          subject,
          messageLength: message.length,
          errorMessage,
          errorStack: errorStack || null,
          rawError: safeRawError,
        });
      } catch (logError) {
        const logErrorMessage = logError instanceof Error ? logError.message : 'Unknown log error';
        console.error('❌ contactPublic failed to write debug log:', logErrorMessage);
      }

      return {
        success: false,
        debugId,
      };
    }
  }
);

export const contactPublicHttp = onRequest(
  {
    cors: true,
    invoker: 'public',
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const data = (req.body || {}) as { email?: string; subject?: string; message?: string };
    const email = String(data?.email || '').trim().toLowerCase();
    const subject = String(data?.subject || '').trim();
    const message = String(data?.message || '').trim();

    if (!email || !email.includes('@') || email.length > 254) {
      res.status(400).json({ success: false, error: 'Email invalide' });
      return;
    }
    if (!subject || subject.length < 3 || subject.length > 120) {
      res.status(400).json({ success: false, error: 'Objet invalide' });
      return;
    }
    if (!message || message.length < 10 || message.length > 5000) {
      res.status(400).json({ success: false, error: 'Message invalide' });
      return;
    }

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

    const supportInbox = 'paul.ama.firm.fr@gmail.com';
    const from = 'AMA FIRM <ama.firm.fr@gmail.com>';

    const text =
      `Nouvelle demande via la vitrine\n\n` +
      `Email: ${email}\n` +
      `Objet: ${subject}\n\n` +
      `${message}`;

    const html = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Contact (vitrine)</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Message envoyé depuis le site vitrine</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;">
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div><strong>Objet:</strong> ${safeSubject}</div>
      </div>
      <div style="margin-top:14px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;color:#0f172a;font-size:13px;line-height:1.7;">${safeMessage}</div>
    </div>
  </div>
</body>
</html>`;

    try {
      await admin.firestore().collection('mail').add({
        to: [supportInbox],
        message: {
          from,
          replyTo: email,
          subject: `Contact vitrine — ${subject}`,
          text,
          html,
          headers: {
            'X-AMA-Email': 'contact_public_http',
          },
        },
      });
      res.status(200).json({ success: true });
    } catch (error) {
      const debugId = admin.firestore().collection('contact_public_errors').doc().id;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      const safeRawError = (() => {
        try {
          return JSON.stringify(error);
        } catch (e) {
          return String(error);
        }
      })();

      console.error('❌ contactPublicHttp failed:', {
        debugId,
        errorMessage,
        error,
      });
      if (errorStack) {
        console.error('❌ contactPublicHttp stack:', errorStack);
      }

      try {
        await admin.firestore().collection('contact_public_errors').doc(debugId).set({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          email,
          subject,
          messageLength: message.length,
          errorMessage,
          errorStack: errorStack || null,
          rawError: safeRawError,
          source: 'contactPublicHttp',
        });
      } catch (logError) {
        const logErrorMessage = logError instanceof Error ? logError.message : 'Unknown log error';
        console.error('❌ contactPublicHttp failed to write debug log:', logErrorMessage);
      }

      res.status(500).json({ success: false, debugId });
    }
  }
);

// ==========================================
// EXPORT DES FONCTIONS DE SÉCURITÉ TRADING
// ==========================================

export {
  executeTrade,
  closeTrade,
  updateTradeTargets,
  updateTradingDays,
  calculateDrawdowns,
  closeTradesBeforeWeekend,
  upgradeChallenge,
  forceUpgradeChallenge,
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

function calculateMarginLocal(symbol: string, lots: number, price: number): number {
  const leverage = 20;
  const isStock = !symbol.includes('/') && !symbol.includes('XAU') && !symbol.includes('XAG');
  const isMetal = symbol.includes('XAU') || symbol.includes('XAG');
  let contractSize: number;
  if (isStock) {
    contractSize = 100;
  } else if (isMetal) {
    contractSize = 100;
  } else {
    contractSize = 100000;
  }
  const notionalValue = contractSize * lots * price;
  return notionalValue / leverage;
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

            const tradeAccountId = typeof (trade as any)?.accountId === 'string'
              ? String((trade as any).accountId)
              : (typeof (trade as any)?.activeAccountId === 'string' ? String((trade as any).activeAccountId) : '');
            const fallbackAccountId = userDoc.exists && typeof (userDoc.data() as any)?.activeAccountId === 'string'
              ? (userDoc.data() as any).activeAccountId
              : '';
            const resolvedAccountId = tradeAccountId || fallbackAccountId;
            if (!resolvedAccountId) {
              console.log(`⚠️ Aucun compte actif pour ${userId}, balance non mise à jour`);
            } else {
              const marginReleased = Number((trade as any)?.marginUsed) || calculateMarginLocal(String((trade as any)?.symbolApi || symbol), Number(lots) || 0, Number(entryPrice) || 0);
              const accountRef = admin.firestore().collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
              await accountRef.update({
                accountBalance: admin.firestore.FieldValue.increment(pnl),
                availableBalance: admin.firestore.FieldValue.increment(pnl + marginReleased),
                updatedAt: new Date().toISOString(),
              });
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

          const orderAccountId = typeof (order as any)?.accountId === 'string' ? String((order as any).accountId) : '';
          const userRef = admin.firestore().collection('users').doc(userId);
          const userSnap = await userRef.get();
          const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
            ? (userSnap.data() as any).activeAccountId
            : '';
          const resolvedAccountId = orderAccountId || fallbackAccountId;

          const marginRaw = (order as any)?.margin;
          const marginUsed = Number.isFinite(Number(marginRaw))
            ? Number(marginRaw)
            : calculateMarginLocal(String(symbol), Number(lots) || 0, Number(price) || 0);

          const tradeDocRef = admin.firestore().collection('trades').doc();
          await admin.firestore().runTransaction(async (tx) => {
            tx.set(tradeDocRef, {
              userId: userId,
              accountId: resolvedAccountId || null,
              symbolApi: symbol,
              symbol: symbol,
              side: side,
              entryPrice: price,
              currentPrice: mid,
              lots: lots,
              takeProfit: takeProfit || null,
              stopLoss: stopLoss || null,
              tp: takeProfit || null,
              sl: stopLoss || null,
              marginUsed: marginUsed || null,
              status: 'open',
              openedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });

            tx.update(admin.firestore().collection('orders').doc(id), {
              status: 'executed',
              executedAt: new Date().toISOString(),
              tradeId: tradeDocRef.id,
              updatedAt: new Date().toISOString(),
            });

            if (resolvedAccountId && marginUsed) {
              const accountRef = admin.firestore().collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
              tx.update(accountRef, {
                availableBalance: admin.firestore.FieldValue.increment(-marginUsed),
                lastTradeAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
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
