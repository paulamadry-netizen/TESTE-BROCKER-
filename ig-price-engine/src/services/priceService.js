/**
 * Price Service
 * Fetches real-time prices from IG Markets API
 */

const igApiClient = require('./igApiClient');
const { getAllEpics, getEpicInfo } = require('../config/epics');

class PriceService {
  constructor() {
    this.priceCache = new Map();
    this.lastUpdate = null;
    this.updateInterval = null;
    this.subscribers = new Set();
    this.isRunning = false;
    this._consecutiveErrors = 0;
    this._lastErrorAt = null;
    this._recoveryInProgress = false;
    this.subscribedEpics = new Set();
    
    // Configuration - IG API has strict rate limits
    this.pollIntervalMs = parseInt(process.env.PRICE_POLL_INTERVAL_MS) || 5000; // 5 seconds default
    this.batchSize = 50; // IG API allows up to 50 epics per request
    this._backoffMs = 0; // Exponential backoff on rate limit
    this._lastRateLimitAt = null;
  }

  setSubscribedEpics(epics) {
    this.subscribedEpics.clear();
    if (Array.isArray(epics)) {
      for (const e of epics) {
        if (typeof e === 'string' && e.trim()) this.subscribedEpics.add(e.trim());
      }
    }
  }

  addSubscribedEpics(epics) {
    if (!Array.isArray(epics)) return;
    for (const e of epics) {
      if (typeof e === 'string' && e.trim()) this.subscribedEpics.add(e.trim());
    }
  }

  removeSubscribedEpics(epics) {
    if (!Array.isArray(epics)) return;
    for (const e of epics) {
      this.subscribedEpics.delete(e);
    }
  }

  /**
   * Start the price service (streaming preferred, polling fallback)
   */
  async start(io) {
    if (this.isRunning) {
      console.log('[PriceService] Already running');
      return;
    }

    this.io = io;
    this.isRunning = true;
    
    // Try streaming first
    const streamingStarted = await this._tryStartStreaming();
    
    if (!streamingStarted) {
      // Fallback to polling
      console.log(`[PriceService] Starting polling fallback (every ${this.pollIntervalMs}ms)`);
      this.useStreaming = false;
      this.fetchAllPrices();
      this.updateInterval = setInterval(() => {
        this.fetchAllPrices();
      }, this.pollIntervalMs);
    }
  }

  /**
   * Try to start Lightstreamer streaming
   */
  async _tryStartStreaming() {
    try {
      const igAuthService = require('./igAuthService');
      const igStreamingService = require('./igStreamingService');
      
      const authStatus = igAuthService.getStatus();
      if (!authStatus.isAuthenticated || !authStatus.hasTokens) {
        console.log('[PriceService] Not authenticated, cannot start streaming');
        return false;
      }

      const cst = igAuthService.cst;
      const xst = igAuthService.xSecurityToken;
      const accountId = igAuthService.accountId || 'DEFAULT';
      const lsEndpoint = igAuthService.lightstreamerEndpoint;

      await igStreamingService.connect(cst, xst, accountId, lsEndpoint);
      igStreamingService.setSocketIO(this.io);
      
      const epics = this.subscribedEpics.size > 0 
        ? Array.from(this.subscribedEpics) 
        : getAllEpics();
      
      await igStreamingService.subscribeToEpics(epics, (priceData) => {
        this.priceCache.set(priceData.epic, priceData);
        this.lastUpdate = new Date();
      });

      this.useStreaming = true;
      console.log('[PriceService] ✅ Streaming mode active (no polling needed)');
      return true;
    } catch (error) {
      console.warn('[PriceService] Streaming failed, will use polling:', error.message);
      return false;
    }
  }

  /**
   * Stop the price service
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.useStreaming) {
      try {
        const igStreamingService = require('./igStreamingService');
        igStreamingService.disconnect();
      } catch (e) {}
    }
    this.isRunning = false;
    this.useStreaming = false;
    console.log('[PriceService] Stopped');
  }

  /**
   * Fetch prices for all configured EPICS
   */
  async fetchAllPrices() {
    const igAuthService = require('./igAuthService');
    
    // Rate limit backoff - wait if we hit rate limits recently
    if (this._backoffMs > 0) {
      const timeSinceRateLimit = this._lastRateLimitAt ? (Date.now() - this._lastRateLimitAt) : 999999;
      if (timeSinceRateLimit < this._backoffMs) {
        return; // Still in backoff period
      }
      // Backoff period over, reduce backoff for next time
      this._backoffMs = Math.max(0, this._backoffMs - 10000);
    }
    
    // Check if we need to re-authenticate
    const authStatus = igAuthService.getStatus();
    const staleMs = this.lastUpdate ? (Date.now() - this.lastUpdate.getTime()) : 999999;
    const needsRecovery = !authStatus.isAuthenticated && staleMs > 30000;
    
    if (needsRecovery && !this._recoveryInProgress) {
      console.warn(`[PriceService] Recovery needed (auth=${authStatus.isAuthenticated}, stale=${Math.round(staleMs/1000)}s)`);
      this._recoveryInProgress = true;
      try {
        await igAuthService.login();
        this._consecutiveErrors = 0;
        this._backoffMs = 0;
        console.log('[PriceService] ✅ Recovery complete');
      } catch (e) {
        console.error('[PriceService] Recovery failed:', e.message);
        // If rate limited, apply exponential backoff
        if (e.message?.includes('403') || e.response?.data?.errorCode?.includes('allowance')) {
          this._backoffMs = Math.min(300000, (this._backoffMs || 10000) * 2); // Max 5 min backoff
          this._lastRateLimitAt = Date.now();
          console.warn(`[PriceService] Rate limited, backing off for ${this._backoffMs/1000}s`);
        }
      } finally {
        this._recoveryInProgress = false;
      }
      return; // Don't try to fetch prices right after failed recovery
    }

    // Skip if not authenticated
    if (!authStatus.isAuthenticated) {
      return;
    }

    const allEpics = this.subscribedEpics.size > 0
      ? Array.from(this.subscribedEpics)
      : getAllEpics();
    
    try {
      // Split into batches
      const batches = this._chunkArray(allEpics, this.batchSize);
      
      for (const batch of batches) {
        await this.fetchPricesBatch(batch);
      }
      
      this.lastUpdate = new Date();
      this._consecutiveErrors = 0;
    } catch (error) {
      console.error('[PriceService] Error fetching prices:', error.message);
      this._consecutiveErrors += 1;
      this._lastErrorAt = new Date();

      const status = error.response?.status;
      const errorCode = error.response?.data?.errorCode || '';
      
      // Rate limit detection
      if (status === 403 && errorCode.includes('allowance')) {
        this._backoffMs = Math.min(300000, (this._backoffMs || 10000) * 2);
        this._lastRateLimitAt = Date.now();
        console.warn(`[PriceService] Rate limited! Backing off for ${this._backoffMs/1000}s`);
        igAuthService.isAuthenticated = false; // Mark as not authenticated
        return;
      }
      
      // Auth error - try recovery once, with backoff
      if ((status === 401 || status === 403) && !this._recoveryInProgress && this._consecutiveErrors < 3) {
        this._recoveryInProgress = true;
        try {
          console.warn('[PriceService] Auth error, attempting recovery...');
          await igAuthService.login();
          this._consecutiveErrors = 0;
          console.log('[PriceService] ✅ Recovery complete');
        } catch (e) {
          console.error('[PriceService] Recovery failed:', e.message);
          this._backoffMs = Math.min(300000, (this._backoffMs || 30000) * 2);
          this._lastRateLimitAt = Date.now();
        } finally {
          this._recoveryInProgress = false;
        }
      }
    }
  }

  /**
   * Fetch prices for a batch of EPICS
   */
  async fetchPricesBatch(epics) {
    try {
      const epicsParam = epics.join(',');
      const response = await igApiClient.get(`/markets?epics=${epicsParam}`);
      
      if (response.data && response.data.marketDetails) {
        const prices = this._processPriceData(response.data.marketDetails);
        this._broadcastPrices(prices);
      }
    } catch (error) {
      // Try individual requests if batch fails
      if (error.response?.status === 400) {
        console.warn('[PriceService] Batch request failed, trying individual...');
        await this._fetchIndividualPrices(epics);
      } else {
        throw error;
      }
    }
  }

  /**
   * Fetch individual market price
   */
  async fetchPrice(epic) {
    try {
      const response = await igApiClient.get(`/markets/${epic}`);
      
      if (response.data) {
        const price = this._processMarketData(epic, response.data);
        this.priceCache.set(epic, price);
        return price;
      }
      
      return null;
    } catch (error) {
      console.error(`[PriceService] Error fetching price for ${epic}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch prices individually (fallback)
   */
  async _fetchIndividualPrices(epics) {
    const prices = [];
    
    for (const epic of epics) {
      try {
        const price = await this.fetchPrice(epic);
        if (price) {
          prices.push(price);
        }
        // Small delay to avoid rate limiting
        await this._delay(100);
      } catch (error) {
        console.error(`[PriceService] Failed to fetch ${epic}:`, error.message);
      }
    }
    
    if (prices.length > 0) {
      this._broadcastPrices(prices);
    }
  }

  /**
   * Process market details from batch response
   */
  _processPriceData(marketDetails) {
    const prices = [];
    
    for (const market of marketDetails) {
      const epic = market.instrument?.epic;
      if (!epic) continue;
      
      const price = this._processMarketData(epic, market);
      this.priceCache.set(epic, price);
      prices.push(price);
    }
    
    return prices;
  }

  /**
   * Process individual market data
   */
  _processMarketData(epic, data) {
    const epicInfo = getEpicInfo(epic);
    const snapshot = data.snapshot || data;
    const instrument = data.instrument || {};

    const scalingFactorRaw = instrument.scalingFactor;
    const scalingFactor = Number.isFinite(Number(scalingFactorRaw)) ? Number(scalingFactorRaw) : 1;

    const inferDividerForEpic = (n) => {
      if (!Number.isFinite(n) || n === 0) return 1;

      // Forex epics: CS.D.*
      // Some IG responses return forex prices scaled (e.g. EURUSD ~ 13051 instead of 1.3051)
      if (typeof epic === 'string' && epic.startsWith('CS.D.')) {
        const isJpy = epic.includes('JPY');
        if (isJpy) {
          // USDJPY ~ 156.50; if we see thousands, it's scaled by 100
          if (Math.abs(n) > 1000) return 100;
          return 1;
        }
        // Non-JPY forex usually ~ 0.5 - 2.0; if we see > 20 it's almost certainly x10000
        if (Math.abs(n) > 20) return 10000;
        return 1;
      }

      // Metals / commodities can also be scaled, but less frequently.
      // Keep conservative heuristics.
      if (typeof epic === 'string' && epic.startsWith('IX.D.')) {
        // Indices values are usually 1k-100k. If we see millions, might be x100.
        if (Math.abs(n) > 2000000) return 100;
        return 1;
      }

      return 1;
    };

    const normalize = (v) => {
      const raw = parseFloat(v);
      if (!Number.isFinite(raw)) return 0;

      // 1) Apply IG scalingFactor if it looks reliable
      if (scalingFactor > 1 && Math.abs(raw) >= scalingFactor) {
        const scaled = raw / scalingFactor;
        // If scaled looks sane, keep it
        if (Number.isFinite(scaled) && scaled !== 0) return scaled;
      }

      // 2) Fallback: infer divider from epic patterns
      const divider = inferDividerForEpic(raw);
      return raw / divider;
    };
    
    return {
      epic: epic,
      symbol: epicInfo?.symbol || epic,
      name: epicInfo?.name || instrument.name || epic,
      bid: normalize(snapshot.bid),
      offer: normalize(snapshot.offer),
      high: normalize(snapshot.high),
      low: normalize(snapshot.low),
      open: normalize(snapshot.openPrice),
      close: normalize(snapshot.closePrice),
      change: normalize(snapshot.netChange),
      changePercent: parseFloat(snapshot.percentageChange) || 0,
      updateTime: snapshot.updateTime || new Date().toISOString(),
      marketStatus: snapshot.marketStatus || 'UNKNOWN',
      scalingFactor: instrument.scalingFactor || 1,
      pipValue: instrument.pipValue || 0.0001,
      lotSize: instrument.lotSize || 1,
      timestamp: Date.now()
    };
  }

  /**
   * Broadcast prices to all connected WebSocket clients
   */
  _broadcastPrices(prices) {
    if (this.io && prices.length > 0) {
      this.io.emit('prices', {
        type: 'price_update',
        data: prices,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get cached price for an epic
   */
  getCachedPrice(epic) {
    return this.priceCache.get(epic) || null;
  }

  /**
   * Get all cached prices
   */
  getAllCachedPrices() {
    return Array.from(this.priceCache.values());
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.useStreaming ? 'streaming' : 'polling',
      lastUpdate: this.lastUpdate,
      cachedPricesCount: this.priceCache.size,
      pollIntervalMs: this.pollIntervalMs,
      subscribedEpicsCount: this.subscribedEpics.size,
      consecutiveErrors: this._consecutiveErrors,
      lastErrorAt: this._lastErrorAt
    };
  }

  /**
   * Helper: Split array into chunks
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Helper: Delay
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const priceService = new PriceService();

module.exports = priceService;
