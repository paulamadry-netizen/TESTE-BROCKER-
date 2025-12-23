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

const igAuthService = require('./services/igAuthService');
const priceService = require('./services/priceService');
const { getAllEpics, getEpicInfo, EPICS } = require('./config/epics');

// Configuration
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

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
  res.json({
    auth: igAuthService.getStatus(),
    prices: priceService.getStatus(),
    connections: io.engine.clientsCount
  });
});

// Get historical prices for an epic
// Resolution: SECOND, MINUTE, MINUTE_2, MINUTE_3, MINUTE_5, MINUTE_10, MINUTE_15, MINUTE_30, HOUR, HOUR_2, HOUR_3, HOUR_4, DAY, WEEK, MONTH
app.get('/api/history/:epic', async (req, res) => {
  const { epic } = req.params;
  const { resolution = 'HOUR', max = 500 } = req.query;
  
  try {
    const client = igAuthService.getClient();
    if (!client) {
      return res.status(503).json({ error: 'Not authenticated' });
    }
    
    // Fetch historical prices using numPoints
    const response = await client.get(`/prices/${epic}/${resolution}/${max}`, {
      headers: { 'Version': '3' }
    });
    
    if (response.data && response.data.prices) {
      const candles = response.data.prices.map(p => ({
        time: new Date(p.snapshotTime || p.snapshotTimeUTC).getTime() / 1000,
        open: (p.openPrice.bid + p.openPrice.ask) / 2,
        high: (p.highPrice.bid + p.highPrice.ask) / 2,
        low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
        close: (p.closePrice.bid + p.closePrice.ask) / 2,
        volume: p.lastTradedVolume || 0
      }));
      
      res.json({
        epic,
        resolution,
        count: candles.length,
        allowance: response.data.allowance,
        candles
      });
    } else {
      res.status(404).json({ error: 'No data available' });
    }
  } catch (error) {
    console.error(`[History] Error fetching ${epic}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get historical prices with date range
app.get('/api/history/:epic/:resolution/:from/:to', async (req, res) => {
  const { epic, resolution, from, to } = req.params;
  
  try {
    const client = igAuthService.getClient();
    if (!client) {
      return res.status(503).json({ error: 'Not authenticated' });
    }
    
    // Format dates for IG API (YYYY-MM-DDTHH:MM:SS)
    const response = await client.get(`/prices/${epic}/${resolution}/${from}/${to}`, {
      headers: { 'Version': '3' }
    });
    
    if (response.data && response.data.prices) {
      const candles = response.data.prices.map(p => ({
        time: new Date(p.snapshotTime || p.snapshotTimeUTC).getTime() / 1000,
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
    console.error(`[History] Error fetching ${epic}:`, error.message);
    res.status(500).json({ error: error.message });
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
    priceService.start(io);
  } catch (error) {
    console.error('[Server] ⚠️ Authentication failed:', error.message);
    console.log('[Server] Server running but prices unavailable. Retrying auth in 30s...');
    
    // Retry authentication after delay
    setTimeout(async () => {
      try {
        await igAuthService.initialize();
        priceService.start(io);
        console.log('[Server] ✅ Retry successful, price service started');
      } catch (retryError) {
        console.error('[Server] ❌ Retry failed:', retryError.message);
      }
    }, 30000);
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
