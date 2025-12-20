"use strict";
/**
 * Service de Prix en Temps Réel
 * Utilise Finnhub API pour obtenir les prix serveur-side
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.finnhubApiKey = void 0;
exports.fetchRealTimePrice = fetchRealTimePrice;
exports.fetchPriceFromProxy = fetchPriceFromProxy;
exports.getValidatedPrice = getValidatedPrice;
const params_1 = require("firebase-functions/params");
// Secret pour la clé API Finnhub (à configurer dans Firebase)
exports.finnhubApiKey = (0, params_1.defineSecret)('FINNHUB_API_KEY');
/**
 * Récupérer le prix en temps réel d'un symbole via Finnhub API
 * @param symbol - Symbole à chercher (ex: "EUR_USD", "AAPL", "BTC-USD")
 * @returns Prix actuel
 */
async function fetchRealTimePrice(symbol) {
    // Convertir le symbole au format Finnhub
    const finnhubSymbol = convertToFinnhubSymbol(symbol);
    console.log(`🔍 Fetching price for ${symbol} (Finnhub: ${finnhubSymbol})`);
    try {
        // Option 1: Utiliser l'API REST Finnhub directement
        const url = `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${exports.finnhubApiKey.value()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Finnhub API error: ${response.status}`);
        }
        const data = await response.json();
        // Finnhub retourne: { c: current_price, h: high, l: low, o: open, pc: previous_close }
        const currentPrice = data.c;
        if (!currentPrice || currentPrice === 0) {
            throw new Error(`Invalid price from Finnhub: ${currentPrice}`);
        }
        console.log(`✅ Price fetched: ${symbol} = ${currentPrice}`);
        return currentPrice;
    }
    catch (error) {
        console.error(`❌ Error fetching price for ${symbol}:`, error.message);
        throw new Error(`Impossible d'obtenir le prix pour ${symbol}: ${error.message}`);
    }
}
/**
 * Convertir un symbole interne au format Finnhub
 * @param symbol - Symbole interne (ex: "EUR_USD", "US500", "AAPL")
 * @returns Symbole Finnhub (ex: "OANDA:EUR_USD", "SPX", "AAPL")
 */
function convertToFinnhubSymbol(symbol) {
    // FOREX: EUR_USD → OANDA:EUR_USD
    if (symbol.includes('_')) {
        return `OANDA:${symbol}`;
    }
    // INDICES
    const indexMapping = {
        'US500': 'SPX', // S&P 500
        'US30': 'DJI', // Dow Jones
        'US100': 'IXIC', // Nasdaq
        'DE40': 'DAX', // DAX
        'UK100': 'FTSE', // FTSE 100
        'JP225': 'N225', // Nikkei
    };
    if (indexMapping[symbol]) {
        return indexMapping[symbol];
    }
    // ACTIONS & ETF: pas de conversion nécessaire
    return symbol;
}
/**
 * ALTERNATIVE: Utiliser ton proxy existant au lieu de Finnhub direct
 * Avantage: Pas besoin de clé API Finnhub
 */
async function fetchPriceFromProxy(symbol) {
    const proxyUrl = 'https://finnhub-proxy-477220862918.europe-west1.run.app';
    try {
        // Ton proxy expose probablement une route REST
        const response = await fetch(`${proxyUrl}/api/quote/${symbol}`);
        if (!response.ok) {
            throw new Error(`Proxy error: ${response.status}`);
        }
        const data = await response.json();
        const price = data.price || data.c || data.p;
        if (!price || price === 0) {
            throw new Error(`Invalid price from proxy: ${price}`);
        }
        console.log(`✅ Price from proxy: ${symbol} = ${price}`);
        return price;
    }
    catch (error) {
        console.error(`❌ Proxy error for ${symbol}:`, error.message);
        // Fallback: utiliser Finnhub direct
        console.log('⚠️ Fallback to Finnhub API');
        return fetchRealTimePrice(symbol);
    }
}
/**
 * Fonction principale: récupérer le prix (avec fallback)
 */
async function getValidatedPrice(symbol, clientPrice) {
    try {
        // 1. Essayer le proxy (plus rapide, pas de limite de rate)
        const serverPrice = await fetchPriceFromProxy(symbol);
        // 2. Vérifier la cohérence avec le prix du client
        if (clientPrice) {
            const difference = Math.abs(serverPrice - clientPrice);
            const percentDiff = (difference / serverPrice) * 100;
            // Si l'écart est > 2%, warning (possible manipulation)
            if (percentDiff > 2) {
                console.warn(`⚠️ Price mismatch: Client=${clientPrice}, Server=${serverPrice}, Diff=${percentDiff.toFixed(2)}%`);
            }
        }
        return serverPrice;
    }
    catch (error) {
        console.error('❌ All price sources failed:', error.message);
        throw new Error('Impossible de valider le prix. Réessayez.');
    }
}
//# sourceMappingURL=priceService.js.map