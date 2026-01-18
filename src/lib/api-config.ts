import { subgraphLogger } from '@/lib/logger';
/**
 * Centralized API configuration for KalySwap frontend
 * Handles environment-based URL configuration for different services
 */

// Base API URL from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Validate API URL format
const validateApiUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Ensure API URL is valid
if (!validateApiUrl(API_BASE_URL)) {
  subgraphLogger.error('❌ Invalid API_BASE_URL:', API_BASE_URL);
}

/**
 * API endpoints configuration
 */
export const API_CONFIG = {
  // GraphQL endpoint for subgraph queries
  GRAPHQL_ENDPOINT: `${API_BASE_URL}/graphql`,
  
  // REST API endpoints
  AUTH: `${API_BASE_URL}/auth`,
  USERS: `${API_BASE_URL}/users`,
  TRANSACTIONS: `${API_BASE_URL}/transactions`,
  
  // Health check endpoint
  HEALTH: `${API_BASE_URL}/health`,
} as const;

/**
 * Request configuration defaults
 */
export const REQUEST_CONFIG = {
  // Default timeout for API requests (30 seconds)
  TIMEOUT: 30000,
  
  // Default headers for all requests
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

/**
 * Environment-aware logging
 */
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Enhanced fetch wrapper with retry logic and proper error handling
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...REQUEST_CONFIG.DEFAULT_HEADERS,
      ...options.headers,
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_CONFIG.TIMEOUT);
    
    const response = await fetch(url, {
      ...config,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (isDevelopment) {
      subgraphLogger.error(`❌ API Request failed (${url}):`, error);
    }

    // Retry logic for network errors
    if (retryCount < REQUEST_CONFIG.RETRY_ATTEMPTS &&
        (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))) {
      
      if (isDevelopment) {
        subgraphLogger.debug(`🔄 Retrying request (${retryCount + 1}/${REQUEST_CONFIG.RETRY_ATTEMPTS}): ${url}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, REQUEST_CONFIG.RETRY_DELAY * (retryCount + 1)));
      return apiRequest<T>(endpoint, options, retryCount + 1);
    }

    throw error;
  }
}

/**
 * GraphQL-specific request function
 */
export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>,
  options: Omit<RequestInit, 'body' | 'method'> = {}
): Promise<T> {
  const body = JSON.stringify({
    query,
    variables: variables || {},
  });

  const response = await apiRequest<{ data: T; errors?: any[] }>(
    API_CONFIG.GRAPHQL_ENDPOINT,
    {
      method: 'POST',
      body,
      ...options,
    }
  );

  if (response.errors && response.errors.length > 0) {
    const errorMessage = response.errors.map(err => err.message).join(', ');
    throw new Error(`GraphQL Error: ${errorMessage}`);
  }

  return response.data;
}

/**
 * Health check function
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    await apiRequest(API_CONFIG.HEALTH, { method: 'GET' });
    return true;
  } catch {
    return false;
  }
}

// Log configuration in development
if (isDevelopment) {
  subgraphLogger.debug('🔧 API Configuration:', {
    BASE_URL: API_BASE_URL,
    GRAPHQL_ENDPOINT: API_CONFIG.GRAPHQL_ENDPOINT,
    ENVIRONMENT: process.env.NODE_ENV,
  });
}
