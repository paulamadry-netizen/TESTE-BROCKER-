/**
 * Finnhub Service
 * Provides real-time prices for assets not available on IG Markets
 * Uses WebSocket for streaming prices
 */

const WebSocket = require('ws');
const axios = require('axios');
const { EPICS } = require('../config/epics');

// Mapping from IG epic to Finnhub symbol
// Finnhub forex symbols use format: OANDA:SYMBOL_CURRENCY
// For commodities/indices, we use forex broker symbols
const FINNHUB_SYMBOLS = {
  // Metals - using forex broker format
  'CS.D.GD.CFD.IP': 'OANDA:XAU_USD',      // Gold
  'CS.D.SI.CFD.IP': 'OANDA:XAG_USD',      // Silver
  'TM.D.COPPER.CFD.IP': 'OANDA:XCU_USD',
  
  // Indices - using common ETF/futures symbols
  
};

// Assets that need mock prices (Finnhub rate limits or unsupported)
const UNSUPPORTED_ASSETS = {};

// Reverse mapping for quick lookup
const SYMBOL_TO_EPIC = {};
Object.entries(FINNHUB_SYMBOLS).forEach(([epic, symbol]) => {
  SYMBOL_TO_EPIC[symbol] = epic;
});

const parseForexEpic = (epic) => {
  const m = String(epic || '').match(/^CS\.D\.([A-Z]{6})\.CFD\.IP$/);
  if (!m) return null;
  const pair = m[1];
  return { base: pair.slice(0, 3), quote: pair.slice(3, 6) };
};

const getDefaultSymbols = () => {
  const symbols = new Set();

  Object.keys((EPICS && EPICS.forex) || {}).forEach((epic) => {
    const parsed = parseForexEpic(epic);
    if (!parsed) return;
    symbols.add(`OANDA:${parsed.base}_${parsed.quote}`);
  });

  ['CS.D.GD.CFD.IP', 'CS.D.SI.CFD.IP', 'TM.D.COPPER.CFD.IP'].forEach((epic) => {
    const symbol = FINNHUB_SYMBOLS[epic];
    if (symbol) symbols.add(symbol);
  });

  return Array.from(symbols);
};

const getFinnhubSymbolForEpic = (epic) => {
  const fixed = FINNHUB_SYMBOLS[epic];
  if (fixed) return fixed;
  const parsed = parseForexEpic(epic);
  if (parsed) return `OANDA:${parsed.base}_${parsed.quote}`;
  return null;
};

const getEpicForFinnhubSymbol = (symbol) => {
  const fixed = SYMBOL_TO_EPIC[symbol];
  if (fixed) return fixed;

  const m = String(symbol || '').match(/^OANDA:([A-Z]{3})_([A-Z]{3})$/);
  if (m) {
    return `CS.D.${m[1]}${m[2]}.CFD.IP`;
  }
  return null;
};

const finnhubResolutionFor = (resolution) => {
  switch (String(resolution)) {
    case 'MINUTE':
      return '1';
    case 'MINUTE_5':
      return '5';
    case 'MINUTE_15':
      return '15';
    case 'HOUR':
      return '60';
    case 'DAY':
      return 'D';
    case 'HOUR_4':
      return '60';
    default:
      return null;
  }
};

const resolutionSecondsFor = (resolution) => {
  switch (String(resolution)) {
    case 'MINUTE':
      return 60;
    case 'MINUTE_5':
      return 5 * 60;
    case 'MINUTE_15':
      return 15 * 60;
    case 'HOUR':
      return 60 * 60;
    case 'HOUR_4':
      return 4 * 60 * 60;
    case 'DAY':
      return 24 * 60 * 60;
    default:
      return 60;
  }
};

const aggregateCandles = (candles, bucketSeconds) => {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const out = [];

  const sorted = candles.slice().sort((a, b) => a.time - b.time);
  let cur = null;

  for (const c of sorted) {
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;
    const bucket = Math.floor(t / bucketSeconds) * bucketSeconds;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 };
      continue;
    }
    cur.high = Math.max(cur.high, c.high);
    cur.low = Math.min(cur.low, c.low);
    cur.close = c.close;
    cur.volume = (cur.volume || 0) + (c.volume || 0);
  }
  if (cur) out.push(cur);
  return out;
};

class FinnhubService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
    this.isConnected = false;
    this.priceCallback = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.subscribedSymbols = new Set();
    this.priceCache = new Map();
  }

  /**
   * Connect to Finnhub WebSocket
   */
  connect(callback) {
    if (this.isConnected) {
      console.log('[Finnhub] Already connected');
      return;
    }

    this.priceCallback = callback;
    
    console.log('[Finnhub] Connecting to WebSocket...');
    
    this.ws = new WebSocket(`wss://ws.finnhub.io?token=${this.apiKey}`);

    this.ws.on('open', () => {
      console.log('[Finnhub] ✅ WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Subscribe to all configured symbols
      this._subscribeToAll();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'trade') {
          this._handleTradeData(message.data);
        } else if (message.type === 'ping') {
          // Heartbeat - ignore
        } else if (message.type === 'error') {
          console.error('[Finnhub] Error:', message.msg);
        }
      } catch (error) {
        console.error('[Finnhub] Error parsing message:', error.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[Finnhub] WebSocket closed');
      this.isConnected = false;
      this._attemptReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('[Finnhub] WebSocket error:', error.message);
    });
  }

  /**
   * Subscribe to all configured symbols
   */
  _subscribeToAll() {
    getDefaultSymbols().forEach(symbol => {
      this.subscribe(symbol);
    });
  }

  /**
   * Subscribe to a symbol
   */
  subscribe(symbol) {
    if (!this.isConnected || !this.ws) {
      console.warn('[Finnhub] Cannot subscribe - not connected');
      return;
    }

    if (this.subscribedSymbols.has(symbol)) {
      return;
    }

    console.log(`[Finnhub] Subscribing to ${symbol}`);
    this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    this.subscribedSymbols.add(symbol);
  }

  /**
   * Unsubscribe from a symbol
   */
  unsubscribe(symbol) {
    if (!this.isConnected || !this.ws) return;

    console.log(`[Finnhub] Unsubscribing from ${symbol}`);
    this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    this.subscribedSymbols.delete(symbol);
  }

  unsubscribeEpic(epic) {
    const symbol = this.getFinnhubSymbol(epic);
    if (!symbol) return;
    this.unsubscribe(symbol);
  }

  /**
   * Handle incoming trade data
   */
  _handleTradeData(trades) {
    if (!Array.isArray(trades)) return;

    trades.forEach(trade => {
      const symbol = trade.s;
      const price = trade.p;
      const timestamp = trade.t;

      const epic = getEpicForFinnhubSymbol(symbol);
      if (!epic) return;

      // Update cache
      const priceData = {
        epic,
        symbol,
        bid: price * 0.9999,  // Simulate spread
        offer: price * 1.0001,
        mid: price,
        high: price,
        low: price,
        change: 0,
        changePct: 0,
        updateTime: new Date(timestamp).toISOString(),
        source: 'finnhub'
      };

      this.priceCache.set(epic, priceData);

      // Broadcast to callback
      if (this.priceCallback) {
        this.priceCallback(priceData);
      }
    });
  }

  /**
   * Attempt to reconnect
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Finnhub] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[Finnhub] Reconnecting in ${this.reconnectDelay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.subscribedSymbols.clear();
      this.connect(this.priceCallback);
    }, this.reconnectDelay);
  }

  /**
   * Get cached price for an epic
   */
  getCachedPrice(epic) {
    return this.priceCache.get(epic);
  }

  /**
   * Get all cached prices
   */
  getAllCachedPrices() {
    return Array.from(this.priceCache.values());
  }

  /**
   * Check if epic is handled by Finnhub
   */
  static isHandledByFinnhub(epic) {
    const symbol = getFinnhubSymbolForEpic(epic);
    return Boolean(symbol);
  }

  /**
   * Get list of epics handled by Finnhub
   */
  static getHandledEpics() {
    return Array.from(new Set([
      ...Object.keys((EPICS && EPICS.forex) || {}),
      'CS.D.GD.CFD.IP',
      'CS.D.SI.CFD.IP',
      'TM.D.COPPER.CFD.IP',
    ]));
  }

  getFinnhubSymbol(epic) {
    return getFinnhubSymbolForEpic(epic);
  }

  ensureSubscribedForEpic(epic) {
    const symbol = this.getFinnhubSymbol(epic);
    if (!symbol) return;
    this.subscribe(symbol);
  }

  async fetchHistory(epic, resolution, max) {
    const symbol = this.getFinnhubSymbol(epic);
    if (!symbol) return null;

    const res = finnhubResolutionFor(resolution);
    if (!res) return null;

    const maxNum = Number.parseInt(String(max), 10) || 100;
    const now = Math.floor(Date.now() / 1000);

    const wantSeconds = resolutionSecondsFor(resolution);
    const baseSeconds = resolutionSecondsFor(resolution === 'HOUR_4' ? 'HOUR' : resolution);
    const baseCount = resolution === 'HOUR_4' ? maxNum * 4 : maxNum;
    const from = now - Math.max(baseCount * baseSeconds * 2, baseSeconds * 10);

    const url = `https://finnhub.io/api/v1/forex/candle`;
    const response = await axios.get(url, {
      params: {
        symbol,
        resolution: res,
        from,
        to: now,
        token: this.apiKey,
      },
      timeout: 20000,
    });

    const data = response.data;
    if (!data || data.s !== 'ok' || !Array.isArray(data.t)) {
      return null;
    }

    const candles = data.t.map((t, i) => ({
      time: data.t[i],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: (data.v && data.v[i]) || 0,
    }));

    const normalized = candles.slice(-baseCount);
    if (resolution === 'HOUR_4') {
      const aggregated = aggregateCandles(normalized, wantSeconds);
      return aggregated.slice(-maxNum);
    }
    return normalized.slice(-maxNum);
  }

  /**
   * Start mock price updates for unsupported assets
   */
  _startMockPrices() {
    console.log('[Finnhub] Starting mock prices for unsupported assets...');
    
    // Update mock prices every 5 seconds
    this.mockPriceInterval = setInterval(() => {
      Object.entries(UNSUPPORTED_ASSETS).forEach(([epic, config]) => {
        // Generate small random price movement
        const variation = (Math.random() - 0.5) * 0.01 * config.basePrice;
        const price = config.basePrice + variation;
        
        const priceData = {
          epic,
          symbol: config.name,
          bid: price * 0.9999,
          offer: price * 1.0001,
          mid: price,
          high: price * 1.001,
          low: price * 0.999,
          change: variation,
          changePct: (variation / config.basePrice) * 100,
          updateTime: new Date().toISOString(),
          source: 'mock'
        };
        
        this.priceCache.set(epic, priceData);
        
        if (this.priceCallback) {
          this.priceCallback(priceData);
        }
      });
    }, 5000);
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.mockPriceInterval) {
      clearInterval(this.mockPriceInterval);
      this.mockPriceInterval = null;
    }
    this.isConnected = false;
    this.subscribedSymbols.clear();
    console.log('[Finnhub] Disconnected');
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      cachedPricesCount: this.priceCache.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

module.exports = { FinnhubService, FINNHUB_SYMBOLS, SYMBOL_TO_EPIC };
