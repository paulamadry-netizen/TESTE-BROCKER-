/**
 * IG Markets API Client with Auto-Recovery Interceptor
 * Handles automatic re-authentication on 401/403 errors
 */

const axios = require('axios');
const igAuthService = require('./igAuthService');

class IGApiClient {
  constructor() {
    this.baseUrl = process.env.IG_BASE_URL || 'https://api.ig.com/gateway/deal';
    this.client = this._createClient();
    this.retryQueue = new Map();
  }

  /**
   * Create Axios instance with interceptors
   */
  _createClient() {
    const client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000
    });

    // Request interceptor - add auth headers
    client.interceptors.request.use(
      async (config) => {
        // Skip auth headers for login endpoint
        if (config.url === '/session' && config.method === 'post') {
          return config;
        }

        // Check if session needs proactive refresh
        if (igAuthService.needsRefresh() && igAuthService.isAuthenticated) {
          console.log('[IGClient] Proactive session refresh...');
          await igAuthService.refreshSession();
        }

        // Add authentication headers
        try {
          const authHeaders = igAuthService.getAuthHeaders();
          config.headers = { ...config.headers, ...authHeaders };
        } catch (error) {
          console.warn('[IGClient] Auth headers not available, attempting login...');
          await igAuthService.login();
          const authHeaders = igAuthService.getAuthHeaders();
          config.headers = { ...config.headers, ...authHeaders };
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle 401/403 errors
    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Check if it's an auth error and we haven't retried yet
        if (
          error.response &&
          (error.response.status === 401 || error.response.status === 403) &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;
          
          console.log(`[IGClient] ⚠️ Received ${error.response.status}, attempting re-authentication...`);

          try {
            // Re-authenticate
            await igAuthService.login();
            
            // Update headers with new tokens
            const authHeaders = igAuthService.getAuthHeaders();
            originalRequest.headers = { ...originalRequest.headers, ...authHeaders };
            
            console.log('[IGClient] ✅ Re-authentication successful, retrying request...');
            
            // Retry the original request
            return client(originalRequest);
          } catch (loginError) {
            console.error('[IGClient] ❌ Re-authentication failed:', loginError.message);
            return Promise.reject(loginError);
          }
        }

        // Log other errors
        if (error.response) {
          console.error(`[IGClient] API Error ${error.response.status}:`, error.response.data);
        } else {
          console.error('[IGClient] Network Error:', error.message);
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  /**
   * GET request
   */
  async get(endpoint, config = {}) {
    return this.client.get(endpoint, config);
  }

  /**
   * POST request
   */
  async post(endpoint, data = {}, config = {}) {
    return this.client.post(endpoint, data, config);
  }

  /**
   * PUT request
   */
  async put(endpoint, data = {}, config = {}) {
    return this.client.put(endpoint, data, config);
  }

  /**
   * DELETE request
   */
  async delete(endpoint, config = {}) {
    return this.client.delete(endpoint, config);
  }
}

// Singleton instance
const igApiClient = new IGApiClient();

module.exports = igApiClient;
