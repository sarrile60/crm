/**
 * API Retry Utility with Exponential Backoff
 * For resilient GET requests under load
 */
import axios from 'axios';

const MAX_RETRIES = 2;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 3000;

/**
 * Calculate delay with exponential backoff and jitter
 */
function getRetryDelay(attempt) {
  const exponentialDelay = INITIAL_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 200; // 0-200ms jitter
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

/**
 * Check if error is retryable (network errors, 429, 5xx)
 */
function isRetryableError(error) {
  if (!error.response) {
    // Network error or timeout
    return true;
  }
  const status = error.response.status;
  // Retry on 429 (rate limit) or 5xx server errors
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Make a GET request with automatic retry
 * @param {string} url - Request URL
 * @param {object} config - Axios config (headers, params, etc.)
 * @returns {Promise} - Axios response
 */
export async function getWithRetry(url, config = {}) {
  let lastError;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        ...config,
        timeout: config.timeout || 30000, // 30s timeout
      });
      return response;
    } catch (error) {
      lastError = error;
      
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        const delay = getRetryDelay(attempt);
        console.warn(`[API Retry] Attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Don't retry - throw the error
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * Create an axios instance with retry interceptor
 */
export function createRetryAxios() {
  const instance = axios.create();
  
  instance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      
      // Only retry GET requests (idempotent)
      if (config.method !== 'get') {
        return Promise.reject(error);
      }
      
      // Initialize retry count
      config.__retryCount = config.__retryCount || 0;
      
      if (config.__retryCount < MAX_RETRIES && isRetryableError(error)) {
        config.__retryCount++;
        const delay = getRetryDelay(config.__retryCount - 1);
        console.warn(`[API Retry] Retrying ${config.url} (attempt ${config.__retryCount})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return instance(config);
      }
      
      return Promise.reject(error);
    }
  );
  
  return instance;
}

export default { getWithRetry, createRetryAxios };
