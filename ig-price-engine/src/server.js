/**
 * IG Markets Price Engine Server
 * Real-time price streaming via WebSocket (Socket.io)
 * Designed for Google Cloud Run deployment
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');

const igAuthService = require('./services/igAuthService');
const priceService = require('./services/priceService');
const liveCandleService = require('./services/liveCandleService');
const { FinnhubService } = require('./services/finnhubService');
const { getAllEpics, getEpicInfo, EPICS } = require('./config/epics');

// Configuration
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

const historyCache = new Map();
let firestoreClient = null;
const HISTORY_COLLECTION = process.env.HISTORY_CACHE_COLLECTION || 'ig_history_cache';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const getFirestore = () => {
  if (firestoreClient) return firestoreClient;
  firestoreClient = new Firestore();
  return firestoreClient;
};

const isFinnhubEpic = (epic) => {
  try {
    return FinnhubService.isHandledByFinnhub(epic);
  } catch (e) {
    return false;
  }
};

const alignLastCandleToLive = (epic, candles) => {
  try {
    if (!Array.isArray(candles) || candles.length === 0) return candles;
    const p = priceService.getCachedPrice(epic);
    const bid = p ? Number(p.bid) : NaN;
    const offer = p ? Number(p.offer) : NaN;
    const mid = Number.isFinite(bid) && Number.isFinite(offer) ? (bid + offer) / 2 : NaN;
    if (!Number.isFinite(mid)) return candles;

    const last = candles[candles.length - 1];
    if (!last || typeof last !== 'object') return candles;

    last.close = mid;
    if (Number.isFinite(Number(last.high)) && mid > Number(last.high)) last.high = mid;
    if (Number.isFinite(Number(last.low)) && mid < Number(last.low)) last.low = mid;
    return candles;
  } catch (e) {
    return candles;
  }
};

const getHistoryTtlMs = (resolution) => {
  switch (String(resolution)) {
    case 'MINUTE':
      return 60 * 1000;
    case 'MINUTE_5':
      return 3 * 60 * 1000;
    case 'MINUTE_15':
      return 5 * 60 * 1000;
    case 'HOUR':
      return 15 * 60 * 1000;
    case 'HOUR_4':
      return 30 * 60 * 1000;
    case 'DAY':
      return 6 * 60 * 60 * 1000;
    default:
      return 10 * 60 * 1000;
  }
};

const readBestHistoryFromFirestore = async (epic, resolution, max) => {
  const docIds = getFirestoreDocIdsForRequest(epic, resolution, max);
  for (const docId of docIds) {
    const hit = await readHistoryFromFirestore(docId);
    if (hit && hit.candles && hit.candles.length > 0) {
      return { ...hit, docId };
    }
  }
  return null;
};

const getHistoryDocId = (epic, resolution, max) => `${epic}|${resolution}|${max}`;

const parseBool = (v) => String(v || '').toLowerCase() === 'true';

const normalizeMax = (max, fallback) => {
  const n = Number.parseInt(String(max), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 1), 5000);
};

const getFirestoreDocIdsForRequest = (epic, resolution, max) => {
  const requested = normalizeMax(max, 100);
  const candidates = [requested, 500, 1000, 2000].filter((x) => Number.isFinite(x) && x >= requested);
  const unique = Array.from(new Set(candidates));
  return unique.map((m) => getHistoryDocId(epic, resolution, m));
};

const readHistoryFromFirestore = async (docId) => {
  try {
    const db = getFirestore();
    const snap = await db.collection(HISTORY_COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || !Array.isArray(data.candles) || data.candles.length === 0) return null;
    return {
      candles: data.candles,
      allowance: data.allowance || null,
      fetchedAt: typeof data.fetchedAt === 'number' ? data.fetchedAt : (data.fetchedAt && typeof data.fetchedAt.toMillis === 'function' ? data.fetchedAt.toMillis() : null),
      source: typeof data.source === 'string' ? data.source : null,
    };
  } catch (e) {
    console.warn('[History] Firestore read failed:', e.message);
    return null;
  }
};

const writeHistoryToFirestore = async (docId, payload) => {
  try {
    const db = getFirestore();
    await db.collection(HISTORY_COLLECTION).doc(docId).set(payload, { merge: true });
  } catch (e) {
    console.warn('[History] Firestore write failed:', e.message);
  }
};

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// REST API Endpoints
// ============================================

// Health check endpoint (required for Cloud Run)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'IG Price Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Detailed health check
app.get('/health', (req, res) => {
  const authStatus = igAuthService.getStatus();
  const priceStatus = priceService.getStatus();
  
  res.json({
    status: authStatus.isAuthenticated && priceStatus.isRunning ? 'healthy' : 'degraded',
    auth: authStatus,
    prices: priceStatus,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Get IG account info and permissions
app.get('/api/account', async (req, res) => {
  try {
    const client = igAuthService.getClient();
    if (!client) {
      return res.status(503).json({ error: 'Not authenticated' });
    }
    
    // Get account details
    const accountResponse = await client.get('/accounts', { headers: { 'Version': '1' } });
    
    // Get session details (includes streaming permissions)
    const sessionResponse = await client.get('/session', { headers: { 'Version': '1' } });
    
    res.json({
      accounts: accountResponse.data,
      session: sessionResponse.data,
      lightstreamerEndpoint: igAuthService.lightstreamerEndpoint,
      accountId: igAuthService.accountId
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
});

// Get all available EPICS
app.get('/api/epics', (req, res) => {
  res.json({
    indices: EPICS.indices,
    forex: EPICS.forex,
    commodities: EPICS.commodities,
    total: getAllEpics().length
  });
});

// Get current prices (REST fallback)
app.get('/api/prices', (req, res) => {
  const prices = priceService.getAllCachedPrices();
  res.json({
    count: prices.length,
    lastUpdate: priceService.getStatus().lastUpdate,
    prices: prices
  });
});

// Get price for specific epic
app.get('/api/prices/:epic', async (req, res) => {
  const { epic } = req.params;
  
  // Check cache first
  let price = priceService.getCachedPrice(epic);
  
  // If not in cache, fetch it
  if (!price) {
    price = await priceService.fetchPrice(epic);
  }
  
  if (price) {
    res.json(price);
  } else {
    res.status(404).json({ error: 'Epic not found or unavailable' });
  }
});

// Get auth status (for debugging)
app.get('/api/status', (req, res) => {
  const priceStatus = priceService.getStatus();
  const lastUpdateMs = priceStatus.lastUpdate ? new Date(priceStatus.lastUpdate).getTime() : null;
  const now = Date.now();
  res.json({
    auth: igAuthService.getStatus(),
    prices: {
      ...priceStatus,
      lastUpdateAgeMs: lastUpdateMs ? (now - lastUpdateMs) : null,
    },
    liveHistory: liveCandleService.getStatus(),
    connections: io.engine.clientsCount
  });
});

// Simple alias for quick checks
app.get('/status', (req, res) => {
  const priceStatus = priceService.getStatus();
  const lastUpdateMs = priceStatus.lastUpdate ? new Date(priceStatus.lastUpdate).getTime() : null;
  const now = Date.now();
  res.json({
    auth: igAuthService.getStatus(),
    prices: {
      ...priceStatus,
      lastUpdateAgeMs: lastUpdateMs ? (now - lastUpdateMs) : null,
    },
    liveHistory: liveCandleService.getStatus(),
    connections: io.engine.clientsCount
  });
});

app.post('/api/backfill', async (req, res) => {
  const tokenHeader = req.headers.authorization || '';
  const token = String(tokenHeader).toLowerCase().startsWith('bearer ') ? String(tokenHeader).slice(7) : '';
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  const resolution = String(req.body?.resolution || 'HOUR');
  const maxNum = normalizeMax(req.body?.max, 500);
  const epicsRaw = Array.isArray(req.body?.epics) && req.body.epics.length > 0 ? req.body.epics : getAllEpics();
  const epics = epicsRaw;

  let client = igAuthService.getClient();
  if (!client) {
    try {
      await igAuthService.login();
    } catch (e) {
    }
    client = igAuthService.getClient();
  }
  if (!client) {
    return res.status(503).json({ success: false, error: 'Not authenticated', source: 'auth' });
  }

  const results = [];
  for (const epic of epics) {
    const startedAt = Date.now();
    try {
      const response = await client.get(`/prices/${epic}`, {
        params: { resolution, max: maxNum, pageSize: maxNum },
        headers: { 'Version': '3' }
      });

      if (!response.data || !Array.isArray(response.data.prices)) {
        results.push({ epic, ok: false, error: 'no_data' });
        continue;
      }

      const candles = response.data.prices.map(p => ({
        time: new Date(p.snapshotTimeUTC || p.snapshotTime).getTime() / 1000,
        open: (p.openPrice.bid + p.openPrice.ask) / 2,
        high: (p.highPrice.bid + p.highPrice.ask) / 2,
        low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
        close: (p.closePrice.bid + p.closePrice.ask) / 2,
        volume: p.lastTradedVolume || 0
      }));

      const cacheKey = getHistoryDocId(epic, resolution, maxNum);
      historyCache.set(cacheKey, {
        candles,
        allowance: response.data.allowance,
        fetchedAt: Date.now(),
      });
      await writeHistoryToFirestore(cacheKey, {
        epic,
        resolution,
        max: maxNum,
        candles,
        allowance: response.data.allowance || null,
        source: 'ig',
        fetchedAt: Date.now(),
        updatedAt: Date.now(),
      });

      results.push({ epic, ok: true, count: candles.length, allowance: response.data.allowance || null, ms: Date.now() - startedAt });
    } catch (error) {
      const errorCode = error.response?.data?.errorCode || error.message;
      results.push({ epic, ok: false, error: errorCode, details: error.response?.data || null, ms: Date.now() - startedAt });
      if (error.response?.data?.errorCode === 'error.public-api.exceeded-account-historical-data-allowance') break;
    }
  }

  res.json({ success: true, resolution, max: maxNum, count: results.length, results });
});

// Restart polling endpoint (for recovery)
app.post('/api/restart-polling', async (req, res) => {
  console.log('[API] Manual restart-polling requested');
  try {
    priceService.stop();
    await igAuthService.login();
    priceService.start(io);
    res.json({ success: true, message: 'Service restarted', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[API] Restart failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force re-login endpoint
app.post('/api/relogin', async (req, res) => {
  console.log('[API] Manual relogin requested');
  try {
    await igAuthService.login();
    res.json({ success: true, auth: igAuthService.getStatus(), timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[API] Relogin failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate mock historical data based on current price
const generateMockCandles = (epic, resolution, count, currentPrice) => {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  const intervals = { 'MINUTE': 60, 'MINUTE_5': 300, 'MINUTE_15': 900, 'HOUR': 3600, 'HOUR_4': 14400, 'DAY': 86400 };
  const interval = intervals[resolution] || 3600;
  
  // Determine volatility based on price magnitude (indices vs forex)
  const isIndex = currentPrice > 100;
  const volatility = isIndex ? currentPrice * 0.002 : currentPrice * 0.0005; // 0.2% for indices, 0.05% for forex
  
  // Work backwards from current price to generate realistic history
  let price = currentPrice;
  const tempCandles = [];
  
  for (let i = 0; i < count; i++) {
    const time = now - (i * interval);
    const change = (Math.random() - 0.5) * volatility * 2;
    const close = price;
    const open = price - change; // Going backwards
    const high = Math.max(open, close) + Math.random() * volatility * 0.3;
    const low = Math.min(open, close) - Math.random() * volatility * 0.3;
    tempCandles.unshift({ time, open, high, low, close, volume: Math.floor(Math.random() * 1000) });
    price = open; // Move backwards
  }
  
  // Ensure last candle closes at current price
  if (tempCandles.length > 0) {
    const lastCandle = tempCandles[tempCandles.length - 1];
    lastCandle.close = currentPrice;
    if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
    if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;
  }
  
  return tempCandles;
};

// Get historical prices for an epic
// Resolution: MINUTE, MINUTE_5, MINUTE_15, HOUR, HOUR_4, DAY
app.get('/api/history/:epic', async (req, res) => {
  const { epic } = req.params;
  const { resolution = 'HOUR', max = 100, refresh } = req.query;
  const maxNum = normalizeMax(max, 100);
  const shouldRefresh = parseBool(refresh);
  
  try {
    const cacheKey = getHistoryDocId(epic, resolution, maxNum);
    const cached = historyCache.get(cacheKey);
    const ttlMs = getHistoryTtlMs(resolution);
    if (cached && cached.candles && cached.fetchedAt && (Date.now() - cached.fetchedAt) < ttlMs) {
      alignLastCandleToLive(epic, cached.candles);
      return res.json({
        epic,
        resolution,
        count: cached.candles.length,
        allowance: cached.allowance,
        source: 'cache',
        candles: cached.candles,
        cachedAt: new Date(cached.fetchedAt).toISOString(),
      });
    }

    if (!shouldRefresh) {
      const firestoreCached = await readBestHistoryFromFirestore(epic, resolution, maxNum);
      if (firestoreCached && firestoreCached.candles && firestoreCached.fetchedAt) {
        const isFresh = (Date.now() - firestoreCached.fetchedAt) < ttlMs;
        const sliced = firestoreCached.candles.length > maxNum ? firestoreCached.candles.slice(-maxNum) : firestoreCached.candles;
        alignLastCandleToLive(epic, sliced);
        historyCache.set(cacheKey, {
          candles: sliced,
          allowance: firestoreCached.allowance,
          fetchedAt: firestoreCached.fetchedAt,
        });

        if (isFresh) {
          return res.json({
            epic,
            resolution,
            count: sliced.length,
            allowance: firestoreCached.allowance,
            source: 'firestore_cache',
            candles: sliced,
            cachedAt: new Date(firestoreCached.fetchedAt).toISOString(),
          });
        }

        if (['HOUR', 'HOUR_4', 'DAY'].includes(String(resolution))) {
          return res.json({
            epic,
            resolution,
            count: sliced.length,
            allowance: firestoreCached.allowance,
            source: 'firestore_cache_stale',
            candles: sliced,
            cachedAt: new Date(firestoreCached.fetchedAt).toISOString(),
          });
        }
      }
    }

    let client = igAuthService.getClient();
    if (!client) {
      try {
        await igAuthService.login();
      } catch (e) {
        // ignore; handled below
      }
      client = igAuthService.getClient();
    }

    if (!client) {
      try {
        const derived = await liveCandleService.getDerivedHistory(epic, resolution, maxNum);
        if (derived && derived.length > 0) {
          alignLastCandleToLive(epic, derived);
          return res.json({ epic, resolution, count: derived.length, source: 'live_derived', candles: derived });
        }
      } catch (e) {}
      return res.status(503).json({
        error: 'Not authenticated',
        epic,
        resolution,
        source: 'auth'
      });
    }
    
    // IG API v3 uses query params: /prices/{epic}?resolution=X&max=Y
    const response = await client.get(`/prices/${epic}`, {
      params: { resolution, max: maxNum, pageSize: maxNum },
      headers: { 'Version': '3' }
    });
    
    if (response.data && response.data.prices) {
      const candles = response.data.prices.map(p => ({
        time: new Date(p.snapshotTimeUTC || p.snapshotTime).getTime() / 1000,
        open: (p.openPrice.bid + p.openPrice.ask) / 2,
        high: (p.highPrice.bid + p.highPrice.ask) / 2,
        low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
        close: (p.closePrice.bid + p.closePrice.ask) / 2,
        volume: p.lastTradedVolume || 0
      }));
      
      // Adjust last candle to match current live price if available
      const cachedPrice = priceService.getCachedPrice(epic);
      if (cachedPrice && candles.length > 0) {
        const currentPrice = (cachedPrice.bid + cachedPrice.offer) / 2;
        const lastCandle = candles[candles.length - 1];
        // Update close to current price
        lastCandle.close = currentPrice;
        // Adjust high/low if needed
        if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
        if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;
      }

      alignLastCandleToLive(epic, candles);

      historyCache.set(cacheKey, {
        candles,
        allowance: response.data.allowance,
        fetchedAt: Date.now(),
      });

      await writeHistoryToFirestore(cacheKey, {
        epic,
        resolution,
        max: maxNum,
        candles,
        allowance: response.data.allowance || null,
        fetchedAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      res.json({
        epic,
        resolution,
        count: candles.length,
        allowance: response.data.allowance,
        source: 'ig',
        candles
      });
    } else {
      res.status(404).json({ error: 'No data available', raw: response.data });
    }
  } catch (error) {
    console.error(`[History] Error fetching ${epic}:`, error.response?.data || error.message);

    const errorCode = error.response?.data?.errorCode;
    if (errorCode === 'error.public-api.exceeded-account-historical-data-allowance') {
      const cacheKey = getHistoryDocId(epic, resolution, maxNum);
      const cached = historyCache.get(cacheKey);
      if (cached && cached.candles && cached.candles.length > 0) {
        alignLastCandleToLive(epic, cached.candles);
        return res.json({
          epic,
          resolution,
          count: cached.candles.length,
          allowance: cached.allowance,
          source: 'cache_stale',
          candles: cached.candles,
          cachedAt: new Date(cached.fetchedAt).toISOString(),
          error: errorCode,
        });
      }

      const firestoreCached = await readBestHistoryFromFirestore(epic, resolution, maxNum);
      if (firestoreCached && firestoreCached.candles && firestoreCached.candles.length > 0) {
        const sliced = firestoreCached.candles.length > maxNum ? firestoreCached.candles.slice(-maxNum) : firestoreCached.candles;
        alignLastCandleToLive(epic, sliced);
        historyCache.set(cacheKey, {
          candles: sliced,
          allowance: firestoreCached.allowance,
          fetchedAt: firestoreCached.fetchedAt,
        });
        return res.json({
          epic,
          resolution,
          count: sliced.length,
          allowance: firestoreCached.allowance,
          source: 'firestore_cache_stale',
          candles: sliced,
          cachedAt: firestoreCached.fetchedAt ? new Date(firestoreCached.fetchedAt).toISOString() : null,
          error: errorCode,
        });
      }

      try {
        const derived = await liveCandleService.getDerivedHistory(epic, resolution, maxNum);
        if (derived && derived.length > 0) {
          alignLastCandleToLive(epic, derived);
          return res.json({ epic, resolution, count: derived.length, source: 'live_derived', candles: derived, error: errorCode });
        }
      } catch (e) {}

      return res.status(429).json({
        epic,
        resolution,
        source: 'ig_allowance',
        error: errorCode,
        details: error.response?.data,
      });
    }

    res.status(502).json({
      epic,
      resolution,
      source: 'ig_error',
      error: error.response?.data?.errorCode || error.message,
      details: error.response?.data
    });
  }
});

// Get historical prices with date range
app.get('/api/history/:epic/range', async (req, res) => {
  const { epic } = req.params;
  const { resolution = 'HOUR', from, to } = req.query;
  
  try {
    const client = igAuthService.getClient();
    if (!client) {
      return res.status(503).json({ error: 'Not authenticated' });
    }
    
    // IG API v3 uses query params: /prices/{epic}?resolution=X&from=Y&to=Z
    const response = await client.get(`/prices/${epic}`, {
      params: { resolution, from, to },
      headers: { 'Version': '3' }
    });
    
    if (response.data && response.data.prices) {
      const candles = response.data.prices.map(p => ({
        time: new Date(p.snapshotTimeUTC || p.snapshotTime).getTime() / 1000,
        open: (p.openPrice.bid + p.openPrice.ask) / 2,
        high: (p.highPrice.bid + p.highPrice.ask) / 2,
        low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
        close: (p.closePrice.bid + p.closePrice.ask) / 2,
        volume: p.lastTradedVolume || 0
      }));
      
      res.json({
        epic,
        resolution,
        from,
        to,
        count: candles.length,
        allowance: response.data.allowance,
        candles
      });
    } else {
      res.status(404).json({ error: 'No data available' });
    }
  } catch (error) {
    console.error(`[History] Error fetching ${epic}:`, error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.errorCode || error.message });
  }
});

// Force re-authentication (admin endpoint)
app.post('/api/auth/refresh', async (req, res) => {
  try {
    await igAuthService.login();
    res.json({ success: true, message: 'Re-authenticated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WebSocket Events
// ============================================

io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);
  
  // Send current prices on connect
  const currentPrices = priceService.getAllCachedPrices();
  if (currentPrices.length > 0) {
    socket.emit('prices', {
      type: 'initial',
      data: currentPrices,
      timestamp: Date.now()
    });
  }
  
  // Send available epics
  socket.emit('epics', {
    indices: Object.keys(EPICS.indices),
    forex: Object.keys(EPICS.forex),
    commodities: Object.keys(EPICS.commodities)
  });
  
  // Handle subscription to specific epics
  socket.on('subscribe', (epics) => {
    console.log(`[WebSocket] ${socket.id} subscribed to:`, epics);
    socket.join('price-updates');

    // Reduce load: poll only subscribed epics
    if (Array.isArray(epics) && epics.length > 0) {
      priceService.addSubscribedEpics(epics);
    }
    
    // Send current prices for subscribed epics
    if (Array.isArray(epics)) {
      const prices = epics
        .map(epic => priceService.getCachedPrice(epic))
        .filter(p => p !== null);
      
      if (prices.length > 0) {
        socket.emit('prices', {
          type: 'subscription',
          data: prices,
          timestamp: Date.now()
        });
      }
    }
  });
  
  // Handle unsubscription
  socket.on('unsubscribe', (epics) => {
    console.log(`[WebSocket] ${socket.id} unsubscribed from:`, epics);
    if (Array.isArray(epics) && epics.length > 0) {
      priceService.removeSubscribedEpics(epics);
    }
  });
  
  // Handle ping for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[WebSocket] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ============================================
// Server Initialization
// ============================================

async function startServer() {
  console.log('========================================');
  console.log('  IG Markets Price Engine');
  console.log('========================================');
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Port: ${PORT}`);
  console.log('');
  let retryTimer = null;
  const ensurePriceServiceRunning = async () => {
    try {
      const status = igAuthService.getStatus();
      const priceStatus = priceService.getStatus();
      if (status.isAuthenticated && !priceStatus.isRunning) {
        console.log('[Server] Auth ok but price service not running. Starting...');
        priceService.start(io);
      }
    } catch (e) {
      console.error('[Server] ensurePriceServiceRunning error:', e.message);
    }
  };
  const scheduleAuthRetryLoop = () => {
    if (retryTimer) return;
    retryTimer = setInterval(async () => {
      try {
        const status = igAuthService.getStatus();
        if (!status.isAuthenticated) {
          console.log('[Server] Retrying authentication...');
          await igAuthService.login();
          igAuthService.startHeartbeat();
        }
        await ensurePriceServiceRunning();
        if (igAuthService.getStatus().isAuthenticated && priceService.getStatus().isRunning) {
          clearInterval(retryTimer);
          retryTimer = null;
          console.log('[Server] ✅ Auto-recovery loop complete');
        }
      } catch (e) {
        console.error('[Server] Retry loop failed:', e.message);
      }
    }, 30000);
  };
  
  // Step 1: Start HTTP server FIRST (Cloud Run needs port open quickly)
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('========================================');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log('========================================');
  });
  
  // Step 2: Initialize authentication in background (don't block startup)
  console.log('[Server] Initializing IG Markets authentication...');
  try {
    await igAuthService.initialize();
    console.log('[Server] ✅ Authentication successful');
    
    // Step 3: Start price service after auth
    console.log('[Server] Starting price service...');
    try {
      liveCandleService.start();
    } catch (e) {}
    priceService.start(io);
  } catch (error) {
    console.error('[Server] ⚠️ Authentication failed:', error.message);
    console.log('[Server] Server running but prices unavailable. Auto-retry loop started (30s).');
    scheduleAuthRetryLoop();
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  
  priceService.stop();
  await igAuthService.logout();
  
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  
  priceService.stop();
  await igAuthService.logout();
  
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();
