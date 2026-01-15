/**
 * API Retry Utility with Exponential Backoff + Circuit Breaker
 * For resilient GET requests under load
 * 
 * Features:
 * - Retries ONLY on transient errors (network/timeout, 5xx, 520, 429)
 * - NO retries on 400/401/403 (client errors)
 * - Max 2 retries (3 attempts total)
 * - Exponential backoff + jitter, capped delay
 * - AbortController support for cancellation
 * - Circuit breaker to prevent spam on persistent failures
 */
import axios from 'axios';

// Retry configuration
const MAX_RETRIES = 2;           // 3 attempts total
const INITIAL_DELAY_MS = 500;    // First retry after 500ms
const MAX_DELAY_MS = 3000;       // Cap at 3 seconds
const JITTER_MS = 200;           // Random jitter 0-200ms

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5;  // Failures before circuit opens
const CIRCUIT_BREAKER_RESET_MS = 30000; // 30s before retry after circuit opens

// Circuit breaker state (per endpoint)
const circuitState = new Map();

/**
 * Calculate delay with exponential backoff and jitter
 */
function getRetryDelay(attempt) {
  const exponentialDelay = INITIAL_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * JITTER_MS;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

/**
 * Check if error is retryable
 * ONLY retry on transient errors, NOT on client errors
 */
function isRetryableError(error) {
  // Network errors (no response) - retry
  if (!error.response) {
    return true;
  }
  
  const status = error.response.status;
  
  // Explicitly DO NOT retry on client errors
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  
  // Retry on rate limit (429) - respect Retry-After if present
  if (status === 429) {
    return true;
  }
  
  // Retry on server errors (5xx) including Cloudflare 520-529
  if (status >= 500 && status < 600) {
    return true;
  }
  
  // Don't retry other errors
  return false;
}

/**
 * Get circuit breaker state for an endpoint
 */
function getCircuitState(endpoint) {
  const baseEndpoint = endpoint.split('?')[0]; // Ignore query params
  if (!circuitState.has(baseEndpoint)) {
    circuitState.set(baseEndpoint, {
      failures: 0,
      lastFailure: 0,
      isOpen: false
    });
  }
  return circuitState.get(baseEndpoint);
}

/**
 * Record failure for circuit breaker
 */
function recordFailure(endpoint) {
  const state = getCircuitState(endpoint);
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    console.warn(`[Circuit Breaker] OPEN for ${endpoint} after ${state.failures} failures`);
  }
}

/**
 * Record success - reset circuit breaker
 */
function recordSuccess(endpoint) {
  const state = getCircuitState(endpoint);
  state.failures = 0;
  state.isOpen = false;
}

/**
 * Check if circuit is open (should block requests)
 */
function isCircuitOpen(endpoint) {
  const state = getCircuitState(endpoint);
  
  if (!state.isOpen) {
    return false;
  }
  
  // Check if enough time has passed to try again
  if (Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    console.info(`[Circuit Breaker] Resetting for ${endpoint} - attempting half-open`);
    state.isOpen = false;
    state.failures = Math.floor(state.failures / 2); // Reduce but don't reset
    return false;
  }
  
  return true;
}

/**
 * Make a GET request with automatic retry and circuit breaker
 * 
 * @param {string} url - Request URL
 * @param {object} config - Axios config (headers, params, signal, etc.)
 * @returns {Promise} - Axios response
 * @throws {Error} - On permanent failure or circuit open
 */
export async function getWithRetry(url, config = {}) {
  // Check circuit breaker
  if (isCircuitOpen(url)) {
    const error = new Error(`Service temporarily unavailable. Please try again in a moment.`);
    error.isCircuitOpen = true;
    error.endpoint = url;
    throw error;
  }
  
  let lastError;
  const signal = config.signal; // AbortController signal
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check if request was cancelled
    if (signal?.aborted) {
      const error = new Error('Request cancelled');
      error.name = 'AbortError';
      throw error;
    }
    
    try {
      const response = await axios.get(url, {
        ...config,
        timeout: config.timeout || 30000,
        signal, // Pass abort signal to axios
      });
      
      // Success - reset circuit breaker
      recordSuccess(url);
      return response;
      
    } catch (error) {
      lastError = error;
      
      // Check for cancellation
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED' || signal?.aborted) {
        throw error; // Don't retry cancelled requests
      }
      
      // Check if we should retry
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        // Get delay - respect Retry-After header if present
        let delay = getRetryDelay(attempt);
        const retryAfter = error.response?.headers?.['retry-after'];
        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
            delay = Math.min(retryAfterMs, MAX_DELAY_MS);
          }
        }
        
        console.warn(
          `[API Retry] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${url} ` +
          `(${error.response?.status || 'network error'}), retrying in ${Math.round(delay)}ms...`
        );
        
        // Wait before retry (but check for cancellation)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delay);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Request cancelled'));
            }, { once: true });
          }
        });
        
      } else {
        // Not retryable or max retries reached
        recordFailure(url);
        throw error;
      }
    }
  }
  
  // Should not reach here, but just in case
  recordFailure(url);
  throw lastError;
}

/**
 * Reset circuit breaker for an endpoint (for manual retry button)
 */
export function resetCircuitBreaker(endpoint) {
  const baseEndpoint = endpoint?.split('?')[0];
  if (baseEndpoint && circuitState.has(baseEndpoint)) {
    circuitState.delete(baseEndpoint);
    console.info(`[Circuit Breaker] Manually reset for ${baseEndpoint}`);
  }
}

/**
 * Check if circuit is open (for UI to show retry button)
 */
export function checkCircuitOpen(endpoint) {
  return isCircuitOpen(endpoint);
}

/**
 * Create an axios instance with retry interceptor
 * Use this if you prefer interceptor pattern over getWithRetry
 */
export function createRetryAxios() {
  const instance = axios.create();
  
  instance.interceptors.response.use(
    response => {
      // Record success
      recordSuccess(response.config.url);
      return response;
    },
    async error => {
      const config = error.config;
      
      // Only retry GET requests (idempotent)
      if (config?.method?.toLowerCase() !== 'get') {
        return Promise.reject(error);
      }
      
      // Check for cancellation
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return Promise.reject(error);
      }
      
      // Initialize retry count
      config.__retryCount = config.__retryCount || 0;
      
      // Check circuit breaker
      if (isCircuitOpen(config.url)) {
        recordFailure(config.url);
        const circuitError = new Error('Service temporarily unavailable');
        circuitError.isCircuitOpen = true;
        return Promise.reject(circuitError);
      }
      
      if (config.__retryCount < MAX_RETRIES && isRetryableError(error)) {
        config.__retryCount++;
        const delay = getRetryDelay(config.__retryCount - 1);
        
        console.warn(`[API Retry Interceptor] Retrying ${config.url} (attempt ${config.__retryCount})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return instance(config);
      }
      
      // Max retries reached or not retryable
      recordFailure(config.url);
      return Promise.reject(error);
    }
  );
  
  return instance;
}

export default { 
  getWithRetry, 
  createRetryAxios, 
  resetCircuitBreaker, 
  checkCircuitOpen 
};
