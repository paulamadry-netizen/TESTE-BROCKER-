/**
 * Finnhub Service
 * Provides real-time prices for assets not available on IG Markets
 * Uses WebSocket for streaming prices
 */

const WebSocket = require('ws');

// Mapping from IG epic to Finnhub symbol
// Finnhub forex symbols use format: OANDA:SYMBOL_CURRENCY
// For commodities/indices, we use forex broker symbols
const FINNHUB_SYMBOLS = {
  // Metals - using forex broker format
  'CS.D.GD.CFD.IP': 'OANDA:XAU_USD',      // Gold
  'CS.D.SI.CFD.IP': 'OANDA:XAG_USD',      // Silver
  'TM.D.COPPER.CFD.IP': 'OANDA:HG_USD',   // Copper (HG is copper futures symbol)
  
  // Indices - using common ETF/futures symbols
  'IX.D.FTSE.IFD.IP': 'OANDA:UK100_GBP',   // UK 100
  'IX.D.STX.IFD.IP': 'OANDA:EU50_EUR',     // Euro Stoxx 50
  'IX.D.HSI.IFD.IP': 'OANDA:HK33_HKD',     // Hong Kong HSI
};

// Assets that Finnhub doesn't support - we'll use mock prices
const UNSUPPORTED_ASSETS = {
  'TM.D.ZINC.CFD.IP': { name: 'Zinc', basePrice: 2500 },
  'CC.D.COFFEE.UMA.IP': { name: 'Coffee', basePrice: 180 },
};

// Reverse mapping for quick lookup
const SYMBOL_TO_EPIC = {};
Object.entries(FINNHUB_SYMBOLS).forEach(([epic, symbol]) => {
  SYMBOL_TO_EPIC[symbol] = epic;
});

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
      
      // Start mock price updates for unsupported assets
      this._startMockPrices();
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
    Object.values(FINNHUB_SYMBOLS).forEach(symbol => {
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

  /**
   * Handle incoming trade data
   */
  _handleTradeData(trades) {
    if (!Array.isArray(trades)) return;

    trades.forEach(trade => {
      const symbol = trade.s;
      const price = trade.p;
      const timestamp = trade.t;

      const epic = SYMBOL_TO_EPIC[symbol];
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
    return epic in FINNHUB_SYMBOLS;
  }

  /**
   * Get list of epics handled by Finnhub
   */
  static getHandledEpics() {
    return Object.keys(FINNHUB_SYMBOLS);
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
