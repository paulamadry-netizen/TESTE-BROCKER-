/**
 * IG Markets Authentication Service
 * Handles CST & X-SECURITY-TOKEN management with auto-recovery
 */

const axios = require('axios');

class IGAuthService {
  constructor() {
    this.cst = null;
    this.xSecurityToken = null;
    this.isAuthenticated = false;
    this.lastLoginTime = null;
    this.loginInProgress = null;
    this.heartbeatInterval = null;
    
    // Configuration
    this.apiKey = process.env.IG_API_KEY;
    this.identifier = process.env.IG_IDENTIFIER;
    this.password = process.env.IG_PASSWORD;
    this.baseUrl = process.env.IG_BASE_URL || 'https://api.ig.com/gateway/deal';
    this.refreshIntervalMs = parseInt(process.env.SESSION_REFRESH_INTERVAL_MS) || 1800000; // 30 minutes
  }

  /**
   * Initialize authentication and start heartbeat
   */
  async initialize() {
    console.log('[IGAuth] Initializing authentication service...');
    await this.login();
    this.startHeartbeat();
    return this.isAuthenticated;
  }

  /**
   * Login to IG Markets API and retrieve CST & X-SECURITY-TOKEN
   */
  async login() {
    // Prevent concurrent login attempts
    if (this.loginInProgress) {
      console.log('[IGAuth] Login already in progress, waiting...');
      return this.loginInProgress;
    }

    this.loginInProgress = this._performLogin();
    
    try {
      const result = await this.loginInProgress;
      return result;
    } finally {
      this.loginInProgress = null;
    }
  }

  async _performLogin() {
    console.log('[IGAuth] Attempting login to IG Markets...');
    
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/session`,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json; charset=UTF-8',
          'X-IG-API-KEY': this.apiKey,
          'Version': '2'
        },
        data: {
          identifier: this.identifier,
          password: this.password
        }
      });

      // Extract tokens from response headers
      this.cst = response.headers['cst'];
      this.xSecurityToken = response.headers['x-security-token'];
      
      if (!this.cst || !this.xSecurityToken) {
        throw new Error('Missing CST or X-SECURITY-TOKEN in response headers');
      }

      this.isAuthenticated = true;
      this.lastLoginTime = new Date();
      
      console.log('[IGAuth] ✅ Login successful!');
      console.log(`[IGAuth] CST: ${this.cst.substring(0, 10)}...`);
      console.log(`[IGAuth] X-SECURITY-TOKEN: ${this.xSecurityToken.substring(0, 10)}...`);
      console.log(`[IGAuth] Account Info:`, {
        accountId: response.data.currentAccountId,
        accountType: response.data.accountType,
        currency: response.data.currencyIsoCode
      });

      return true;
    } catch (error) {
      this.isAuthenticated = false;
      console.error('[IGAuth] ❌ Login failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh session tokens silently
   */
  async refreshSession() {
    console.log('[IGAuth] Refreshing session tokens...');
    
    try {
      // IG API uses PUT /session to refresh
      const response = await axios({
        method: 'PUT',
        url: `${this.baseUrl}/session/refresh-token`,
        headers: this.getAuthHeaders()
      });

      // Update tokens if new ones are provided
      if (response.headers['cst']) {
        this.cst = response.headers['cst'];
      }
      if (response.headers['x-security-token']) {
        this.xSecurityToken = response.headers['x-security-token'];
      }

      this.lastLoginTime = new Date();
      console.log('[IGAuth] ✅ Session refreshed successfully');
      return true;
    } catch (error) {
      console.warn('[IGAuth] ⚠️ Session refresh failed, performing full login...');
      return this.login();
    }
  }

  /**
   * Start heartbeat to keep session alive
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // More aggressive heartbeat - every 5 minutes
    const heartbeatMs = Math.min(this.refreshIntervalMs, 300000);
    console.log(`[IGAuth] Starting heartbeat (every ${heartbeatMs / 1000 / 60} minutes)`);
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        // If not authenticated, do full login instead of refresh
        if (!this.isAuthenticated) {
          console.log('[IGAuth] Heartbeat: not authenticated, performing login...');
          await this.login();
        } else {
          await this.refreshSession();
        }
      } catch (error) {
        console.error('[IGAuth] Heartbeat failed:', error.message);
        this.isAuthenticated = false;
      }
    }, heartbeatMs);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[IGAuth] Heartbeat stopped');
    }
  }

  /**
   * Get authentication headers for API requests
   */
  getAuthHeaders() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated. Call login() first.');
    }

    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json; charset=UTF-8',
      'X-IG-API-KEY': this.apiKey,
      'CST': this.cst,
      'X-SECURITY-TOKEN': this.xSecurityToken,
      'Version': '1'
    };
  }

  /**
   * Check if session needs refresh
   */
  needsRefresh() {
    if (!this.lastLoginTime) return true;
    const elapsed = Date.now() - this.lastLoginTime.getTime();
    return elapsed >= this.refreshIntervalMs * 0.9; // Refresh at 90% of interval
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      isAuthenticated: this.isAuthenticated,
      lastLoginTime: this.lastLoginTime,
      hasTokens: !!(this.cst && this.xSecurityToken),
      heartbeatActive: !!this.heartbeatInterval
    };
  }

  /**
   * Get configured axios client for API requests
   */
  getClient() {
    if (!this.cst || !this.xSecurityToken) {
      return null;
    }

    const client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json; charset=UTF-8',
        'X-IG-API-KEY': this.apiKey,
        'CST': this.cst,
        'X-SECURITY-TOKEN': this.xSecurityToken
      }
    });

    return client;
  }

  /**
   * Logout and cleanup
   */
  async logout() {
    this.stopHeartbeat();
    
    if (this.isAuthenticated) {
      try {
        await axios({
          method: 'DELETE',
          url: `${this.baseUrl}/session`,
          headers: this.getAuthHeaders()
        });
        console.log('[IGAuth] Logged out successfully');
      } catch (error) {
        console.warn('[IGAuth] Logout request failed:', error.message);
      }
    }

    this.cst = null;
    this.xSecurityToken = null;
    this.isAuthenticated = false;
    this.lastLoginTime = null;
  }
}

// Singleton instance
const igAuthService = new IGAuthService();

module.exports = igAuthService;
