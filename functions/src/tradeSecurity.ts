/**
 * Cloud Functions de Sécurité pour les Trades
 * CRITIQUE: Toutes les validations et exécutions de trades DOIVENT passer par ici
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { getValidatedPrice, finnhubApiKey } from './priceService';

const db = admin.firestore();

const PRICE_ENGINE_URL = 'https://ig-price-engine-44407447466.europe-west1.run.app';

type MarketSnapshot = {
  epic?: string;
  symbol?: string;
  bid?: number;
  offer?: number;
  marketStatus?: string;
  updateTime?: string;
  timestamp?: number;
};

async function getMarketSnapshot(symbolApi: string): Promise<MarketSnapshot | null> {
  const epic = String(symbolApi || '').trim();
  if (!epic) return null;

  try {
    const res = await fetch(`${PRICE_ENGINE_URL}/api/prices/${encodeURIComponent(epic)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as MarketSnapshot;
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

async function validateMarketOpen(symbolApi: string): Promise<ValidationResult> {
  const snap = await getMarketSnapshot(symbolApi);
  if (!snap) {
    return { allowed: false, reason: 'Marché fermé / prix indisponible' };
  }

  const status = String((snap as any).marketStatus || '').toUpperCase();
  if (status && ['CLOSED', 'OFFLINE', 'SUSPENDED', 'SUSPEND'].includes(status)) {
    return { allowed: false, reason: 'Marché fermé' };
  }

  const ts = Number((snap as any).timestamp);
  if (Number.isFinite(ts)) {
    const ageMs = Date.now() - ts;
    if (ageMs > 2 * 60 * 1000) {
      return { allowed: false, reason: 'Marché fermé (flux prix inactif)' };
    }
  }

  const bid = Number((snap as any).bid);
  const offer = Number((snap as any).offer);
  if (!Number.isFinite(bid) || !Number.isFinite(offer) || bid <= 0 || offer <= 0) {
    return { allowed: false, reason: 'Marché fermé / prix indisponible' };
  }

  return { allowed: true };
}

function generateSecurePassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^*_-';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFundedCreatedEmail(params: {
  accountName: string;
  brokerIdentifier: string;
  brokerPassword: string;
  brokerLoginUrl: string;
  profitPercent?: number;
  tradingDays?: number;
  isForce?: boolean;
}) {
  const {
    accountName,
    brokerIdentifier,
    brokerPassword,
    brokerLoginUrl,
    profitPercent,
    tradingDays,
    isForce,
  } = params;

  const safeAccountName = escapeHtml(accountName);
  const safeIdentifier = escapeHtml(brokerIdentifier);
  const safePassword = escapeHtml(brokerPassword);
  const safeLoginUrl = escapeHtml(brokerLoginUrl);

  const hasStats = Number.isFinite(profitPercent) && Number.isFinite(tradingDays);
  const statsLine = hasStats
    ? `Profit: ${Number(profitPercent).toFixed(2)}% — Jours de trading: ${Number(tradingDays)}`
    : '';

  const subject = `Félicitations — votre compte financé est prêt (${accountName})`;

  const text =
    `Félicitations !\n\n` +
    `Votre challenge est validé et votre compte financé est maintenant actif.\n` +
    (statsLine ? `${statsLine}\n\n` : `\n`) +
    `Accès plateforme: ${brokerLoginUrl}\n\n` +
    `Identifiant: ${brokerIdentifier}\n` +
    `Mot de passe Broker: ${brokerPassword}\n\n` +
    `Compte: ${accountName}\n\n` +
    `Conseil sécurité: changez votre mot de passe après la première connexion.\n` +
    (isForce ? `\nNote: compte créé via force upgrade (admin).\n` : '');

  const preheader = 'Félicitations — vos accès au compte financé sont prêts.';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 16px 50px rgba(17,24,39,0.10);">
          <tr>
            <td style="padding:28px 28px 18px;text-align:left;">
              <div style="font-weight:800;font-size:20px;letter-spacing:0.2px;color:#0f172a;">AMA FIRM</div>
              <div style="margin-top:6px;color:#64748b;font-size:13px;">Prop firm — compte financé</div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 24px;">
              <h1 style="margin:0;color:#0f172a;font-size:22px;line-height:1.3;">Félicitations, vous êtes financé</h1>
              <p style="margin:10px 0 0;color:#334155;font-size:14px;line-height:1.7;">
                Votre challenge est validé. Votre compte financé <strong>${safeAccountName}</strong> est maintenant actif.
              </p>
              ${hasStats ? `<p style="margin:10px 0 0;color:#334155;font-size:13px;line-height:1.7;">${escapeHtml(statsLine)}</p>` : ''}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-radius:12px;border:1px solid #e5e7eb;background:#f8fafc;">
                <tr>
                  <td style="padding:18px;">
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:10px;">Accès à la plateforme</div>
                    <a href="${safeLoginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700;">
                      Se connecter
                    </a>
                    <div style="margin-top:10px;color:#64748b;font-size:12px;">Si le bouton ne fonctionne pas : ${safeLoginUrl}</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;">
                <tr>
                  <td style="padding:18px;">
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:10px;">Vos identifiants Broker</div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">
                      <tr>
                        <td style="padding:6px 0;">Identifiant</td>
                        <td style="padding:6px 0;text-align:right;font-weight:700;color:#0f172a;">${safeIdentifier}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">Mot de passe</td>
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
                    <div style="color:#0f172a;font-weight:700;font-size:14px;margin-bottom:8px;">Prochaines étapes</div>
                    <ul style="margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.7;">
                      <li>Connectez-vous à la plateforme et vérifiez vos informations.</li>
                      <li>Respectez les règles de gestion du risque pour conserver votre statut.</li>
                      <li>Une fois éligible, vous pourrez faire une demande de payout depuis le dashboard.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              ${isForce ? `<p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.6;">Note : compte créé via force upgrade (admin) pour test/assistance.</p>` : ''}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 26px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.6;">
              <div style="margin-top:12px;">© 2024 AMA FIRM. Tous droits réservés.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function generateBrokerIdentifier(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'AMA-';
  for (let i = 0; i < 8; i++) {
    out += charset[Math.floor(Math.random() * charset.length)];
  }
  return out;
}

async function ensureBrokerIdentifier(userId: string): Promise<string> {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? (userSnap.data() as any)?.brokerIdentifier : null;
  if (typeof existing === 'string' && existing.trim()) {
    const identifier = existing.trim().toUpperCase();
    try {
      await db.collection('broker_identifiers').doc(identifier).set({
        uid: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
    }
    return identifier;
  }

  for (let i = 0; i < 10; i++) {
    const identifier = generateBrokerIdentifier();
    const mapRef = db.collection('broker_identifiers').doc(identifier);
    try {
      await mapRef.create({
        uid: userId,
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

function toJsDate(value: any): Date | null {
  try {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

async function getAccountTradeStats(userId: string, accountId: string) {
  const tradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .get();

  const closedTrades: any[] = [];
  const allTrades: any[] = [];
  tradesSnapshot.forEach((docSnap) => {
    const t = docSnap.data();
    if (!t) return;
    const tradeAccountId = typeof t.accountId === 'string' ? t.accountId : (typeof t.activeAccountId === 'string' ? t.activeAccountId : '');
    if (tradeAccountId !== accountId) return;
    allTrades.push(t);
    if (t.status === 'closed') closedTrades.push(t);
  });

  const tradingDaysSet = new Set<string>();
  allTrades.forEach((t) => {
    const dateRaw = t.closedAt || t.openedAt || t.openDate || t.createdAt;
    if (!dateRaw) return;
    const date = toJsDate(dateRaw);
    if (!date) return;
    tradingDaysSet.add(date.toISOString().split('T')[0]);
  });

  return {
    allTrades,
    closedTrades,
    tradingDays: tradingDaysSet.size,
  };
}

async function validateAccountTotalDrawdown(
  userId: string,
  accountId: string,
  initialBalance: number,
  currentBalance: number,
  maxTotalDrawdownPercent: number
) {
  const stats = await getAccountTradeStats(userId, accountId);
  if (!stats.closedTrades.length) return { allowed: true };

  let calculatedBalance = initialBalance;
  let peakBalance = initialBalance;
  stats.closedTrades
    .sort((a, b) => {
      const da = toJsDate(a.closedAt)?.getTime() ?? 0;
      const dbv = toJsDate(b.closedAt)?.getTime() ?? 0;
      return da - dbv;
    })
    .forEach((trade) => {
      const pnl = Number(trade.pnl) || 0;
      calculatedBalance += pnl;
      if (calculatedBalance > peakBalance) peakBalance = calculatedBalance;
    });

  const safeCurrent = Math.max(Number.isFinite(currentBalance) ? currentBalance : calculatedBalance, 0.01);
  const drawdown = peakBalance - safeCurrent;
  const drawdownPercent = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0;
  if (drawdownPercent > maxTotalDrawdownPercent) {
    return { allowed: false, reason: `Drawdown total ${drawdownPercent.toFixed(2)}% (max ${maxTotalDrawdownPercent}%)` };
  }
  return { allowed: true };
}

async function validateAccountDailyDrawdown(
  userId: string,
  accountId: string,
  initialBalance: number,
  maxDailyDrawdownPercent: number | null
) {
  if (maxDailyDrawdownPercent === null) return { allowed: true };

  const stats = await getAccountTradeStats(userId, accountId);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let todayPnl = 0;
  stats.closedTrades.forEach((trade) => {
    const closedAt = trade.closedAt;
    if (!closedAt) return;
    const d = toJsDate(closedAt);
    if (!d) return;
    if (d < todayStart) return;
    todayPnl += Number(trade.pnl) || 0;
  });

  if (todayPnl >= 0) return { allowed: true };
  const dailyLossPercent = initialBalance > 0 ? (Math.abs(todayPnl) / initialBalance) * 100 : 0;
  if (dailyLossPercent > maxDailyDrawdownPercent) {
    return { allowed: false, reason: `Drawdown journalier ${dailyLossPercent.toFixed(2)}% (max ${maxDailyDrawdownPercent}%)` };
  }
  return { allowed: true };
}

// ==========================================
// TYPES
// ==========================================

interface TradeData {
  userId: string;
  accountId?: string;
  symbol: string;
  symbolApi: string;
  side: 'BUY' | 'SELL';
  lots: number;
  tp?: number | null;
  sl?: number | null;
  price?: number;
}

interface OrderData {
  accountId?: string;
  symbol: string;
  symbolApi: string;
  side: 'BUY' | 'SELL';
  orderType: 'limit' | 'stop';
  price: number;
  lots: number;
  takeProfit?: number | null;
  stopLoss?: number | null;
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

// ==========================================
// HELPER: LOGS D'AUDIT
// ==========================================

async function auditLog(
  action: string,
  userId: string,
  details: Record<string, any>,
  ipAddress?: string
): Promise<void> {
  await db.collection('audit_logs').add({
    action,
    userId,
    details,
    ipAddress: ipAddress || 'unknown',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

// ==========================================
// VALIDATION 1: HEURES DE TRADING
// ==========================================

function validateTradingHours(): ValidationResult {
  const now = new Date();
  const hours = now.getUTCHours();
  const day = now.getUTCDay();

  // Interdit entre 22h-00h UTC
  if (false && (hours >= 22 || hours < 0)) {
    return {
      allowed: false,
      reason: 'Trading interdit entre 22h et 00h (UTC)'
    };
  }

  // Interdit samedi (6) et dimanche (0)
  if (day === 0 || day === 6) {
    return {
      allowed: false,
      reason: 'Trading interdit le week-end'
    };
  }

  return { allowed: true };
}

// ==========================================
// VALIDATION 2: DRAWDOWN TOTAL
// ==========================================

async function validateTotalDrawdown(
  userId: string,
  userData: any
): Promise<ValidationResult> {
  // S'assurer que initialBalance existe et est valide
  const initialBalance = userData.initialBalance || userData.accountBalance || 25000;
  
  // Si pas de trades fermés, pas de drawdown possible
  const tradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .where('status', '==', 'closed')
    .orderBy('closedAt', 'asc')
    .get();

  // Si aucun trade fermé, le compte est neuf → pas de drawdown
  if (tradesSnapshot.empty) {
    console.log(`📊 Aucun trade fermé - drawdown: 0%`);
    return { allowed: true };
  }

  // Calculer le solde actuel basé sur initialBalance + somme des PnL
  let calculatedBalance = initialBalance;
  let peakBalance = initialBalance;

  // Calculer le peak balance (pic historique)
  tradesSnapshot.forEach((doc) => {
    const trade = doc.data();
    const pnl = Number(trade.pnl) || 0;
    calculatedBalance += pnl;
    if (calculatedBalance > peakBalance) {
      peakBalance = calculatedBalance;
    }
  });

  // Utiliser le solde calculé (plus fiable que accountBalance qui peut être désync)
  const currentBalance = Math.max(calculatedBalance, 0.01); // Éviter division par 0
  const drawdown = peakBalance - currentBalance;
  const drawdownPercent = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0;

  console.log(`📊 Drawdown total: ${drawdownPercent.toFixed(2)}% (max: 8%) | Initial: ${initialBalance} | Peak: ${peakBalance} | Current: ${currentBalance}`);

  if (drawdownPercent > 8) {
    // SUSPENDRE LE COMPTE
    await db.collection('users').doc(userId).update({
      accountStatus: 'suspended',
      suspensionReason: `Perte totale de ${drawdownPercent.toFixed(2)}% (max: 8%)`,
      suspendedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await auditLog('account_suspended', userId, {
      reason: 'total_drawdown_exceeded',
      drawdownPercent: drawdownPercent.toFixed(2),
      peakBalance,
      currentBalance,
      initialBalance
    });

    return {
      allowed: false,
      reason: `Compte suspendu: drawdown total ${drawdownPercent.toFixed(2)}% (max: 8%)`
    };
  }

  return { allowed: true };
}

// ==========================================
// VALIDATION 3: DRAWDOWN JOURNALIER
// ==========================================

async function validateDailyDrawdown(
  userId: string,
  userData: any
): Promise<ValidationResult> {
  // S'assurer que initialBalance existe et est valide
  const initialBalance = userData.initialBalance || userData.accountBalance || 25000;
  
  // Début de la journée UTC
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Charger les trades fermés aujourd'hui
  const todayTradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .where('status', '==', 'closed')
    .get();

  // Filtrer manuellement par date (évite les problèmes d'index composite)
  let todayPnl = 0;
  todayTradesSnapshot.forEach((doc) => {
    const trade = doc.data();
    const closedAt = trade.closedAt;
    if (closedAt) {
      const closedDate = closedAt.toDate ? closedAt.toDate() : new Date(closedAt);
      if (closedDate >= todayStart) {
        todayPnl += Number(trade.pnl) || 0;
      }
    }
  });

  // Si pas de trades aujourd'hui, pas de perte journalière
  if (todayPnl >= 0) {
    console.log(`📊 Perte journalière: 0% (profit: ${todayPnl.toFixed(2)})`);
    return { allowed: true };
  }

  const dailyLoss = Math.abs(todayPnl);
  const dailyLossPercent = initialBalance > 0 ? (dailyLoss / initialBalance) * 100 : 0;

  console.log(`📊 Perte journalière: ${dailyLossPercent.toFixed(2)}% (max: 3%) | Perte: ${dailyLoss} | Initial: ${initialBalance}`);

  if (dailyLossPercent > 3) {
    // SUSPENDRE LE COMPTE
    await db.collection('users').doc(userId).update({
      accountStatus: 'suspended',
      suspensionReason: `Perte journalière de ${dailyLossPercent.toFixed(2)}% (max: 3%)`,
      suspendedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await auditLog('account_suspended', userId, {
      reason: 'daily_drawdown_exceeded',
      dailyLossPercent: dailyLossPercent.toFixed(2),
      todayPnl
    });

    return {
      allowed: false,
      reason: `Compte suspendu: perte journalière ${dailyLossPercent.toFixed(2)}% (max: 3%)`
    };
  }

  return { allowed: true };
}

// ==========================================
// VALIDATION 4: MARGE DISPONIBLE
// ==========================================

function calculateMargin(symbol: string, lots: number, price: number): number {
  // Leverage 1:20 (comme affiché dans le broker)
  const leverage = 20;
  
  // Taille de contrat par type d'actif:
  // - ETF/Actions: 1 lot = 100 actions (mini-lot standard)
  // - Forex: 1 lot = 100,000 unités
  // - Métaux (XAU/XAG): 1 lot = 100 oz
  const isStock = !symbol.includes('/') && !symbol.includes('XAU') && !symbol.includes('XAG');
  const isMetal = symbol.includes('XAU') || symbol.includes('XAG');
  
  let contractSize: number;
  if (isStock) {
    contractSize = 100; // 1 lot = 100 actions
  } else if (isMetal) {
    contractSize = 100; // 1 lot = 100 oz
  } else {
    contractSize = 100000; // Forex: 1 lot = 100,000 unités
  }
  
  const notionalValue = contractSize * lots * price;
  const margin = notionalValue / leverage;
  
  console.log(`📊 Margin calc: ${symbol} ${lots} lots @ ${price} | Contract=${contractSize} | Notional=${notionalValue.toFixed(2)} | Margin=${margin.toFixed(2)} USD`);
  return margin;
}

async function validateMargin(
  userId: string,
  accountId: string,
  accountData: any,
  symbol: string,
  lots: number,
  price: number
): Promise<ValidationResult> {
  const requiredMargin = calculateMargin(symbol, lots, price);
  
  // Calculer la marge utilisée par les positions ouvertes
  const openTradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .where('status', '==', 'open')
    .get();
  
  let usedMargin = 0;
  openTradesSnapshot.forEach((doc) => {
    const trade = doc.data();
    const tradeAccountId = typeof trade.accountId === 'string'
      ? trade.accountId
      : (typeof trade.activeAccountId === 'string' ? trade.activeAccountId : '');
    if (tradeAccountId !== accountId) return;
    const tradeMargin = calculateMargin(trade.symbolApi || trade.symbol, trade.lots, trade.entryPrice);
    usedMargin += tradeMargin;
  });
  
  // Balance disponible = balance totale - marge utilisée
  const accountBalance = Number(accountData?.accountBalance ?? accountData?.initialBalance ?? 25000);
  const storedAvailable = Number(accountData?.availableBalance);
  const availableBalance = Number.isFinite(storedAvailable)
    ? storedAvailable
    : (accountBalance - usedMargin);
  
  console.log(`📊 Margin check: Account=${accountBalance}, Used=${usedMargin.toFixed(2)}, Available=${availableBalance.toFixed(2)}, Required=${requiredMargin.toFixed(2)}`);

  if (requiredMargin > availableBalance) {
    return {
      allowed: false,
      reason: `Marge insuffisante. Requis: ${requiredMargin.toFixed(2)} USD, Disponible: ${availableBalance.toFixed(2)} USD`
    };
  }

  return { allowed: true };
}

// ==========================================
// FONCTION PRINCIPALE: EXÉCUTER UN TRADE
// ==========================================

export const executeTrade = onCall({ secrets: [finnhubApiKey] }, async (request) => {
  const { userId, accountId: requestedAccountId, symbol, symbolApi, side, lots, tp, sl } = request.data as TradeData;

  console.log(`🔍 Tentative de trade: ${side} ${symbol} ${lots} lots`);

  // 1. Vérifier l'authentification
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'Accès interdit');
  }

  // 2. Charger les données utilisateur
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Utilisateur introuvable');
  }

  const userData = userDoc.data()!;

  const resolvedAccountId = (typeof requestedAccountId === 'string' && requestedAccountId.trim())
    ? requestedAccountId.trim()
    : (typeof (userData as any)?.activeAccountId === 'string' ? (userData as any).activeAccountId : '');
  if (!resolvedAccountId) {
    throw new HttpsError('failed-precondition', 'Aucun compte actif');
  }

  const accountRef = db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) {
    throw new HttpsError('not-found', 'Compte introuvable');
  }
  const accountData = accountSnap.data() as any;

  // 3. Vérifier que le compte est actif
  if (accountData.accountStatus !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      `Compte ${accountData.accountStatus}. Trading désactivé.`
    );
  }

  // 4. VALIDATION DES HEURES
  const hoursCheck = validateTradingHours();
  if (!hoursCheck.allowed) {
    await auditLog('trade_rejected', userId, {
      reason: 'trading_hours',
      detail: hoursCheck.reason
    });
    throw new HttpsError('failed-precondition', hoursCheck.reason!);
  }

  const marketCheck = await validateMarketOpen(symbolApi);
  if (!marketCheck.allowed) {
    await auditLog('trade_rejected', userId, {
      reason: 'market_closed',
      detail: marketCheck.reason,
      symbolApi,
    });
    throw new HttpsError('failed-precondition', marketCheck.reason || 'Marché fermé');
  }

  const initialBalance = Number(accountData?.initialBalance ?? accountData?.accountBalance ?? 25000);
  const currentBalance = Number(accountData?.accountBalance ?? initialBalance);

  const maxTotalDrawdownPercent = Number(accountData?.maxTotalDrawdownPercent);
  const resolvedMaxTotal = Number.isFinite(maxTotalDrawdownPercent) && maxTotalDrawdownPercent > 0 ? maxTotalDrawdownPercent : 8;
  const rawMaxDaily = accountData?.maxDailyDrawdownPercent;
  const maxDailyDrawdownPercent = rawMaxDaily === null
    ? null
    : Number.isFinite(Number(rawMaxDaily)) && Number(rawMaxDaily) > 0
      ? Number(rawMaxDaily)
      : 3;

  // 5. VALIDATION DRAWDOWN TOTAL
  const totalDrawdownCheck = await validateAccountTotalDrawdown(userId, resolvedAccountId, initialBalance, currentBalance, resolvedMaxTotal);
  if (!totalDrawdownCheck.allowed) {
    throw new HttpsError('failed-precondition', totalDrawdownCheck.reason!);
  }

  // 6. VALIDATION DRAWDOWN JOURNALIER
  const dailyDrawdownCheck = await validateAccountDailyDrawdown(userId, resolvedAccountId, initialBalance, maxDailyDrawdownPercent);
  if (!dailyDrawdownCheck.allowed) {
    throw new HttpsError('failed-precondition', dailyDrawdownCheck.reason!);
  }

  // 7. OBTENIR ET VALIDER LE PRIX EN TEMPS RÉEL
  // Le prix est récupéré côté serveur via Finnhub (impossible à manipuler par le client)
  const clientPrice = request.data.price; // Prix envoyé par le client (pour comparaison)
  const price = await getValidatedPrice(symbolApi, clientPrice);

  console.log(`✅ Prix validé serveur: ${symbolApi} = ${price}`);

  // 8. VALIDATION DE LA MARGE
  const marginCheck = await validateMargin(userId, resolvedAccountId, accountData, symbolApi, lots, price);
  if (!marginCheck.allowed) {
    await auditLog('trade_rejected', userId, {
      reason: 'insufficient_margin',
      detail: marginCheck.reason
    });
    throw new HttpsError('failed-precondition', marginCheck.reason!);
  }

  // 9. CRÉER LE TRADE (transaction atomique)
  const tradeRef = db.collection('trades').doc();
  const marginUsed = calculateMargin(symbolApi, lots, price);

  try {
    await db.runTransaction(async (transaction) => {
      // Créer le trade
      transaction.set(tradeRef, {
        userId,
        accountId: resolvedAccountId,
        symbol,
        symbolApi,
        side,
        lots,
        entryPrice: price,
        currentPrice: price,
        takeProfit: tp || null,
        stopLoss: sl || null,
        tp: tp || null,
        sl: sl || null,
        marginUsed,
        status: 'open',
        pnl: 0,
        openedAt: admin.firestore.FieldValue.serverTimestamp(),
        validatedByServer: true,
        validationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Mettre à jour la balance disponible
      transaction.update(accountRef, {
        availableBalance: admin.firestore.FieldValue.increment(-marginUsed),
        lastTradeAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Log d'audit
    await auditLog('trade_opened', userId, {
      tradeId: tradeRef.id,
      symbol,
      side,
      lots,
      entryPrice: price,
      marginUsed
    });

    console.log(`✅ Trade créé: ${tradeRef.id}`);

    return {
      success: true,
      tradeId: tradeRef.id,
      entryPrice: price,
      marginUsed
    };

  } catch (error: any) {
    console.error('❌ Erreur création trade:', error);
    throw new HttpsError('internal', `Erreur: ${error.message}`);
  }
});

// ==========================================
// ADMIN: FORCE PAYOUT ELIGIBLE (FUNDED ONLY)
// ==========================================

export const adminForcePayoutEligible = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const callerId = request.auth.uid;
  const callerDoc = await db.collection('users').doc(callerId).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs');
  }

  const targetUserIdRaw = request.data && request.data.userId ? String(request.data.userId) : '';
  const targetAccountIdRaw = request.data && request.data.accountId ? String(request.data.accountId) : '';
  const targetUserId = targetUserIdRaw.trim();
  const targetAccountId = targetAccountIdRaw.trim();

  if (!targetUserId || !targetAccountId) {
    throw new HttpsError('invalid-argument', 'userId/accountId requis');
  }

  const accountRef = db.collection('users').doc(targetUserId).collection('accounts').doc(targetAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError('not-found', 'Compte introuvable');
  const acc = accountSnap.data() as any;

  const accType = typeof acc?.accountType === 'string' ? acc.accountType.toLowerCase() : '';
  const funded = Boolean(acc?.isFunded) || accType === 'funded';
  if (!funded) {
    throw new HttpsError('failed-precondition', 'Seulement pour les comptes financés');
  }

  const initialBalance = Number(acc?.initialFundedBalance ?? acc?.initialBalance ?? 0);
  if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
    throw new HttpsError('failed-precondition', 'Initial balance invalide');
  }

  const bonusProfit = initialBalance * 0.10;

  await accountRef.set({
    payoutEligibleOverride: true,
    payoutEligibleOverrideAt: admin.firestore.FieldValue.serverTimestamp(),
    payoutEligibleOverrideBy: callerId,
    accountBalance: admin.firestore.FieldValue.increment(bonusProfit),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await auditLog('payout_force_eligible', targetUserId, {
    accountId: targetAccountId,
    bonusProfit,
    forcedBy: callerId,
  });

  return { success: true, bonusProfit };
});

// ==========================================
// FONCTION: FERMER UN TRADE
// ==========================================

export const closeTrade = onCall({ secrets: [finnhubApiKey] }, async (request) => {
  const { tradeId, closePrice: clientClosePrice } = request.data;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;

  // Charger le trade
  const tradeDoc = await db.collection('trades').doc(tradeId).get();
  if (!tradeDoc.exists) {
    throw new HttpsError('not-found', 'Trade introuvable');
  }

  const trade = tradeDoc.data()!;

  const tradeAccountId = typeof trade.accountId === 'string'
    ? trade.accountId
    : (typeof trade.activeAccountId === 'string' ? trade.activeAccountId : '');

  // Vérifier la propriété
  if (trade.userId !== userId) {
    throw new HttpsError('permission-denied', 'Ce trade ne vous appartient pas');
  }

  // VALIDER LE PRIX DE FERMETURE côté serveur (sécurité critique)
  const symbol = trade.symbolApi;
  const closePrice = await getValidatedPrice(symbol, clientClosePrice);
  console.log(`✅ Prix de fermeture validé: ${symbol} = ${closePrice}`);

  // Calculer le P&L
  const entryPrice = trade.entryPrice;
  const lots = trade.lots;

  // Formule simplifiée (à adapter selon le type d'actif)
  const pipValue = 10; // USD par pip pour 1 lot standard
  const pipStep = symbol.includes('JPY') ? 0.01 : 0.0001;
  const pipDiff = (closePrice - entryPrice) / pipStep;
  let pnl = pipDiff * pipValue * lots;

  // Inverser si SELL
  if (trade.side === 'SELL') {
    pnl = -pnl;
  }

  const marginReleased = Number(trade.marginUsed) || calculateMargin(symbol, lots, entryPrice);

  console.log(`💰 P&L calculé: ${pnl.toFixed(2)} USD`);

  // Transaction atomique
  try {
    await db.runTransaction(async (transaction) => {
      // Mettre à jour la balance
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
        ? (userSnap.data() as any).activeAccountId
        : '';
      const resolvedAccountId = tradeAccountId || fallbackAccountId;
      if (!resolvedAccountId) {
        throw new HttpsError('failed-precondition', 'Aucun compte actif');
      }

      const accountRef = db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);

      // IMPORTANT: In Firestore transactions, all reads must happen before all writes.
      // Mettre à jour le trade
      transaction.update(tradeDoc.ref, {
        status: 'closed',
        closePrice,
        pnl,
        closedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(accountRef, {
        accountBalance: admin.firestore.FieldValue.increment(pnl),
        availableBalance: admin.firestore.FieldValue.increment(pnl + marginReleased),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Log d'audit
    await auditLog('trade_closed', userId, {
      tradeId,
      closePrice,
      pnl,
      marginReleased
    });

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() as any;
    const fallbackAccountId = userData && typeof userData.activeAccountId === 'string' ? userData.activeAccountId : '';
    const resolvedAccountId = tradeAccountId || fallbackAccountId;
    if (resolvedAccountId) {
      const accountDoc = await db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId).get();
      const accountData = accountDoc.exists ? (accountDoc.data() as any) : {};
      const initialBalance = Number(accountData?.initialBalance ?? accountData?.accountBalance ?? 25000);
      const currentBalance = Number(accountData?.accountBalance ?? 0);

      const maxTotalDrawdownPercent = Number(accountData?.maxTotalDrawdownPercent);
      const resolvedMaxTotal = Number.isFinite(maxTotalDrawdownPercent) && maxTotalDrawdownPercent > 0 ? maxTotalDrawdownPercent : 8;
      const rawMaxDaily = accountData?.maxDailyDrawdownPercent;
      const maxDailyDrawdownPercent = rawMaxDaily === null
        ? null
        : Number.isFinite(Number(rawMaxDaily)) && Number(rawMaxDaily) > 0
          ? Number(rawMaxDaily)
          : 3;

      const totalRes = await validateAccountTotalDrawdown(userId, resolvedAccountId, initialBalance, currentBalance, resolvedMaxTotal);
      if (!totalRes.allowed) {
        await db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId).set({
          accountStatus: 'suspended',
          suspensionReason: totalRes.reason || 'Violation drawdown total',
          suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const dailyRes = await validateAccountDailyDrawdown(userId, resolvedAccountId, initialBalance, maxDailyDrawdownPercent);
      if (!dailyRes.allowed) {
        await db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId).set({
          accountStatus: 'suspended',
          suspensionReason: dailyRes.reason || 'Violation drawdown journalier',
          suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    console.log(`✅ Trade fermé: ${tradeId}`);

    const resolvedAccountIdForReturn = tradeAccountId || (userData && typeof userData.activeAccountId === 'string' ? userData.activeAccountId : '');
    const accountSnap = resolvedAccountIdForReturn
      ? await db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountIdForReturn).get()
      : null;
    const newBalance = accountSnap && accountSnap.exists ? Number((accountSnap.data() as any)?.accountBalance ?? 0) : null;

    return {
      success: true,
      pnl,
      newBalance,
    };

  } catch (error: any) {
    console.error('❌ Erreur fermeture trade:', error);
    throw new HttpsError('internal', `Erreur: ${error.message}`);
  }
});

export const updateTradeTargets = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const { tradeId, takeProfit, stopLoss } = request.data || {};
  if (typeof tradeId !== 'string' || !tradeId.trim()) {
    throw new HttpsError('invalid-argument', 'tradeId invalide');
  }

  const userId = request.auth.uid;
  const tradeRef = db.collection('trades').doc(tradeId);
  const tradeSnap = await tradeRef.get();
  if (!tradeSnap.exists) {
    throw new HttpsError('not-found', 'Trade introuvable');
  }
  const trade = tradeSnap.data() as any;
  if (trade.userId !== userId) {
    throw new HttpsError('permission-denied', 'Ce trade ne vous appartient pas');
  }
  if (trade.status !== 'open') {
    throw new HttpsError('failed-precondition', 'Trade déjà fermé');
  }

  const tp = takeProfit === null || takeProfit === undefined ? null : Number(takeProfit);
  const sl = stopLoss === null || stopLoss === undefined ? null : Number(stopLoss);
  if (tp !== null && !Number.isFinite(tp)) {
    throw new HttpsError('invalid-argument', 'takeProfit invalide');
  }
  if (sl !== null && !Number.isFinite(sl)) {
    throw new HttpsError('invalid-argument', 'stopLoss invalide');
  }

  await tradeRef.update({
    takeProfit: tp,
    stopLoss: sl,
    tp,
    sl,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

export const recalculateTradingDays = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;
  const accountIdRaw = request.data && (request.data as any).accountId ? String((request.data as any).accountId) : '';
  const accountId = accountIdRaw.trim();

  const accountsRef = db.collection('users').doc(userId).collection('accounts');
  const accountsSnap = accountId ? null : await accountsRef.get();
  const targetAccountIds = accountId
    ? [accountId]
    : accountsSnap
      ? accountsSnap.docs.map((d) => d.id)
      : [];

  if (!targetAccountIds.length) {
    throw new HttpsError('failed-precondition', 'Aucun compte à recalculer');
  }

  const tradesSnap = await db.collection('trades')
    .where('userId', '==', userId)
    .get();

  const daysByAccount = new Map<string, Set<string>>();
  targetAccountIds.forEach((id) => daysByAccount.set(id, new Set<string>()));

  tradesSnap.forEach((docSnap) => {
    const t = docSnap.data() as any;
    const tradeAccountId = typeof t?.accountId === 'string'
      ? t.accountId
      : (typeof t?.activeAccountId === 'string' ? t.activeAccountId : '');
    if (!tradeAccountId || !daysByAccount.has(tradeAccountId)) return;

    const dateRaw = t.openedAt || t.closedAt || t.createdAt;
    const d = toJsDate(dateRaw);
    if (!d) return;
    daysByAccount.get(tradeAccountId)!.add(d.toISOString().slice(0, 10));
  });

  const batch = db.batch();
  for (const [accId, set] of daysByAccount.entries()) {
    batch.set(accountsRef.doc(accId), {
      tradingDays: set.size,
      tradingDaysRecalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  return {
    success: true,
    updatedAccounts: Array.from(daysByAccount.entries()).map(([id, set]) => ({ accountId: id, tradingDays: set.size })),
  };
});

export const recalculateAllTradingDays = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const callerId = request.auth.uid;
  const callerDoc = await db.collection('users').doc(callerId).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs');
  }

  const tradesSnap = await db.collection('trades').get();

  const daysByAccount = new Map<string, Set<string>>();
  const accountMeta = new Map<string, { uid: string; accountId: string }>();

  tradesSnap.forEach((docSnap) => {
    const t = docSnap.data() as any;
    const uid = typeof t?.userId === 'string' ? t.userId : '';
    if (!uid) return;

    const accId = typeof t?.accountId === 'string'
      ? t.accountId
      : (typeof t?.activeAccountId === 'string' ? t.activeAccountId : '');
    if (!accId) return;

    const dateRaw = t.openedAt || t.closedAt || t.createdAt;
    const d = toJsDate(dateRaw);
    if (!d) return;

    const day = d.toISOString().slice(0, 10);
    const key = `${uid}::${accId}`;
    if (!daysByAccount.has(key)) {
      daysByAccount.set(key, new Set<string>());
      accountMeta.set(key, { uid, accountId: accId });
    }
    daysByAccount.get(key)!.add(day);
  });

  const updates: Array<{ uid: string; accountId: string; tradingDays: number }> = [];
  for (const [key, set] of daysByAccount.entries()) {
    const meta = accountMeta.get(key);
    if (!meta) continue;
    updates.push({ uid: meta.uid, accountId: meta.accountId, tradingDays: set.size });
  }

  let committed = 0;
  for (let i = 0; i < updates.length; i += 450) {
    const slice = updates.slice(i, i + 450);
    const batch = db.batch();
    slice.forEach((u) => {
      const ref = db.collection('users').doc(u.uid).collection('accounts').doc(u.accountId);
      batch.set(ref, {
        tradingDays: u.tradingDays,
        tradingDaysRecalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
    committed += slice.length;
  }

  return {
    success: true,
    totalTradesScanned: tradesSnap.size,
    accountsUpdated: committed,
  };
});

export const backfillAllTradingDaysOnce = onSchedule('every 5 minutes', async () => {
  const jobRef = db.collection('system_jobs').doc('backfillAllTradingDaysOnce');
  const jobSnap = await jobRef.get();
  const jobData = jobSnap.exists ? (jobSnap.data() as any) : {};
  if (jobData && jobData.status === 'done') {
    return;
  }

  await jobRef.set({
    status: 'running',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  try {
    const tradesSnap = await db.collection('trades').get();

    const daysByAccount = new Map<string, Set<string>>();
    const accountMeta = new Map<string, { uid: string; accountId: string }>();

    tradesSnap.forEach((docSnap) => {
      const t = docSnap.data() as any;
      const uid = typeof t?.userId === 'string' ? t.userId : '';
      if (!uid) return;

      const accId = typeof t?.accountId === 'string'
        ? t.accountId
        : (typeof t?.activeAccountId === 'string' ? t.activeAccountId : '');
      if (!accId) return;

      const dateRaw = t.openedAt || t.closedAt || t.createdAt;
      const d = toJsDate(dateRaw);
      if (!d) return;

      const day = d.toISOString().slice(0, 10);
      const key = `${uid}::${accId}`;
      if (!daysByAccount.has(key)) {
        daysByAccount.set(key, new Set<string>());
        accountMeta.set(key, { uid, accountId: accId });
      }
      daysByAccount.get(key)!.add(day);
    });

    const updates: Array<{ uid: string; accountId: string; tradingDays: number }> = [];
    for (const [key, set] of daysByAccount.entries()) {
      const meta = accountMeta.get(key);
      if (!meta) continue;
      updates.push({ uid: meta.uid, accountId: meta.accountId, tradingDays: set.size });
    }

    let committed = 0;
    for (let i = 0; i < updates.length; i += 450) {
      const slice = updates.slice(i, i + 450);
      const batch = db.batch();
      slice.forEach((u) => {
        const ref = db.collection('users').doc(u.uid).collection('accounts').doc(u.accountId);
        batch.set(ref, {
          tradingDays: u.tradingDays,
          tradingDaysRecalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      committed += slice.length;
    }

    await jobRef.set({
      status: 'done',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      totalTradesScanned: tradesSnap.size,
      accountsUpdated: committed,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e: any) {
    await jobRef.set({
      status: 'error',
      error: e?.message || String(e),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    throw e;
  }
});

export const placeOrder = onCall({ secrets: [finnhubApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;
  const data = (request.data || {}) as any as OrderData;

  const symbol = String((data as any).symbol || '').trim();
  const symbolApi = String((data as any).symbolApi || '').trim();
  const side = String((data as any).side || '').toUpperCase();
  const orderType = String((data as any).orderType || '').toLowerCase();
  const lots = Number((data as any).lots);
  const price = Number((data as any).price);
  const tpRaw = (data as any).takeProfit ?? (data as any).tp;
  const slRaw = (data as any).stopLoss ?? (data as any).sl;
  const takeProfit = tpRaw === null || tpRaw === undefined ? null : Number(tpRaw);
  const stopLoss = slRaw === null || slRaw === undefined ? null : Number(slRaw);

  if (!symbolApi) {
    throw new HttpsError('invalid-argument', 'symbolApi invalide');
  }
  if (side !== 'BUY' && side !== 'SELL') {
    throw new HttpsError('invalid-argument', 'side invalide');
  }
  if (orderType !== 'limit' && orderType !== 'stop') {
    throw new HttpsError('invalid-argument', 'orderType invalide');
  }
  if (!Number.isFinite(lots) || lots <= 0) {
    throw new HttpsError('invalid-argument', 'lots invalide');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new HttpsError('invalid-argument', 'price invalide');
  }
  if (takeProfit !== null && !Number.isFinite(takeProfit)) {
    throw new HttpsError('invalid-argument', 'takeProfit invalide');
  }
  if (stopLoss !== null && !Number.isFinite(stopLoss)) {
    throw new HttpsError('invalid-argument', 'stopLoss invalide');
  }

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Utilisateur introuvable');
  }
  const userData = userDoc.data() as any;

  const requestedAccountIdRaw = (data as any)?.accountId ? String((data as any).accountId) : '';
  const resolvedAccountId = requestedAccountIdRaw.trim() || (typeof userData?.activeAccountId === 'string' ? userData.activeAccountId : '');
  if (!resolvedAccountId) {
    throw new HttpsError('failed-precondition', 'Aucun compte actif');
  }

  const accountRef = db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) {
    throw new HttpsError('not-found', 'Compte introuvable');
  }
  const accountData = accountSnap.data() as any;

  if (accountData?.accountStatus !== 'active') {
    throw new HttpsError('failed-precondition', `Compte ${accountData?.accountStatus}. Trading désactivé.`);
  }

  const pendingCountSnap = await db.collection('orders')
    .where('userId', '==', userId)
    .where('status', '==', 'pending')
    .get();
  const pendingForAccount = pendingCountSnap.docs.filter((d) => {
    const o = d.data() as any;
    const oid = typeof o?.accountId === 'string' ? o.accountId : '';
    return oid === resolvedAccountId;
  }).length;
  if (pendingForAccount >= 20) {
    throw new HttpsError('failed-precondition', 'Trop d\'ordres en attente (max 20)');
  }

  const marginUsed = calculateMargin(symbolApi, lots, price);

  const marginCheck = await validateMargin(userId, resolvedAccountId, accountData, symbolApi, lots, price);
  if (!marginCheck.allowed) {
    await auditLog('order_rejected', userId, {
      reason: 'insufficient_margin',
      detail: marginCheck.reason,
      symbolApi,
      side,
      orderType,
      price,
      lots,
    });
    throw new HttpsError('failed-precondition', marginCheck.reason || 'Marge insuffisante');
  }

  const orderRef = db.collection('orders').doc();
  await db.runTransaction(async (tx) => {
    tx.set(orderRef, {
      userId,
      accountId: resolvedAccountId,
      symbol: symbol || symbolApi,
      symbolApi,
      side,
      orderType,
      price,
      lots,
      takeProfit,
      stopLoss,
      tp: takeProfit,
      sl: stopLoss,
      margin: marginUsed,
      reservedMargin: true,
      status: 'pending',
      validatedByServer: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(accountRef, {
      availableBalance: admin.firestore.FieldValue.increment(-marginUsed),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await auditLog('order_placed', userId, {
    orderId: orderRef.id,
    symbolApi,
    side,
    orderType,
    price,
    lots,
    margin: marginUsed,
  });

  return {
    success: true,
    orderId: orderRef.id,
    margin: marginUsed,
  };
});

export const cancelOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;
  const orderId = request?.data?.orderId ? String(request.data.orderId).trim() : '';
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'orderId invalide');
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', 'Ordre introuvable');
  }

  const order = orderSnap.data() as any;
  if (order?.userId !== userId) {
    throw new HttpsError('permission-denied', 'Accès interdit');
  }
  if (order?.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Ordre déjà traité');
  }

  const orderAccountId = typeof order?.accountId === 'string' ? String(order.accountId) : '';
  const reserved = Boolean(order?.reservedMargin);
  const margin = Number(order?.margin);
  const marginToRelease = reserved && Number.isFinite(margin) && margin > 0 ? margin : 0;

  await db.runTransaction(async (tx) => {
    tx.update(orderRef, {
      status: 'cancelled',
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (marginToRelease > 0 && orderAccountId) {
      const accountRef = db.collection('users').doc(userId).collection('accounts').doc(orderAccountId);
      tx.update(accountRef, {
        availableBalance: admin.firestore.FieldValue.increment(marginToRelease),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  await auditLog('order_cancelled', userId, { orderId });

  return { success: true };
});

// ==========================================
// FONCTION SCHEDULED: METTRE À JOUR LES JOURS DE TRADING
// ==========================================

export const updateTradingDays = onSchedule('0 0 * * *', async (event) => {
  console.log('🗓️ Mise à jour des jours de trading...');

  const yesterdayStart = new Date();
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCHours(23, 59, 59, 999);

  const startTs = admin.firestore.Timestamp.fromDate(yesterdayStart);
  const endTs = admin.firestore.Timestamp.fromDate(yesterdayEnd);

  // Trouver tous les trades ouverts hier (Timestamp)
  const tradesSnapshot = await db.collection('trades')
    .where('openedAt', '>=', startTs)
    .where('openedAt', '<=', endTs)
    .get();

  const accountsWhoTraded = new Map<string, Set<string>>();
  tradesSnapshot.forEach((docSnap) => {
    const t = docSnap.data() as any;
    const uid = typeof t?.userId === 'string' ? t.userId : '';
    const accId = typeof t?.accountId === 'string'
      ? t.accountId
      : (typeof t?.activeAccountId === 'string' ? t.activeAccountId : '');
    if (!uid || !accId) return;
    if (!accountsWhoTraded.has(uid)) accountsWhoTraded.set(uid, new Set<string>());
    accountsWhoTraded.get(uid)!.add(accId);
  });

  const batch = db.batch();
  for (const [uid, accIds] of accountsWhoTraded.entries()) {
    for (const accId of accIds.values()) {
      const accRef = db.collection('users').doc(uid).collection('accounts').doc(accId);
      batch.set(accRef, {
        tradingDays: admin.firestore.FieldValue.increment(1),
        lastTradeDayCountedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  await batch.commit();
  console.log(`✅ Mis à jour ${accountsWhoTraded.size} utilisateurs (tradingDays par compte)`);
});

// ==========================================
// FONCTION SCHEDULED: FERMER LES TRADES AVANT LE WEEK-END
// ==========================================

export const closeTradesBeforeWeekend = onSchedule({
  schedule: '0 21 * * 5', // Vendredi 21:00 UTC (avant fermeture marché 22:00)
  timeZone: 'UTC',
  secrets: [finnhubApiKey]
}, async (event) => {
  console.log('🔒 Fermeture automatique des trades avant le week-end...');

  try {
    // Trouver tous les trades ouverts
    const openTradesSnapshot = await db.collection('trades')
      .where('status', '==', 'open')
      .get();

    if (openTradesSnapshot.empty) {
      console.log('✅ Aucun trade ouvert à fermer');
      return;
    }

    console.log(`📊 ${openTradesSnapshot.size} trades ouverts trouvés`);

    let closedCount = 0;
    let errorCount = 0;

    // Fermer chaque trade
    for (const tradeDoc of openTradesSnapshot.docs) {
      const trade = tradeDoc.data();
      const tradeId = tradeDoc.id;

      try {
        // Obtenir le prix de clôture validé depuis Finnhub
        const closePrice = await getValidatedPrice(trade.symbolApi);
        console.log(`✅ Prix validé pour ${trade.symbol}: ${closePrice}`);

        // Calculer le P&L
        const entryPrice = trade.entryPrice;
        const lots = trade.lots;

        const pipValue = 10; // USD par pip pour 1 lot standard
        const pipStep = trade.symbolApi.includes('JPY') ? 0.01 : 0.0001;
        const pipDiff = (closePrice - entryPrice) / pipStep;
        let pnl = pipDiff * pipValue * lots;

        // Inverser si SELL
        if (trade.side === 'SELL') {
          pnl = -pnl;
        }

        const marginReleased = Number(trade.marginUsed) || calculateMargin(trade.symbolApi, lots, entryPrice);

        console.log(`💰 P&L calculé pour ${trade.symbol}: ${pnl.toFixed(2)} USD`);

        // Transaction atomique pour fermer le trade
        await db.runTransaction(async (transaction) => {
          // Mettre à jour le trade
          transaction.update(tradeDoc.ref, {
            status: 'closed',
            closePrice,
            pnl,
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            closedBy: 'weekend_auto_close'
          });

          const userRef = db.collection('users').doc(trade.userId);
          const userSnap = await transaction.get(userRef);

          const tradeAccountId = typeof (trade as any)?.accountId === 'string'
            ? String((trade as any).accountId)
            : (typeof (trade as any)?.activeAccountId === 'string' ? String((trade as any).activeAccountId) : '');
          const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
            ? (userSnap.data() as any).activeAccountId
            : '';
          const resolvedAccountId = tradeAccountId || fallbackAccountId;
          if (!resolvedAccountId) {
            throw new HttpsError('failed-precondition', 'Aucun compte actif');
          }

          const accountRef = db.collection('users').doc(trade.userId).collection('accounts').doc(resolvedAccountId);
          transaction.update(accountRef, {
            accountBalance: admin.firestore.FieldValue.increment(pnl),
            availableBalance: admin.firestore.FieldValue.increment(pnl + marginReleased),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        // Log d'audit
        await auditLog('weekend_auto_close', trade.userId, {
          tradeId,
          symbol: trade.symbol,
          side: trade.side,
          lots,
          entryPrice,
          closePrice,
          pnl,
          marginReleased
        });

        try {
          const tradeAccountId = typeof (trade as any)?.accountId === 'string'
            ? String((trade as any).accountId)
            : (typeof (trade as any)?.activeAccountId === 'string' ? String((trade as any).activeAccountId) : '');
          const userRef = db.collection('users').doc(trade.userId);
          const userSnap = await userRef.get();
          const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
            ? (userSnap.data() as any).activeAccountId
            : '';
          const resolvedAccountId = tradeAccountId || fallbackAccountId;
          if (resolvedAccountId) {
            const accountDoc = await db.collection('users').doc(trade.userId).collection('accounts').doc(resolvedAccountId).get();
            const accountData = accountDoc.exists ? (accountDoc.data() as any) : {};
            const initialBalance = Number(accountData?.initialBalance ?? accountData?.accountBalance ?? 25000);
            const currentBalance = Number(accountData?.accountBalance ?? 0);

            const maxTotalDrawdownPercent = Number(accountData?.maxTotalDrawdownPercent);
            const resolvedMaxTotal = Number.isFinite(maxTotalDrawdownPercent) && maxTotalDrawdownPercent > 0 ? maxTotalDrawdownPercent : 8;
            const rawMaxDaily = accountData?.maxDailyDrawdownPercent;
            const maxDailyDrawdownPercent = rawMaxDaily === null
              ? null
              : Number.isFinite(Number(rawMaxDaily)) && Number(rawMaxDaily) > 0
                ? Number(rawMaxDaily)
                : 3;

            const totalRes = await validateAccountTotalDrawdown(trade.userId, resolvedAccountId, initialBalance, currentBalance, resolvedMaxTotal);
            if (!totalRes.allowed) {
              await db.collection('users').doc(trade.userId).collection('accounts').doc(resolvedAccountId).set({
                accountStatus: 'suspended',
                suspensionReason: totalRes.reason || 'Violation drawdown total',
                suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            }

            const dailyRes = await validateAccountDailyDrawdown(trade.userId, resolvedAccountId, initialBalance, maxDailyDrawdownPercent);
            if (!dailyRes.allowed) {
              await db.collection('users').doc(trade.userId).collection('accounts').doc(resolvedAccountId).set({
                accountStatus: 'suspended',
                suspensionReason: dailyRes.reason || 'Violation drawdown journalier',
                suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          }
        } catch (e) {
        }

        closedCount++;
        console.log(`✅ Trade ${tradeId} fermé automatiquement`);

      } catch (error: any) {
        errorCount++;
        console.error(`❌ Erreur fermeture trade ${tradeId}:`, error.message);

        // Log d'erreur
        await auditLog('weekend_auto_close_error', trade.userId, {
          tradeId,
          error: error.message
        });
      }
    }

    console.log(`✅ Fermeture automatique terminée: ${closedCount} fermés, ${errorCount} erreurs`);

  } catch (error: any) {
    console.error('❌ Erreur critique fermeture week-end:', error);
  }
});

// ==========================================
// FONCTION: CALCULER LES DRAWDOWNS
// ==========================================

export const calculateDrawdowns = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;

  // Charger le user
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Utilisateur introuvable');
  }

  const userData = userDoc.data()!;
  const initialBalance = userData.initialBalance || userData.accountBalance;

  // Calculer le drawdown total
  const tradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .where('status', '==', 'closed')
    .orderBy('closedAt', 'asc')
    .get();

  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdown = 0;

  tradesSnapshot.forEach((doc) => {
    const trade = doc.data();
    balance += trade.pnl || 0;

    if (balance > peakBalance) {
      peakBalance = balance;
    }

    const currentDrawdown = peakBalance - balance;
    const currentDrawdownPercent = (currentDrawdown / peakBalance) * 100;

    if (currentDrawdownPercent > maxDrawdown) {
      maxDrawdown = currentDrawdownPercent;
    }
  });

  // Calculer le drawdown journalier
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayTradesSnapshot = await db.collection('trades')
    .where('userId', '==', userId)
    .where('closedAt', '>=', todayStart.toISOString())
    .where('status', '==', 'closed')
    .get();

  let todayPnl = 0;
  todayTradesSnapshot.forEach((doc) => {
    todayPnl += doc.data().pnl || 0;
  });

  const dailyDrawdown = todayPnl < 0 ? Math.abs(todayPnl) : 0;
  const dailyDrawdownPercent = (dailyDrawdown / balance) * 100;

  return {
    totalDrawdownPercent: maxDrawdown.toFixed(2),
    dailyDrawdownPercent: dailyDrawdownPercent.toFixed(2),
    peakBalance,
    currentBalance: balance,
    todayPnl
  };
});

// ==========================================
// FONCTION: UPGRADE CHALLENGE → COMPTE FINANCÉ
// ==========================================

export const upgradeChallenge = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;

  const requestedAccountIdRaw = (request.data && (request.data as any).accountId) ? String((request.data as any).accountId) : '';
  const requestedAccountId = requestedAccountIdRaw.trim();

  console.log(`🎯 Tentative d'upgrade challenge → compte financé: ${userId}`);

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Utilisateur introuvable');
  const userData = userDoc.data() as any;

  const activeAccountId = requestedAccountId || (typeof userData?.activeAccountId === 'string' ? userData.activeAccountId : '');
  if (!activeAccountId) throw new HttpsError('failed-precondition', 'Aucun compte actif');

  const accountRef = db.collection('users').doc(userId).collection('accounts').doc(activeAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError('not-found', 'Compte introuvable');
  const accountData = accountSnap.data() as any;

  const accountStatus = typeof accountData?.accountStatus === 'string' ? accountData.accountStatus : '';
  if (accountStatus !== 'active') throw new HttpsError('failed-precondition', `Compte ${accountStatus}. Upgrade impossible.`);

  const accountTypeRaw = typeof accountData?.accountType === 'string' ? accountData.accountType : '';
  const isFunded = Boolean(accountData?.isFunded) || accountTypeRaw.toLowerCase() === 'funded';
  if (isFunded) throw new HttpsError('failed-precondition', 'Ce compte est déjà financé');

  const initialBalance = Number(accountData?.initialBalance ?? accountData?.accountBalance ?? 0);
  const currentBalance = Number(accountData?.accountBalance ?? 0);
  if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
    throw new HttpsError('failed-precondition', 'Initial balance invalide');
  }

  const profitPercent = ((currentBalance - initialBalance) / initialBalance) * 100;
  const stats = await getAccountTradeStats(userId, activeAccountId);
  const tradingDaysFromAccount = Number(accountData?.tradingDays);
  const tradingDaysFromStats = Number(stats?.tradingDays);
  const tradingDays = Number.isFinite(tradingDaysFromStats)
    ? tradingDaysFromStats
    : (Number.isFinite(tradingDaysFromAccount) ? tradingDaysFromAccount : 0);

  if (tradingDays < 3) {
    throw new HttpsError('failed-precondition', `Vous devez trader pendant au moins 3 jours. Jours actuels: ${tradingDays}/3`);
  }
  if (profitPercent < 10) {
    throw new HttpsError('failed-precondition', `Profit insuffisant. Requis: 10%, Actuel: ${profitPercent.toFixed(2)}%`);
  }

  const maxTotalDrawdownPercent = Number(accountData?.maxTotalDrawdownPercent);
  const resolvedMaxTotal = Number.isFinite(maxTotalDrawdownPercent) && maxTotalDrawdownPercent > 0 ? maxTotalDrawdownPercent : 8;
  const rawMaxDaily = accountData?.maxDailyDrawdownPercent;
  const maxDailyDrawdownPercent = rawMaxDaily === null
    ? null
    : Number.isFinite(Number(rawMaxDaily)) && Number(rawMaxDaily) > 0
      ? Number(rawMaxDaily)
      : 3;

  const totalDrawdownCheck = await validateAccountTotalDrawdown(userId, activeAccountId, initialBalance, currentBalance, resolvedMaxTotal);
  if (!totalDrawdownCheck.allowed) {
    throw new HttpsError('failed-precondition', totalDrawdownCheck.reason || 'Violation drawdown total');
  }
  const dailyDrawdownCheck = await validateAccountDailyDrawdown(userId, activeAccountId, initialBalance, maxDailyDrawdownPercent);
  if (!dailyDrawdownCheck.allowed) {
    throw new HttpsError('failed-precondition', dailyDrawdownCheck.reason || 'Violation drawdown journalier');
  }

  try {
    const brokerIdentifier = await ensureBrokerIdentifier(userId);
    const brokerPassword = generateSecurePassword();
    const planType = typeof accountData?.planType === 'string' ? accountData.planType : '';
    const fundedAccountsSnap = await db.collection('users').doc(userId).collection('accounts').get();
    const fundedCount = fundedAccountsSnap.docs.filter((d) => {
      const a = d.data() as any;
      const t = typeof a?.accountType === 'string' ? a.accountType.toLowerCase() : '';
      return (Boolean(a?.isFunded) || t === 'funded') && a?.accountStatus;
    }).length;
    const accountName = `Funded ${planType || 'Compte'} #${fundedCount + 1}`;

    const fundedRef = await db.collection('users').doc(userId).collection('accounts').add({
      accountName,
      accountStatus: 'active',
      accountType: 'funded',
      isFunded: true,
      planType: planType || accountData?.planType || 'funded',
      challengeType: accountData?.challengeType || 'standard',
      accountBalance: currentBalance,
      initialBalance: currentBalance,
      initialFundedBalance: currentBalance,
      fundedAt: admin.firestore.FieldValue.serverTimestamp(),
      tradingDays: 0,
      profitTarget: accountData?.profitTarget || 10,
      maxDrawdown: accountData?.maxDrawdown || 5,
      brokerPassword,
      upgradedFromAccountId: activeAccountId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await accountRef.set({
      accountStatus: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      passedAt: admin.firestore.FieldValue.serverTimestamp(),
      profitAtPass: profitPercent,
    }, { merge: true });

    await db.collection('users').doc(userId).set({
      activeAccountId: fundedRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const toEmail = (typeof userData?.email === 'string' ? userData.email : (typeof request.auth.token.email === 'string' ? request.auth.token.email : '')).trim().toLowerCase();
    if (toEmail) {
      const from = 'AMA FIRM <ama.firm.fr@gmail.com>';
      const brokerLoginUrl = 'https://ama-brocker.web.app/login.html';
      const emailContent = buildFundedCreatedEmail({
        accountName,
        brokerIdentifier,
        brokerPassword,
        brokerLoginUrl,
        profitPercent,
        tradingDays,
        isForce: false,
      });

      try {
        await db.collection('mail').add({
          to: [toEmail],
          message: {
            from,
            replyTo: 'paul.ama.firm.fr@gmail.com',
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
            headers: {
              'X-AMA-Email': 'funded_created',
              'X-AMA-UserId': userId,
              'X-AMA-AccountId': fundedRef.id,
            },
          },
        });
      } catch (e) {
      }
    }

    await auditLog('challenge_upgraded', userId, {
      fromAccountId: activeAccountId,
      toAccountId: fundedRef.id,
      tradingDays,
      profitPercent: profitPercent.toFixed(2),
      initialBalance,
      currentBalance,
    });

    return {
      success: true,
      message: `Félicitations! Votre challenge est validé avec ${profitPercent.toFixed(2)}% de profit en ${tradingDays} jours.`,
      newAccountType: 'funded',
      fundedBalance: currentBalance,
      fundedAccountId: fundedRef.id,
    };
  } catch (error: any) {
    console.error('❌ Erreur upgrade challenge:', error);
    throw new HttpsError('internal', `Erreur: ${error?.message || 'unknown'}`);
  }
});

export const forceUpgradeChallenge = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const callerId = request.auth.uid;
  const { userId: targetUserIdRaw, accountId: requestedAccountIdRaw } = (request.data || {}) as any;
  const targetUserId = (typeof targetUserIdRaw === 'string' && targetUserIdRaw.trim()) ? targetUserIdRaw.trim() : callerId;
  const requestedAccountId = (typeof requestedAccountIdRaw === 'string' && requestedAccountIdRaw.trim()) ? requestedAccountIdRaw.trim() : '';

  const callerDoc = await db.collection('users').doc(callerId).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs');
  }

  console.log(`🧪 Force upgrade challenge → funded: caller=${callerId}, target=${targetUserId}`);

  const userDoc = await db.collection('users').doc(targetUserId).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Utilisateur introuvable');
  const userData = userDoc.data() as any;

  const activeAccountId = requestedAccountId || (typeof userData?.activeAccountId === 'string' ? userData.activeAccountId : '');
  if (!activeAccountId) throw new HttpsError('failed-precondition', 'Aucun compte actif');

  const accountRef = db.collection('users').doc(targetUserId).collection('accounts').doc(activeAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError('not-found', 'Compte introuvable');
  const accountData = accountSnap.data() as any;

  const accountStatus = typeof accountData?.accountStatus === 'string' ? accountData.accountStatus : '';
  if (accountStatus !== 'active') throw new HttpsError('failed-precondition', `Compte ${accountStatus}. Upgrade impossible.`);

  const accountTypeRaw = typeof accountData?.accountType === 'string' ? accountData.accountType : '';
  const isFunded = Boolean(accountData?.isFunded) || accountTypeRaw.toLowerCase() === 'funded';
  if (isFunded) throw new HttpsError('failed-precondition', 'Ce compte est déjà financé');

  const initialBalance = Number(accountData?.initialBalance ?? accountData?.accountBalance ?? 0);
  const currentBalance = Number(accountData?.accountBalance ?? 0);
  if (!Number.isFinite(currentBalance) || currentBalance <= 0) {
    throw new HttpsError('failed-precondition', 'Balance invalide');
  }

  const profitPercent = (Number.isFinite(initialBalance) && initialBalance > 0)
    ? ((currentBalance - initialBalance) / initialBalance) * 100
    : 0;

  try {
    const brokerIdentifier = await ensureBrokerIdentifier(targetUserId);
    const brokerPassword = generateSecurePassword();
    const planType = typeof accountData?.planType === 'string' ? accountData.planType : '';
    const fundedAccountsSnap = await db.collection('users').doc(targetUserId).collection('accounts').get();
    const fundedCount = fundedAccountsSnap.docs.filter((d) => {
      const a = d.data() as any;
      const t = typeof a?.accountType === 'string' ? a.accountType.toLowerCase() : '';
      return (Boolean(a?.isFunded) || t === 'funded') && a?.accountStatus;
    }).length;
    const accountName = `Funded ${planType || 'Compte'} #${fundedCount + 1}`;

    const fundedRef = await db.collection('users').doc(targetUserId).collection('accounts').add({
      accountName,
      accountStatus: 'active',
      accountType: 'funded',
      isFunded: true,
      planType: planType || accountData?.planType || 'funded',
      challengeType: accountData?.challengeType || 'standard',
      accountBalance: currentBalance,
      initialBalance: currentBalance,
      initialFundedBalance: currentBalance,
      fundedAt: admin.firestore.FieldValue.serverTimestamp(),
      tradingDays: 0,
      profitTarget: accountData?.profitTarget || 10,
      maxDrawdown: accountData?.maxDrawdown || 5,
      brokerPassword,
      upgradedFromAccountId: activeAccountId,
      forceUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      forceUpgradedBy: callerId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await accountRef.set({
      accountStatus: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      forcePassedAt: admin.firestore.FieldValue.serverTimestamp(),
      profitAtPass: profitPercent,
    }, { merge: true });

    await db.collection('users').doc(targetUserId).set({
      activeAccountId: fundedRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const toEmail = (typeof userData?.email === 'string' ? userData.email : '').trim().toLowerCase();
    if (toEmail) {
      const from = 'AMA FIRM <ama.firm.fr@gmail.com>';
      const brokerLoginUrl = 'https://ama-brocker.web.app/login.html';
      const emailContent = buildFundedCreatedEmail({
        accountName,
        brokerIdentifier,
        brokerPassword,
        brokerLoginUrl,
        profitPercent,
        isForce: true,
      });

      try {
        await db.collection('mail').add({
          to: [toEmail],
          message: {
            from,
            replyTo: 'paul.ama.firm.fr@gmail.com',
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
            headers: {
              'X-AMA-Email': 'funded_created_force',
              'X-AMA-UserId': targetUserId,
              'X-AMA-AccountId': fundedRef.id,
            },
          },
        });
      } catch (e) {
      }
    }

    await auditLog('challenge_force_upgraded', targetUserId, {
      fromAccountId: activeAccountId,
      toAccountId: fundedRef.id,
      profitPercent: profitPercent.toFixed(2),
      initialBalance,
      currentBalance,
      forcedBy: callerId,
    });

    return {
      success: true,
      message: 'Compte financé créé (force upgrade).',
      fundedAccountId: fundedRef.id,
      fundedBalance: currentBalance,
    };
  } catch (error: any) {
    console.error('❌ Erreur force upgrade challenge:', error);
    throw new HttpsError('internal', `Erreur: ${error?.message || 'unknown'}`);
  }
});

// ==========================================
// FONCTION: CHECK PAYOUT ELIGIBILITY
// ==========================================

export const checkPayoutEligibility = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;
  const accountIdRaw = request.data && request.data.accountId ? String(request.data.accountId) : '';
  const accountId = accountIdRaw.trim();

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Utilisateur introuvable');
  const userData = userDoc.data() as any;

  const resolvedAccountId = accountId || (typeof userData?.activeAccountId === 'string' ? userData.activeAccountId : '');
  if (!resolvedAccountId) throw new HttpsError('failed-precondition', 'Aucun compte sélectionné');

  const accountRef = db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError('not-found', 'Compte introuvable');
  const acc = accountSnap.data() as any;

  const accStatus = typeof acc?.accountStatus === 'string' ? acc.accountStatus : '';
  if (accStatus !== 'active') {
    return {
      eligible: false,
      reason: `Compte ${accStatus || 'inactif'}.`,
      maxPayout: 0,
      accountId: resolvedAccountId,
    };
  }

  const accType = typeof acc?.accountType === 'string' ? acc.accountType.toLowerCase() : '';
  const funded = Boolean(acc?.isFunded) || accType === 'funded';
  if (!funded) {
    return {
      eligible: false,
      reason: 'Compte non financé.',
      maxPayout: 0,
      accountId: resolvedAccountId,
    };
  }

  const currentBalance = Number(acc?.accountBalance ?? 0);
  const initialBalance = Number(acc?.initialFundedBalance ?? acc?.initialBalance ?? 0);
  const maxPayout = Math.max(0, currentBalance - initialBalance);

  // Admin override: allow showing eligible even if rules not met, but keep amount bound to profit.
  const overrideEligible = Boolean(acc?.payoutEligibleOverride);
  if (overrideEligible) {
    return {
      eligible: true,
      reason: 'Eligibilité admin.',
      maxPayout,
      accountId: resolvedAccountId,
      override: true,
    };
  }

  const payoutsReceived = Number(acc?.payoutsReceived ?? 0);
  const lastPayoutAt = acc?.lastPayoutAt;
  const fundedAt = acc?.fundedAt;

  const fundedDate = toJsDate(fundedAt) || null;
  if (!fundedDate) {
    return {
      eligible: false,
      reason: 'Date de funding manquante.',
      maxPayout,
      accountId: resolvedAccountId,
    };
  }

  if (payoutsReceived === 0) {
    const daysSinceFunding = Math.floor((Date.now() - fundedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceFunding < 15) {
      return {
        eligible: false,
        reason: `Premier payout après 15 jours (${daysSinceFunding}/15).`,
        maxPayout,
        accountId: resolvedAccountId,
      };
    }

    const requiredBalance = initialBalance * 1.05;
    if (currentBalance < requiredBalance) {
      return {
        eligible: false,
        reason: `Solde requis 105% (${requiredBalance.toFixed(2)}).`,
        maxPayout,
        accountId: resolvedAccountId,
      };
    }

    // $150 profit on 4 different days since funding
    const tradesSnapshot = await db.collection('trades')
      .where('userId', '==', userId)
      .where('status', '==', 'closed')
      .get();

    const profitByDay = new Map<string, number>();
    tradesSnapshot.forEach((doc) => {
      const trade = doc.data() as any;
      if (!trade || trade.accountId !== resolvedAccountId) return;
      const closedDate = toJsDate(trade.closedAt);
      if (!closedDate) return;
      if (closedDate.getTime() < fundedDate.getTime()) return;
      const dateKey = closedDate.toISOString().split('T')[0];
      profitByDay.set(dateKey, (profitByDay.get(dateKey) || 0) + (Number(trade.pnl) || 0));
    });

    let daysWithTarget = 0;
    for (const profit of profitByDay.values()) {
      if (profit >= 150) daysWithTarget++;
    }

    if (daysWithTarget < 4) {
      return {
        eligible: false,
        reason: `Requis: $150 sur 4 jours (${daysWithTarget}/4).`,
        maxPayout,
        accountId: resolvedAccountId,
      };
    }
  }

  if (payoutsReceived > 0 && lastPayoutAt) {
    const lastPayoutDate = toJsDate(lastPayoutAt);
    if (lastPayoutDate) {
      const daysSinceLastPayout = Math.floor((Date.now() - lastPayoutDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastPayout < 15) {
        return {
          eligible: false,
          reason: `Payouts tous les 15 jours (${daysSinceLastPayout}/15).`,
          maxPayout,
          accountId: resolvedAccountId,
        };
      }
    }
  }

  return {
    eligible: true,
    reason: 'Eligible.',
    maxPayout,
    accountId: resolvedAccountId,
  };
});

// ==========================================
// FONCTION: DEMANDER UN PAYOUT
// ==========================================

export const requestPayout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const userId = request.auth.uid;
  const requestedAmount = request.data.amount;
  const accountIdRaw = request.data && request.data.accountId ? String(request.data.accountId) : '';
  const accountId = accountIdRaw.trim();

  const firstName = request.data && request.data.firstName ? String(request.data.firstName).trim() : '';
  const lastName = request.data && request.data.lastName ? String(request.data.lastName).trim() : '';
  const rib = request.data && request.data.rib ? String(request.data.rib).trim() : '';

  console.log(`💰 Demande de payout: ${userId}, montant: ${requestedAmount}`);

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Utilisateur introuvable');
  const userData = userDoc.data() as any;

  const resolvedAccountId = accountId || (typeof userData?.activeAccountId === 'string' ? userData.activeAccountId : '');
  if (!resolvedAccountId) throw new HttpsError('failed-precondition', 'Aucun compte sélectionné');

  const accountRef = db.collection('users').doc(userId).collection('accounts').doc(resolvedAccountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError('not-found', 'Compte introuvable');
  const acc = accountSnap.data() as any;

  const accStatus = typeof acc?.accountStatus === 'string' ? acc.accountStatus : '';
  if (accStatus !== 'active') throw new HttpsError('failed-precondition', `Compte ${accStatus}. Payout impossible.`);

  const accType = typeof acc?.accountType === 'string' ? acc.accountType.toLowerCase() : '';
  const funded = Boolean(acc?.isFunded) || accType === 'funded';
  if (!funded) {
    throw new HttpsError('failed-precondition', 'Vous devez sélectionner un compte financé pour demander un payout');
  }

  const overrideEligible = Boolean(acc?.payoutEligibleOverride);

  const payoutsReceived = acc.payoutsReceived || 0;
  const lastPayoutAt = acc.lastPayoutAt;
  const fundedAt = acc.fundedAt;

  // 2. RÈGLES POUR LE PREMIER PAYOUT
  if (!overrideEligible && payoutsReceived === 0) {
    console.log('📋 Vérification des règles du premier payout...');

    // Règle A: 15 jours depuis le financement
    const fundedDate = fundedAt?.toDate ? fundedAt.toDate() : new Date(fundedAt);
    const daysSinceFunding = Math.floor((Date.now() - fundedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceFunding < 15) {
      throw new HttpsError(
        'failed-precondition',
        `Premier payout disponible après 15 jours. Jours écoulés: ${daysSinceFunding}/15`
      );
    }

    // Règle B: 105% du solde initial
    const initialBalance = acc.initialFundedBalance || acc.initialBalance;
    const currentBalance = acc.accountBalance;
    const requiredBalance = initialBalance * 1.05;

    if (currentBalance < requiredBalance) {
      throw new HttpsError(
        'failed-precondition',
        `Solde insuffisant. Requis: ${requiredBalance.toFixed(2)} USD (105%), Actuel: ${currentBalance.toFixed(2)} USD`
      );
    }

    // Règle C: $150 de profit sur 4 jours différents
    const tradesSnapshot = await db.collection('trades')
      .where('userId', '==', userId)
      .where('status', '==', 'closed')
      .get();

    // Grouper par jour
    const profitByDay = new Map<string, number>();
    tradesSnapshot.forEach((doc) => {
      const trade = doc.data();
      if (!trade || trade.accountId !== resolvedAccountId) return;
      if (!trade.closedAt) return;
      const closedDate = new Date(trade.closedAt);
      if (isNaN(closedDate.getTime())) return;
      if (closedDate.getTime() < fundedDate.getTime()) return;
      const dateKey = closedDate.toISOString().split('T')[0];
      const currentProfit = profitByDay.get(dateKey) || 0;
      profitByDay.set(dateKey, currentProfit + (trade.pnl || 0));
    });

    // Compter les jours avec $150+ de profit
    let daysWithTarget = 0;
    for (const [day, profit] of profitByDay.entries()) {
      if (profit >= 150) {
        daysWithTarget++;
      }
    }

    if (daysWithTarget < 4) {
      throw new HttpsError(
        'failed-precondition',
        `Vous devez faire $150 de profit sur 4 jours différents. Jours validés: ${daysWithTarget}/4`
      );
    }

    console.log(`✅ Toutes les règles du premier payout sont respectées`);
  }

  // 3. RÈGLES POUR LES PAYOUTS SUIVANTS
  if (!overrideEligible && payoutsReceived > 0 && lastPayoutAt) {
    const lastPayoutDate = lastPayoutAt.toDate ? lastPayoutAt.toDate() : new Date(lastPayoutAt);
    const daysSinceLastPayout = Math.floor((Date.now() - lastPayoutDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastPayout < 15) {
      throw new HttpsError(
        'failed-precondition',
        `Les payouts sont disponibles tous les 15 jours. Jours écoulés: ${daysSinceLastPayout}/15`
      );
    }
  }

  // 4. VÉRIFIER LE MONTANT
  if (!requestedAmount || requestedAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Montant invalide');
  }

  // 5. CRÉER LA DEMANDE DE PAYOUT
  try {
    const payoutRef = db.collection('payouts').doc();

    if (!firstName || firstName.length < 2 || firstName.length > 60) {
      throw new HttpsError('invalid-argument', 'Prénom invalide');
    }
    if (!lastName || lastName.length < 2 || lastName.length > 60) {
      throw new HttpsError('invalid-argument', 'Nom invalide');
    }
    if (!rib || rib.length < 8 || rib.length > 120) {
      throw new HttpsError('invalid-argument', 'RIB/IBAN invalide');
    }

    const amount = Number(requestedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Montant invalide');
    }

    const txResult = await db.runTransaction(async (transaction) => {
      const freshAccountSnap = await transaction.get(accountRef);
      if (!freshAccountSnap.exists) {
        throw new HttpsError('not-found', 'Compte introuvable');
      }
      const freshAcc = freshAccountSnap.data() as any;

      const currentBalance = Number(freshAcc?.accountBalance ?? 0);
      const initialBalance = Number(freshAcc?.initialFundedBalance ?? freshAcc?.initialBalance ?? 0);
      const maxPayout = Math.max(0, currentBalance - initialBalance);

      if (amount > maxPayout) {
        throw new HttpsError(
          'failed-precondition',
          `Montant trop élevé. Maximum disponible: ${maxPayout.toFixed(2)} USD (profit uniquement)`
        );
      }

      if (currentBalance - amount < initialBalance) {
        throw new HttpsError('failed-precondition', 'Montant invalide vs capital');
      }

      const nextPayoutsReceived = Number(freshAcc?.payoutsReceived ?? payoutsReceived ?? 0);

      transaction.set(payoutRef, {
        userId,
        accountId: resolvedAccountId,
        amount: amount,
        status: 'pending',
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        reservedFromBalance: true,
        reservedAt: admin.firestore.FieldValue.serverTimestamp(),
        payoutNumber: nextPayoutsReceived + 1,
        isFirstPayout: nextPayoutsReceived === 0,
        accountBalance: currentBalance,
        kycVerified: userData.kycVerified || false,
        beneficiary: {
          firstName,
          lastName,
        },
        rib,
        maxPayoutAtRequest: maxPayout,
      });

      transaction.update(accountRef, {
        accountBalance: admin.firestore.FieldValue.increment(-amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        currentBalance,
        maxPayout,
      };
    });

    // Log d'audit
    await auditLog('payout_requested', userId, {
      payoutId: payoutRef.id,
      amount: amount,
      payoutNumber: payoutsReceived + 1,
      isFirstPayout: payoutsReceived === 0
    });

    console.log(`✅ Demande de payout créée: ${payoutRef.id}`);

    // Emails: user + support inbox
    const toEmail = (typeof userData?.email === 'string' ? userData.email : '').trim().toLowerCase();
    const supportInbox = 'ama.firm.fr@gmail.com';
    const from = 'AMA FIRM <ama.firm.fr@gmail.com>';

    const safe = (v: string) =>
      v
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const subjectUser = 'Votre demande de payout est en cours de traitement';
    const textUser =
      `Votre demande de payout a été reçue.\n\n` +
      `Montant: ${Number(requestedAmount).toFixed(2)} USD\n` +
      `Compte: ${resolvedAccountId}\n\n` +
      `Statut: en cours de traitement\n` +
      `Délai estimé: 24h à 72h\n\n` +
      `Support: ${supportInbox}`;

    const htmlUser = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Payout</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Demande enregistrée</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;font-size:13px;line-height:1.7;">
      <p style="margin:0 0 10px;">Votre demande de payout est <strong>en cours de traitement</strong>.</p>
      <div style="margin:12px 0;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
        <div><strong>Montant:</strong> ${safe(Number(requestedAmount).toFixed(2))} USD</div>
        <div><strong>Compte:</strong> ${safe(resolvedAccountId)}</div>
        <div><strong>Délai estimé:</strong> 24h à 72h</div>
      </div>
      <p style="margin:10px 0 0;color:#334155;">Si besoin, réponds à cet email.</p>
    </div>
  </div>
</body>
</html>`;

    const subjectSupport = `Payout demandé — ${Number(requestedAmount).toFixed(2)} USD`;
    const textSupport =
      `Nouvelle demande de payout\n\n` +
      `UserId: ${userId}\n` +
      `Email: ${toEmail || '—'}\n` +
      `AccountId: ${resolvedAccountId}\n` +
      `Montant: ${Number(requestedAmount).toFixed(2)} USD\n` +
      `Max disponible: ${Number(txResult.maxPayout).toFixed(2)} USD\n` +
      `Nom: ${firstName} ${lastName}\n` +
      `RIB: ${rib}\n` +
      `PayoutId: ${payoutRef.id}`;

    const htmlSupport = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:740px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Demande de payout</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">A traiter sous 24h à 72h</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;font-size:13px;line-height:1.7;">
      <div><strong>PayoutId:</strong> ${safe(payoutRef.id)}</div>
      <div><strong>UserId:</strong> ${safe(userId)}</div>
      <div><strong>Email:</strong> ${safe(toEmail || '—')}</div>
      <div><strong>AccountId:</strong> ${safe(resolvedAccountId)}</div>
      <div><strong>Montant:</strong> ${safe(Number(requestedAmount).toFixed(2))} USD</div>
      <div><strong>Max disponible:</strong> ${safe(Number(txResult.maxPayout).toFixed(2))} USD</div>
      <div style="margin-top:10px;"><strong>Nom:</strong> ${safe(firstName)} ${safe(lastName)}</div>
      <div><strong>RIB:</strong> ${safe(rib)}</div>
    </div>
  </div>
</body>
</html>`;

    try {
      // support
      await db.collection('mail').add({
        to: [supportInbox],
        message: {
          from,
          replyTo: toEmail || supportInbox,
          subject: subjectSupport,
          text: textSupport,
          html: htmlSupport,
          headers: {
            'X-AMA-Email': 'payout_requested_support',
            'X-AMA-UserId': userId,
            'X-AMA-AccountId': resolvedAccountId,
            'X-AMA-PayoutId': payoutRef.id,
          },
        },
      });
    } catch (e) {
    }

    if (toEmail) {
      try {
        await db.collection('mail').add({
          to: [toEmail],
          message: {
            from,
            replyTo: supportInbox,
            subject: subjectUser,
            text: textUser,
            html: htmlUser,
            headers: {
              'X-AMA-Email': 'payout_requested_user',
              'X-AMA-UserId': userId,
              'X-AMA-AccountId': resolvedAccountId,
              'X-AMA-PayoutId': payoutRef.id,
            },
          },
        });
      } catch (e) {
      }
    }

    return {
      success: true,
      payoutId: payoutRef.id,
      message: `Demande envoyée. Traitement sous 24h à 72h.`,
      estimatedProcessingDays: 3
    };

  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('❌ Erreur création payout:', error);
    throw new HttpsError('internal', `Erreur: ${error?.message || 'unknown'}`);
  }
});

// ==========================================
// FONCTION: APPROUVER/REJETER UN PAYOUT (ADMIN)
// ==========================================

export const approvePayout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Non authentifié');
  }

  const { payoutId, approved, rejectionReason } = request.data;

  // Vérifier que l'utilisateur est admin
  const adminDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs');
  }

  console.log(`🔐 Admin ${request.auth.uid} ${approved ? 'approuve' : 'rejette'} le payout ${payoutId}`);

  // Charger le payout
  const payoutDoc = await db.collection('payouts').doc(payoutId).get();
  if (!payoutDoc.exists) {
    throw new HttpsError('not-found', 'Payout introuvable');
  }

  const payout = payoutDoc.data()!;
  const payoutAmount = Number(payout.amount || 0);
  const payoutReserved = Boolean((payout as any).reservedFromBalance);

  if (payout.status !== 'pending') {
    throw new HttpsError('failed-precondition', `Ce payout a déjà été traité (status: ${payout.status})`);
  }

  try {
    if (approved) {
      // APPROUVER LE PAYOUT
      await payoutDoc.ref.update({
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: request.auth!.uid,
      });

      // Mettre à jour le compte (compteurs) sans re-déduire le solde.
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(payout.userId);
        const userSnap = await transaction.get(userRef);

        const payoutAccountId = typeof payout.accountId === 'string' ? payout.accountId : '';
        const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
          ? String((userSnap.data() as any).activeAccountId)
          : '';
        const accountId = (payoutAccountId || fallbackAccountId).trim();
        if (!accountId) {
          throw new HttpsError('failed-precondition', 'Aucun accountId associé au payout');
        }

        const accountRef = userRef.collection('accounts').doc(accountId);
        const accountSnap = await transaction.get(accountRef);
        if (!accountSnap.exists) {
          throw new HttpsError('not-found', 'Compte introuvable');
        }

        const accountData = accountSnap.data() as any;
        const nowMs = Date.now();

        const accType = typeof accountData?.accountType === 'string' ? accountData.accountType.toLowerCase() : '';
        const isFunded = Boolean(accountData?.isFunded) || accType === 'funded';

        const fundedAtRaw = accountData?.fundedAt;
        const fundedAtDate = toJsDate(fundedAtRaw);
        const fundedAtMs = fundedAtDate ? fundedAtDate.getTime() : null;

        const baselineBalance = Number(accountData?.initialFundedBalance ?? accountData?.initialBalance ?? 0);
        const baseline = Number.isFinite(baselineBalance) && baselineBalance > 0 ? baselineBalance : 0;

        const rawShare = Number(accountData?.profitSharePercent ?? 80);
        const profitSharePercent = Number.isFinite(rawShare) && rawShare > 0 && rawShare <= 100 ? rawShare : 80;

        const netAmount = (Number.isFinite(payoutAmount) && payoutAmount > 0)
          ? (payoutAmount * profitSharePercent) / 100
          : 0;

        const prevNetTotal = Number(accountData?.totalNetPayoutAmount ?? 0);
        const prevNetSinceScale = Number(accountData?.netPayoutSinceLastCapitalScale ?? 0);
        const nextNetTotal = prevNetTotal + netAmount;
        const nextNetSinceScale = prevNetSinceScale + netAmount;

        const lastCapitalScaleAtDate = toJsDate(accountData?.lastCapitalScaleAt);
        const lastCapitalScaleBaseMs = (lastCapitalScaleAtDate ? lastCapitalScaleAtDate.getTime() : (fundedAtMs ?? null));

        const months6Ms = 1000 * 60 * 60 * 24 * 30 * 6;
        const eligibleSixMonths = isFunded && fundedAtMs !== null && (nowMs - fundedAtMs) >= months6Ms;
        const eligibleCapitalWindow = isFunded && lastCapitalScaleBaseMs !== null && (nowMs - lastCapitalScaleBaseMs) >= months6Ms;

        const tenPercentThreshold = baseline > 0 ? baseline * 0.10 : 0;
        const canEvaluate = baseline > 0 && tenPercentThreshold > 0;

        const updates: any = {
          payoutsReceived: admin.firestore.FieldValue.increment(1),
          lastPayoutAt: admin.firestore.FieldValue.serverTimestamp(),
          totalPayoutAmount: admin.firestore.FieldValue.increment(Number.isFinite(payoutAmount) ? payoutAmount : 0),
          totalNetPayoutAmount: admin.firestore.FieldValue.increment(Number.isFinite(netAmount) ? netAmount : 0),
          netPayoutSinceLastCapitalScale: admin.firestore.FieldValue.increment(Number.isFinite(netAmount) ? netAmount : 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        let accountBalanceIncrement = 0;

        // Compat: si ancien payout (avant réservation), on déduit ici.
        if (!payoutReserved && Number.isFinite(payoutAmount) && payoutAmount > 0) {
          accountBalanceIncrement += -payoutAmount;
        }

        // Scaling automatique (uniquement funded / instant funded)
        if (canEvaluate) {
          // 1) Profit split -> 90% après 6 mois + 10% du solde (net payouts)
          if (eligibleSixMonths && profitSharePercent < 90 && nextNetTotal >= tenPercentThreshold) {
            updates.profitSharePercent = 90;
            updates.profitShareUpgradedAt = admin.firestore.FieldValue.serverTimestamp();
          }

          // 2) Capital scaling +25% tous les 6 mois si 10% retiré en payouts (net)
          if (eligibleCapitalWindow && nextNetSinceScale >= tenPercentThreshold) {
            const scaleIncrease = baseline * 0.25;
            if (Number.isFinite(scaleIncrease) && scaleIncrease > 0) {
              accountBalanceIncrement += scaleIncrease;
              updates.initialBalance = admin.firestore.FieldValue.increment(scaleIncrease);
              updates.initialFundedBalance = admin.firestore.FieldValue.increment(scaleIncrease);
              updates.lastCapitalScaleAt = admin.firestore.FieldValue.serverTimestamp();
              updates.capitalScaleCount = admin.firestore.FieldValue.increment(1);
              updates.netPayoutSinceLastCapitalScale = 0;
            }
          }
        }

        if (Number.isFinite(accountBalanceIncrement) && accountBalanceIncrement !== 0) {
          updates.accountBalance = admin.firestore.FieldValue.increment(accountBalanceIncrement);
        }

        transaction.update(accountRef, updates);
      });

      // Log d'audit
      await auditLog('payout_approved', payout.userId, {
        payoutId,
        amount: payout.amount,
        approvedBy: request.auth.uid
      });

      try {
        const userSnap = await db.collection('users').doc(payout.userId).get();
        const toEmail = (typeof userSnap.data()?.email === 'string' ? userSnap.data()!.email : '').trim().toLowerCase();
        if (toEmail) {
          const from = 'AMA FIRM <ama.firm.fr@gmail.com>';
          const supportInbox = 'ama.firm.fr@gmail.com';
          const safe = (v: string) =>
            v
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');

          const amount = Number(payout.amount || 0);
          const accountId = typeof payout.accountId === 'string' ? payout.accountId : '';

          const subjectUser = 'Votre payout a été envoyé';
          const textUser =
            `Bonne nouvelle !\n\n` +
            `Votre payout a été envoyé depuis nos services. Il devrait arriver sous peu.\n\n` +
            `Montant: ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} USD\n` +
            `Compte: ${accountId || '—'}\n\n` +
            `Félicitations pour vos résultats !\n\n` +
            `Support: ${supportInbox}`;

          const htmlUser = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Payout</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Confirmation d'envoi</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;font-size:13px;line-height:1.7;">
      <p style="margin:0 0 10px;">Bonne nouvelle ! Votre payout a été <strong>envoyé</strong> depuis nos services.</p>
      <p style="margin:0 0 10px;color:#334155;">Il devrait arriver sous peu (selon votre banque).</p>
      <div style="margin:12px 0;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
        <div><strong>Montant:</strong> ${safe(Number.isFinite(amount) ? amount.toFixed(2) : '0.00')} USD</div>
        <div><strong>Compte:</strong> ${safe(accountId || '—')}</div>
      </div>
      <p style="margin:10px 0 0;">Félicitations pour vos résultats et merci de trader avec AMA FIRM.</p>
      <p style="margin:10px 0 0;color:#334155;">Support: ${safe(supportInbox)}</p>
    </div>
  </div>
</body>
</html>`;

          await db.collection('mail').add({
            to: [toEmail],
            message: {
              from,
              replyTo: supportInbox,
              subject: subjectUser,
              text: textUser,
              html: htmlUser,
              headers: {
                'X-AMA-Email': 'payout_approved_user',
                'X-AMA-UserId': payout.userId,
                'X-AMA-AccountId': accountId,
                'X-AMA-PayoutId': payoutId,
              },
            },
          });
        }
      } catch (e) {
      }

      console.log(`✅ Payout approuvé: ${payoutId}`);

      return {
        success: true,
        message: 'Payout approuvé avec succès'
      };

    } else {
      // REJETER LE PAYOUT
      const reasonText = (typeof rejectionReason === 'string' ? rejectionReason : '').trim() || 'Non spécifié';
      await db.runTransaction(async (transaction) => {
        // Firestore transactions: all reads must happen before any writes.
        // On prépare d'abord les refs à mettre à jour (refund) en faisant toutes les lectures nécessaires.
        let refundAccountRef: FirebaseFirestore.DocumentReference | null = null;

        if (payoutReserved && Number.isFinite(payoutAmount) && payoutAmount > 0) {
          const userRef = db.collection('users').doc(payout.userId);
          const userSnap = await transaction.get(userRef);

          const payoutAccountId = typeof payout.accountId === 'string' ? payout.accountId : '';
          const fallbackAccountId = userSnap.exists && typeof (userSnap.data() as any)?.activeAccountId === 'string'
            ? String((userSnap.data() as any).activeAccountId)
            : '';

          let accountId = (payoutAccountId || fallbackAccountId).trim();

          // Fallback pour anciens payouts sans accountId
          if (!accountId) {
            const accountsSnap = await transaction.get(
              userRef
                .collection('accounts')
                .where('accountStatus', '==', 'active')
                .limit(25)
            );
            let found: string | null = null;
            accountsSnap.forEach((docSnap) => {
              if (found) return;
              const d = docSnap.data() as any;
              const t = typeof d?.accountType === 'string' ? d.accountType.toLowerCase() : '';
              const funded = Boolean(d?.isFunded) || t === 'funded';
              if (funded) found = docSnap.id;
            });
            accountId = (found || '').trim();
          }

          if (!accountId) {
            throw new HttpsError('failed-precondition', 'Aucun compte financé trouvé pour rembourser ce payout');
          }

          refundAccountRef = userRef.collection('accounts').doc(accountId);
        }

        // Ecritures (après toutes les lectures)
        transaction.update(payoutDoc.ref, {
          status: 'rejected',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          rejectedBy: request.auth!.uid,
          rejectionReason: reasonText,
        });

        if (refundAccountRef) {
          transaction.update(refundAccountRef, {
            accountBalance: admin.firestore.FieldValue.increment(payoutAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      // Log d'audit
      await auditLog('payout_rejected', payout.userId, {
        payoutId,
        amount: payout.amount,
        rejectedBy: request.auth.uid,
        reason: rejectionReason
      });

      try {
        const userSnap = await db.collection('users').doc(payout.userId).get();
        const toEmail = (typeof userSnap.data()?.email === 'string' ? userSnap.data()!.email : '').trim().toLowerCase();
        if (toEmail) {
          const from = 'AMA FIRM <ama.firm.fr@gmail.com>';
          const supportInbox = 'ama.firm.fr@gmail.com';
          const safe = (v: string) =>
            v
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');

          const amount = Number(payout.amount || 0);
          const accountId = typeof payout.accountId === 'string' ? payout.accountId : '';
          const reason = (typeof rejectionReason === 'string' ? rejectionReason : '').trim() || 'Non spécifié';
          const refundedText = payoutReserved ? 'Le montant a été recrédité sur votre solde.' : 'Le montant n\'a pas été débité.';

          const subjectUser = 'Votre demande de payout a été rejetée';
          const textUser =
            `Votre demande de payout a été rejetée.\n\n` +
            `Montant: ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} USD\n` +
            `Compte: ${accountId || '—'}\n\n` +
            `Raison: ${reason}\n\n` +
            `${refundedText}\n\n` +
            `Support: ${supportInbox}`;

          const htmlUser = `<!doctype html>
<html>
<body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Helvetica Neue',sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <div style="font-weight:800;color:#0f172a;">AMA FIRM — Payout</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Demande rejetée</div>
    </div>
    <div style="padding:18px 20px;color:#0f172a;font-size:13px;line-height:1.7;">
      <p style="margin:0 0 10px;">Votre demande de payout a été <strong>rejetée</strong>.</p>
      <div style="margin:12px 0;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
        <div><strong>Montant:</strong> ${safe(Number.isFinite(amount) ? amount.toFixed(2) : '0.00')} USD</div>
        <div><strong>Compte:</strong> ${safe(accountId || '—')}</div>
        <div style="margin-top:8px;"><strong>Raison:</strong> ${safe(reason)}</div>
      </div>
      <p style="margin:10px 0 0;color:#334155;">${safe(refundedText)}</p>
      <p style="margin:10px 0 0;color:#334155;">Support: ${safe(supportInbox)}</p>
    </div>
  </div>
</body>
</html>`;

          await db.collection('mail').add({
            to: [toEmail],
            message: {
              from,
              replyTo: supportInbox,
              subject: subjectUser,
              text: textUser,
              html: htmlUser,
              headers: {
                'X-AMA-Email': 'payout_rejected_user',
                'X-AMA-UserId': payout.userId,
                'X-AMA-AccountId': accountId,
                'X-AMA-PayoutId': payoutId,
              },
            },
          });
        }
      } catch (e) {
      }

      console.log(`❌ Payout rejeté: ${payoutId}`);

      return {
        success: true,
        message: 'Payout rejeté'
      };
    }

  } catch (error: any) {
    console.error('❌ Erreur traitement payout:', error);
    throw new HttpsError('internal', `Erreur: ${error.message}`);
  }
});
