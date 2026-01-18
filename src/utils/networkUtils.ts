import { contractLogger } from '@/lib/logger';
/**
 * Network utilities for handling API requests with proper error handling,
 * timeouts, and retry logic to prevent NetworkError issues.
 */

export interface NetworkRequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface NetworkError extends Error {
  isNetworkError: boolean;
  isTimeout: boolean;
  statusCode?: number;
}

/**
 * Enhanced fetch wrapper with timeout, retry logic, and proper error handling
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & NetworkRequestOptions = {}
): Promise<Response> {
  const {
    timeout = 10000,
    retries = 2,
    retryDelay = 1000,
    headers = {},
    ...fetchOptions
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      const isLastAttempt = attempt === retries;
      const networkError = createNetworkError(error, url);

      if (isLastAttempt) {
        contractLogger.error(`❌ Network request failed after ${retries + 1} attempts:`, url, networkError);
        throw networkError;
      }

      contractLogger.warn(`⚠️ Network request attempt ${attempt + 1} failed, retrying:`, url, networkError.message);
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
    }
  }

  throw new Error('All retry attempts failed');
}

/**
 * Fetch JSON data with automatic error handling and parsing
 */
export async function fetchJSON<T = any>(
  url: string,
  options: RequestInit & NetworkRequestOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as NetworkError;
    error.isNetworkError = true;
    error.isTimeout = false;
    error.statusCode = response.status;
    throw error;
  }

  try {
    return await response.json();
  } catch (parseError) {
    const error = new Error('Failed to parse JSON response') as NetworkError;
    error.isNetworkError = true;
    error.isTimeout = false;
    throw error;
  }
}

/**
 * GraphQL request with proper error handling
 */
export async function fetchGraphQL<T = any>(
  url: string,
  query: string,
  variables?: Record<string, any>,
  options: NetworkRequestOptions = {}
): Promise<T> {
  const response = await fetchJSON<{ data: T; errors?: any[] }>(url, {
    method: 'POST',
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
    ...options,
  });

  if (response.errors && response.errors.length > 0) {
    const errorMessage = response.errors.map(err => err.message).join(', ');
    const error = new Error(`GraphQL Error: ${errorMessage}`) as NetworkError;
    error.isNetworkError = true;
    error.isTimeout = false;
    throw error;
  }

  return response.data;
}

/**
 * Create a standardized network error
 */
function createNetworkError(error: unknown, url: string): NetworkError {
  let message = 'Network request failed';
  let isTimeout = false;

  if (error instanceof Error) {
    message = error.message;
    isTimeout = error.name === 'AbortError';
  }

  const networkError = new Error(`${message} (${url})`) as NetworkError;
  networkError.isNetworkError = true;
  networkError.isTimeout = isTimeout;

  return networkError;
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof Error && 
    ('isNetworkError' in error || 
     error.message.includes('Failed to fetch') ||
     error.message.includes('NetworkError') ||
     error.message.includes('fetch') ||
     error.name === 'AbortError');
}

/**
 * Safe API call wrapper that handles errors gracefully
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  fallbackValue: T,
  errorContext: string = 'API call'
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    if (isNetworkError(error)) {
      contractLogger.warn(`${errorContext} failed with network error, using fallback:`, error.message);
    } else {
      contractLogger.error(`${errorContext} failed:`, error);
    }
    return fallbackValue;
  }
}

/**
 * Debounced network request to prevent rapid successive calls
 */
export function createDebouncedRequest<T extends any[], R>(
  requestFn: (...args: T) => Promise<R>,
  delay: number = 300
) {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastPromise: Promise<R> | null = null;

  return (...args: T): Promise<R> => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (lastPromise) {
      return lastPromise;
    }

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          lastPromise = requestFn(...args);
          const result = await lastPromise;
          lastPromise = null;
          resolve(result);
        } catch (error) {
          lastPromise = null;
          reject(error);
        }
      }, delay);
    });
  };
}
