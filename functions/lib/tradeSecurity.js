"use strict";
/**
 * Cloud Functions de Sécurité pour les Trades
 * CRITIQUE: Toutes les validations et exécutions de trades DOIVENT passer par ici
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDrawdowns = exports.updateTradingDays = exports.closeTrade = exports.executeTrade = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const priceService_1 = require("./priceService");
const db = admin.firestore();
// ==========================================
// HELPER: LOGS D'AUDIT
// ==========================================
async function auditLog(action, userId, details, ipAddress) {
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
function validateTradingHours() {
    const now = new Date();
    const hours = now.getUTCHours();
    const day = now.getUTCDay();
    // Interdit entre 22h-00h UTC
    if (hours >= 22 || hours < 0) {
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
async function validateTotalDrawdown(userId, userData) {
    // Charger tous les trades fermés pour calculer le peak
    const tradesSnapshot = await db.collection('trades')
        .where('userId', '==', userId)
        .where('status', '==', 'closed')
        .orderBy('closedAt', 'asc')
        .get();
    const initialBalance = userData.initialBalance || userData.accountBalance;
    let balance = initialBalance;
    let peakBalance = initialBalance;
    // Calculer le peak balance (pic historique)
    tradesSnapshot.forEach((doc) => {
        const trade = doc.data();
        balance += trade.pnl || 0;
        if (balance > peakBalance) {
            peakBalance = balance;
        }
    });
    // Drawdown = peak - current balance
    const currentBalance = userData.accountBalance;
    const drawdown = peakBalance - currentBalance;
    const drawdownPercent = (drawdown / peakBalance) * 100;
    console.log(`📊 Drawdown total: ${drawdownPercent.toFixed(2)}% (max: 8%)`);
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
            currentBalance
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
async function validateDailyDrawdown(userId, userData) {
    // Début de la journée UTC
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    // Charger les trades d'aujourd'hui
    const todayTradesSnapshot = await db.collection('trades')
        .where('userId', '==', userId)
        .where('closedAt', '>=', todayStart.toISOString())
        .where('status', '==', 'closed')
        .get();
    let todayPnl = 0;
    todayTradesSnapshot.forEach((doc) => {
        todayPnl += doc.data().pnl || 0;
    });
    const dailyLoss = todayPnl < 0 ? Math.abs(todayPnl) : 0;
    const initialBalance = userData.initialBalance || userData.accountBalance;
    const dailyLossPercent = (dailyLoss / initialBalance) * 100;
    console.log(`📊 Perte journalière: ${dailyLossPercent.toFixed(2)}% (max: 3%)`);
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
function calculateMargin(symbol, lots, price) {
    // Leverage 1:100
    const leverage = 100;
    const contractSize = symbol.includes('JPY') ? 100000 : 100000;
    const margin = (contractSize * lots * price) / leverage;
    return margin;
}
function validateMargin(userData, symbol, lots, price) {
    const requiredMargin = calculateMargin(symbol, lots, price);
    const availableBalance = userData.availableBalance || userData.accountBalance;
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
exports.executeTrade = (0, https_1.onCall)({ secrets: [priceService_1.finnhubApiKey] }, async (request) => {
    const { userId, symbol, symbolApi, side, lots, tp, sl } = request.data;
    console.log(`🔍 Tentative de trade: ${side} ${symbol} ${lots} lots`);
    // 1. Vérifier l'authentification
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Non authentifié');
    }
    if (request.auth.uid !== userId) {
        throw new https_1.HttpsError('permission-denied', 'Accès interdit');
    }
    // 2. Charger les données utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Utilisateur introuvable');
    }
    const userData = userDoc.data();
    // 3. Vérifier que le compte est actif
    if (userData.accountStatus !== 'active') {
        throw new https_1.HttpsError('failed-precondition', `Compte ${userData.accountStatus}. Trading désactivé.`);
    }
    // 4. VALIDATION DES HEURES
    const hoursCheck = validateTradingHours();
    if (!hoursCheck.allowed) {
        await auditLog('trade_rejected', userId, {
            reason: 'trading_hours',
            detail: hoursCheck.reason
        }, request.rawRequest.ip);
        throw new https_1.HttpsError('failed-precondition', hoursCheck.reason);
    }
    // 5. VALIDATION DRAWDOWN TOTAL
    const totalDrawdownCheck = await validateTotalDrawdown(userId, userData);
    if (!totalDrawdownCheck.allowed) {
        throw new https_1.HttpsError('failed-precondition', totalDrawdownCheck.reason);
    }
    // 6. VALIDATION DRAWDOWN JOURNALIER
    const dailyDrawdownCheck = await validateDailyDrawdown(userId, userData);
    if (!dailyDrawdownCheck.allowed) {
        throw new https_1.HttpsError('failed-precondition', dailyDrawdownCheck.reason);
    }
    // 7. OBTENIR ET VALIDER LE PRIX EN TEMPS RÉEL
    // Le prix est récupéré côté serveur via Finnhub (impossible à manipuler par le client)
    const clientPrice = request.data.price; // Prix envoyé par le client (pour comparaison)
    const price = await (0, priceService_1.getValidatedPrice)(symbolApi, clientPrice);
    console.log(`✅ Prix validé serveur: ${symbolApi} = ${price}`);
    // 8. VALIDATION DE LA MARGE
    const marginCheck = validateMargin(userData, symbolApi, lots, price);
    if (!marginCheck.allowed) {
        await auditLog('trade_rejected', userId, {
            reason: 'insufficient_margin',
            detail: marginCheck.reason
        }, request.rawRequest.ip);
        throw new https_1.HttpsError('failed-precondition', marginCheck.reason);
    }
    // 9. CRÉER LE TRADE (transaction atomique)
    const tradeRef = db.collection('trades').doc();
    const marginUsed = calculateMargin(symbolApi, lots, price);
    try {
        await db.runTransaction(async (transaction) => {
            // Créer le trade
            transaction.set(tradeRef, {
                userId,
                symbol,
                symbolApi,
                side,
                lots,
                entryPrice: price,
                currentPrice: price,
                tp: tp || null,
                sl: sl || null,
                status: 'open',
                pnl: 0,
                openedAt: admin.firestore.FieldValue.serverTimestamp(),
                validatedByServer: true,
                validationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Mettre à jour la balance disponible
            transaction.update(userDoc.ref, {
                availableBalance: admin.firestore.FieldValue.increment(-marginUsed),
                lastTradeAt: admin.firestore.FieldValue.serverTimestamp()
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
        }, request.rawRequest.ip);
        console.log(`✅ Trade créé: ${tradeRef.id}`);
        return {
            success: true,
            tradeId: tradeRef.id,
            entryPrice: price,
            marginUsed
        };
    }
    catch (error) {
        console.error('❌ Erreur création trade:', error);
        throw new https_1.HttpsError('internal', `Erreur: ${error.message}`);
    }
});
// ==========================================
// FONCTION: FERMER UN TRADE
// ==========================================
exports.closeTrade = (0, https_1.onCall)({ secrets: [priceService_1.finnhubApiKey] }, async (request) => {
    const { tradeId, closePrice: clientClosePrice } = request.data;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Non authentifié');
    }
    const userId = request.auth.uid;
    // Charger le trade
    const tradeDoc = await db.collection('trades').doc(tradeId).get();
    if (!tradeDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Trade introuvable');
    }
    const trade = tradeDoc.data();
    // Vérifier la propriété
    if (trade.userId !== userId) {
        throw new https_1.HttpsError('permission-denied', 'Ce trade ne vous appartient pas');
    }
    // VALIDER LE PRIX DE FERMETURE côté serveur (sécurité critique)
    const symbol = trade.symbolApi;
    const closePrice = await (0, priceService_1.getValidatedPrice)(symbol, clientClosePrice);
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
    const marginReleased = calculateMargin(symbol, lots, entryPrice);
    console.log(`💰 P&L calculé: ${pnl.toFixed(2)} USD`);
    // Transaction atomique
    try {
        await db.runTransaction(async (transaction) => {
            // Mettre à jour le trade
            transaction.update(tradeDoc.ref, {
                status: 'closed',
                closePrice,
                pnl,
                closedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Mettre à jour la balance
            const userRef = db.collection('users').doc(userId);
            transaction.update(userRef, {
                accountBalance: admin.firestore.FieldValue.increment(pnl),
                availableBalance: admin.firestore.FieldValue.increment(pnl + marginReleased)
            });
        });
        // Log d'audit
        await auditLog('trade_closed', userId, {
            tradeId,
            closePrice,
            pnl,
            marginReleased
        }, request.rawRequest.ip);
        // Vérifier les règles après la fermeture
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        await validateTotalDrawdown(userId, userData);
        await validateDailyDrawdown(userId, userData);
        console.log(`✅ Trade fermé: ${tradeId}`);
        return {
            success: true,
            pnl,
            newBalance: userData.accountBalance + pnl
        };
    }
    catch (error) {
        console.error('❌ Erreur fermeture trade:', error);
        throw new https_1.HttpsError('internal', `Erreur: ${error.message}`);
    }
});
// ==========================================
// FONCTION SCHEDULED: METTRE À JOUR LES JOURS DE TRADING
// ==========================================
exports.updateTradingDays = (0, scheduler_1.onSchedule)('0 0 * * *', async (event) => {
    console.log('🗓️ Mise à jour des jours de trading...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setUTCHours(23, 59, 59, 999);
    // Trouver tous les users qui ont tradé hier
    const tradesSnapshot = await db.collection('trades')
        .where('openedAt', '>=', yesterday.toISOString())
        .where('openedAt', '<=', yesterdayEnd.toISOString())
        .get();
    const usersWhoTraded = new Set();
    tradesSnapshot.forEach((doc) => {
        usersWhoTraded.add(doc.data().userId);
    });
    // Incrémenter tradingDays pour chaque user
    const batch = db.batch();
    for (const userId of usersWhoTraded) {
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, {
            tradingDays: admin.firestore.FieldValue.increment(1)
        });
    }
    await batch.commit();
    console.log(`✅ Mis à jour ${usersWhoTraded.size} utilisateurs`);
});
// ==========================================
// FONCTION: CALCULER LES DRAWDOWNS
// ==========================================
exports.calculateDrawdowns = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Non authentifié');
    }
    const userId = request.auth.uid;
    // Charger le user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Utilisateur introuvable');
    }
    const userData = userDoc.data();
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
//# sourceMappingURL=tradeSecurity.js.map