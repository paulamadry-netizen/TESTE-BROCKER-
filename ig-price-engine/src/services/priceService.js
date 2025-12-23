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
    
    // Configuration
    this.pollIntervalMs = parseInt(process.env.PRICE_POLL_INTERVAL_MS) || 1000; // 1 second
    this.batchSize = 50; // IG API allows up to 50 epics per request
  }

  /**
   * Start the price polling service
   */
  start(io) {
    if (this.isRunning) {
      console.log('[PriceService] Already running');
      return;
    }

    this.io = io;
    this.isRunning = true;
    console.log(`[PriceService] Starting price polling (every ${this.pollIntervalMs}ms)`);
    
    // Initial fetch
    this.fetchAllPrices();
    
    // Start polling
    this.updateInterval = setInterval(() => {
      this.fetchAllPrices();
    }, this.pollIntervalMs);
  }

  /**
   * Stop the price polling service
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('[PriceService] Stopped');
  }

  /**
   * Fetch prices for all configured EPICS
   */
  async fetchAllPrices() {
    const allEpics = getAllEpics();
    
    try {
      // Split into batches
      const batches = this._chunkArray(allEpics, this.batchSize);
      
      for (const batch of batches) {
        await this.fetchPricesBatch(batch);
      }
      
      this.lastUpdate = new Date();
    } catch (error) {
      console.error('[PriceService] Error fetching prices:', error.message);
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
    
    return {
      epic: epic,
      symbol: epicInfo?.symbol || epic,
      name: epicInfo?.name || instrument.name || epic,
      bid: parseFloat(snapshot.bid) || 0,
      offer: parseFloat(snapshot.offer) || 0,
      high: parseFloat(snapshot.high) || 0,
      low: parseFloat(snapshot.low) || 0,
      open: parseFloat(snapshot.openPrice) || 0,
      close: parseFloat(snapshot.closePrice) || 0,
      change: parseFloat(snapshot.netChange) || 0,
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
      lastUpdate: this.lastUpdate,
      cachedPricesCount: this.priceCache.size,
      pollIntervalMs: this.pollIntervalMs
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
