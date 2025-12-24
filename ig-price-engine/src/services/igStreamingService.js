/**
 * IG Markets Streaming Service
 * Uses Lightstreamer for real-time price streaming (no polling, no rate limits)
 */

const { LightstreamerClient, Subscription } = require('lightstreamer-client-node');

class IGStreamingService {
  constructor() {
    this.client = null;
    this.subscription = null;
    this.isConnected = false;
    this.subscribedEpics = new Set();
    this.priceCallback = null;
    this.io = null;
    
    // IG Lightstreamer endpoint
    this.lsEndpoint = 'https://apd.marketdatasystems.com';
  }

  /**
   * Initialize streaming connection
   */
  async connect(cst, xSecurityToken, accountId) {
    if (this.isConnected) {
      console.log('[IGStreaming] Already connected');
      return;
    }

    console.log('[IGStreaming] Connecting to Lightstreamer...');
    
    try {
      this.client = new LightstreamerClient(this.lsEndpoint, 'DEFAULT');
      
      // Set credentials - IG uses CST:XST format for password
      this.client.connectionDetails.setUser(accountId);
      this.client.connectionDetails.setPassword(`CST-${cst}|XST-${xSecurityToken}`);
      
      // Connection listeners
      this.client.addListener({
        onStatusChange: (status) => {
          console.log(`[IGStreaming] Status: ${status}`);
          this.isConnected = status.startsWith('CONNECTED');
        },
        onServerError: (code, message) => {
          console.error(`[IGStreaming] Server error ${code}: ${message}`);
        }
      });

      // Connect
      this.client.connect();
      
      // Wait for connection
      await this._waitForConnection(10000);
      
      console.log('[IGStreaming] ✅ Connected to Lightstreamer');
      return true;
    } catch (error) {
      console.error('[IGStreaming] Connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  _waitForConnection(timeoutMs) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }
      }, 100);
    });
  }

  /**
   * Subscribe to price updates for epics
   */
  subscribeToEpics(epics, callback) {
    if (!this.isConnected || !this.client) {
      console.error('[IGStreaming] Not connected, cannot subscribe');
      return false;
    }

    this.priceCallback = callback;
    
    if (this.subscription) {
      try {
        this.client.unsubscribe(this.subscription);
      } catch (e) {}
    }

    const items = epics.map(epic => `MARKET:${epic}`);
    const fields = ['BID', 'OFFER', 'HIGH', 'LOW', 'MID_OPEN', 'CHANGE', 'CHANGE_PCT', 'UPDATE_TIME', 'MARKET_STATE'];
    
    console.log(`[IGStreaming] Subscribing to ${epics.length} epics...`);
    
    this.subscription = new Subscription('MERGE', items, fields);
    this.subscription.setDataAdapter('DEFAULT');
    this.subscription.setRequestedSnapshot('yes');
    
    this.subscription.addListener({
      onSubscription: () => {
        console.log(`[IGStreaming] ✅ Subscribed to ${epics.length} epics`);
        epics.forEach(e => this.subscribedEpics.add(e));
      },
      onUnsubscription: () => {
        console.log('[IGStreaming] Unsubscribed');
      },
      onItemUpdate: (update) => {
        this._handlePriceUpdate(update);
      },
      onSubscriptionError: (code, message) => {
        console.error(`[IGStreaming] Subscription error ${code}: ${message}`);
      }
    });

    this.client.subscribe(this.subscription);
    return true;
  }

  _handlePriceUpdate(update) {
    try {
      const itemName = update.getItemName();
      const epic = itemName.replace('MARKET:', '');
      
      const bid = parseFloat(update.getValue('BID')) || 0;
      const offer = parseFloat(update.getValue('OFFER')) || 0;
      const high = parseFloat(update.getValue('HIGH')) || 0;
      const low = parseFloat(update.getValue('LOW')) || 0;
      const change = parseFloat(update.getValue('CHANGE')) || 0;
      const changePct = parseFloat(update.getValue('CHANGE_PCT')) || 0;
      const updateTime = update.getValue('UPDATE_TIME') || '';
      const marketState = update.getValue('MARKET_STATE') || '';

      const priceData = {
        epic,
        bid,
        offer,
        high,
        low,
        change,
        changePercent: changePct,
        updateTime,
        marketStatus: marketState,
        timestamp: Date.now()
      };

      if (this.priceCallback) {
        this.priceCallback(priceData);
      }

      if (this.io) {
        this.io.emit('prices', { data: [priceData] });
      }
    } catch (error) {
      console.error('[IGStreaming] Error processing update:', error.message);
    }
  }

  setSocketIO(io) {
    this.io = io;
  }

  disconnect() {
    if (this.client) {
      try {
        if (this.subscription) {
          this.client.unsubscribe(this.subscription);
        }
        this.client.disconnect();
      } catch (e) {}
    }
    this.isConnected = false;
    this.subscribedEpics.clear();
    console.log('[IGStreaming] Disconnected');
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      subscribedEpicsCount: this.subscribedEpics.size,
      mode: 'streaming'
    };
  }
}

module.exports = new IGStreamingService();
