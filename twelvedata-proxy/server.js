/**
 * Twelve Data WebSocket Proxy Server
 * Pour les indices américains, européens, asiatiques et commodities
 * 
 * Déploiement: Google Cloud Run
 */

const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');

// Configuration
const PORT = process.env.PORT || 8080;
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;
const TWELVEDATA_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

// Mapping des symboles broker -> Twelve Data
const SYMBOL_MAPPING = {
  // ==========================================
  // INDICES AMÉRICAINS
  // ==========================================
  'DJI': 'DJI',           // Dow Jones Industrial Average
  'SPX': 'SPX',           // S&P 500
  'NDX': 'NDX',           // Nasdaq 100
  'IXIC': 'IXIC',         // Nasdaq Composite
  
  // ==========================================
  // INDICES EUROPÉENS
  // ==========================================
  'FCHI': 'CAC',          // CAC 40 (France)
  'GDAXI': 'DAX',         // DAX (Allemagne)
  'FTSE': 'FTSE',         // FTSE 100 (UK)
  'STOXX50E': 'STOXX50',  // Euro Stoxx 50
  'IBEX': 'IBEX',         // IBEX 35 (Espagne)
  
  // ==========================================
  // INDICES ASIATIQUES
  // ==========================================
  'N225': 'NI225',        // Nikkei 225 (Japon)
  'HSI': 'HSI',           // Hang Seng (Hong Kong)
  'AXJO': 'AXJO',         // ASX 200 (Australie)
  'KOSPI': 'KOSPI',       // KOSPI (Corée du Sud)
  'SENSEX': 'SENSEX',     // BSE Sensex (Inde)
  
  // ==========================================
  // COMMODITIES
  // ==========================================
  'COPPER': 'XCU/USD',    // Cuivre
  'ALUMINUM': 'ALI',      // Aluminium (futures)
  'ZINC': 'ZINC',         // Zinc
  'WTICOUSD': 'CL',       // Pétrole WTI (Crude Oil)
  'COFFEE': 'KC',         // Café
  
  // ==========================================
  // FOREX (complémentaires)
  // ==========================================
  'USD_CAD': 'USD/CAD',
  'NZD_USD': 'NZD/USD',
  'EUR_GBP': 'EUR/GBP',
  'EUR_JPY': 'EUR/JPY',
  'GBP_JPY': 'GBP/JPY',
  'AUD_CAD': 'AUD/CAD',
  'AUD_NZD': 'AUD/NZD',
  'NZD_JPY': 'NZD/JPY',
  'CHF_JPY': 'CHF/JPY',
  'EUR_CHF': 'EUR/CHF',
  'AUD_JPY': 'AUD/JPY',
  'GBP_CHF': 'GBP/CHF',
  'EUR_AUD': 'EUR/AUD',
  'GBP_AUD': 'GBP/AUD',
  'EUR_CAD': 'EUR/CAD'
};

// Reverse mapping pour retrouver le symbole broker depuis Twelve Data
const REVERSE_MAPPING = {};
Object.entries(SYMBOL_MAPPING).forEach(([broker, td]) => {
  REVERSE_MAPPING[td] = broker;
});

// Express app pour health checks et API REST
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint (requis par Cloud Run)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'twelvedata-proxy',
    symbols: Object.keys(SYMBOL_MAPPING).length,
    uptime: process.uptime()
  });
});

// Endpoint pour récupérer la liste des symboles supportés
app.get('/symbols', (req, res) => {
  res.json({
    symbols: SYMBOL_MAPPING,
    count: Object.keys(SYMBOL_MAPPING).length
  });
});

// Créer le serveur HTTP
const server = http.createServer(app);

// WebSocket server pour les clients (broker)
const wss = new WebSocket.Server({ server });

// État global
let twelveDataWs = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000;

// Cache des derniers prix
const priceCache = new Map();

// Set des symboles actuellement souscrits
const subscribedSymbols = new Set();

// Clients connectés
const clients = new Set();

/**
 * Connexion au WebSocket Twelve Data
 */
function connectToTwelveData() {
  if (!TWELVEDATA_API_KEY) {
    console.error('❌ TWELVEDATA_API_KEY non définie!');
    return;
  }

  console.log('🔌 Connexion à Twelve Data WebSocket...');

  twelveDataWs = new WebSocket(`${TWELVEDATA_WS_URL}?apikey=${TWELVEDATA_API_KEY}`);

  twelveDataWs.on('open', () => {
    console.log('✅ Connecté à Twelve Data WebSocket');
    isConnected = true;
    reconnectAttempts = 0;

    // Souscrire à tous les symboles
    subscribeToAllSymbols();

    // Heartbeat toutes les 10 secondes
    setInterval(() => {
      if (twelveDataWs && twelveDataWs.readyState === WebSocket.OPEN) {
        twelveDataWs.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, 10000);
  });

  twelveDataWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleTwelveDataMessage(message);
    } catch (err) {
      console.error('❌ Erreur parsing message:', err.message);
    }
  });

  twelveDataWs.on('close', (code, reason) => {
    console.log(`⚠️ Twelve Data WebSocket fermé: ${code} - ${reason}`);
    isConnected = false;
    scheduleReconnect();
  });

  twelveDataWs.on('error', (err) => {
    console.error('❌ Erreur Twelve Data WebSocket:', err.message);
    isConnected = false;
  });
}

/**
 * Souscrire à tous les symboles configurés
 */
function subscribeToAllSymbols() {
  if (!twelveDataWs || twelveDataWs.readyState !== WebSocket.OPEN) {
    console.error('❌ WebSocket non connecté');
    return;
  }

  const twelveDataSymbols = Object.values(SYMBOL_MAPPING);
  
  console.log(`📊 Souscription à ${twelveDataSymbols.length} symboles...`);

  // Twelve Data accepte jusqu'à 8 symboles en plan gratuit
  // Pour plus, il faut un plan payant
  const subscribeMessage = {
    action: 'subscribe',
    params: {
      symbols: twelveDataSymbols.join(',')
    }
  };

  twelveDataWs.send(JSON.stringify(subscribeMessage));
  console.log('📤 Message de souscription envoyé:', twelveDataSymbols.join(', '));
}

/**
 * Gérer les messages de Twelve Data
 */
function handleTwelveDataMessage(message) {
  // Message de statut de souscription
  if (message.event === 'subscribe-status') {
    console.log('📋 Statut souscription:', message.status);
    if (message.success && message.success.length > 0) {
      console.log(`✅ Souscrits: ${message.success.map(s => s.symbol).join(', ')}`);
      message.success.forEach(s => subscribedSymbols.add(s.symbol));
    }
    if (message.fails && message.fails.length > 0) {
      console.log(`❌ Échecs: ${message.fails.map(s => s.symbol).join(', ')}`);
    }
    return;
  }

  // Message de prix
  if (message.event === 'price') {
    const twelveDataSymbol = message.symbol;
    const brokerSymbol = REVERSE_MAPPING[twelveDataSymbol] || twelveDataSymbol;
    const price = message.price;
    const timestamp = message.timestamp;

    // Mettre en cache
    priceCache.set(brokerSymbol, {
      price,
      timestamp,
      bid: message.bid,
      ask: message.ask
    });

    // Diffuser à tous les clients connectés
    const tradeMessage = {
      type: 'trade',
      data: [{
        s: brokerSymbol,
        p: price,
        t: timestamp * 1000, // Convertir en millisecondes
        v: message.day_volume || 0
      }]
    };

    broadcastToClients(tradeMessage);
  }

  // Heartbeat response
  if (message.event === 'heartbeat') {
    console.log('💓 Heartbeat reçu');
  }
}

/**
 * Diffuser un message à tous les clients
 */
function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

/**
 * Planifier une reconnexion
 */
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('❌ Nombre maximum de tentatives de reconnexion atteint');
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY * reconnectAttempts;
  console.log(`🔄 Reconnexion dans ${delay / 1000}s (tentative ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  setTimeout(() => {
    connectToTwelveData();
  }, delay);
}

/**
 * Gérer les connexions des clients (broker)
 */
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`🔗 Nouveau client connecté: ${clientIp}`);
  
  clients.add(ws);

  // Envoyer les derniers prix en cache
  priceCache.forEach((data, symbol) => {
    ws.send(JSON.stringify({
      type: 'trade',
      data: [{
        s: symbol,
        p: data.price,
        t: data.timestamp * 1000,
        v: 0
      }]
    }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(ws, message);
    } catch (err) {
      console.error('❌ Erreur parsing message client:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`👋 Client déconnecté: ${clientIp}`);
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`❌ Erreur client ${clientIp}:`, err.message);
    clients.delete(ws);
  });
});

/**
 * Gérer les messages des clients
 */
function handleClientMessage(ws, message) {
  // Ping/Pong
  if (message.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  // Souscription (pour compatibilité avec le broker existant)
  if (message.type === 'subscribe') {
    const symbol = message.symbol;
    console.log(`📥 Client demande: ${symbol}`);
    
    // Envoyer le dernier prix en cache si disponible
    if (priceCache.has(symbol)) {
      const data = priceCache.get(symbol);
      ws.send(JSON.stringify({
        type: 'trade',
        data: [{
          s: symbol,
          p: data.price,
          t: data.timestamp * 1000,
          v: 0
        }]
      }));
    }
    return;
  }

  console.log('📨 Message client reçu:', message);
}

// Démarrer le serveur
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       TWELVE DATA PROXY SERVER - INDICES & COMMODITIES     ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                ║
║  Symboles: ${Object.keys(SYMBOL_MAPPING).length} configurés                                  ║
║  WebSocket: ws://localhost:${PORT}                            ║
║  Health: http://localhost:${PORT}/                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Connexion à Twelve Data
  connectToTwelveData();
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM reçu, fermeture...');
  if (twelveDataWs) {
    twelveDataWs.close();
  }
  server.close(() => {
    console.log('✅ Serveur fermé proprement');
    process.exit(0);
  });
});
