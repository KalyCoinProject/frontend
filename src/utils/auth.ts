import { authLogger } from '@/lib/logger';
/**
 * Authentication utilities for JWT token management
 * Handles token validation, expiration checks, and automatic cleanup
 */

export interface TokenPayload {
  id: string;
  username: string;
  iat: number;
  exp: number;
}

export interface AuthError {
  type: 'EXPIRED' | 'INVALID' | 'MISSING' | 'NETWORK';
  message: string;
  shouldRedirectToLogin: boolean;
}

/**
 * Decode JWT token without verification (for client-side expiration checks)
 */
export function decodeJWTPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    
    return decoded as TokenPayload;
  } catch (error) {
    authLogger.warn('Failed to decode JWT token:', error);
    return null;
  }
}

/**
 * Check if JWT token is expired (client-side check)
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload || !payload.exp) {
    return true;
  }

  // Check if token expires within the next 5 minutes (300 seconds)
  const now = Math.floor(Date.now() / 1000);
  const expirationBuffer = 300; // 5 minutes
  
  return payload.exp <= (now + expirationBuffer);
}

/**
 * Get token from localStorage with validation
 */
export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return null;
    }

    // Check if token is expired before returning
    if (isTokenExpired(token)) {
      authLogger.warn('Auth token is expired, removing from localStorage');
      localStorage.removeItem('auth_token');
      return null;
    }

    return token;
  } catch (error) {
    authLogger.error('Error accessing localStorage:', error);
    return null;
  }
}

/**
 * Set auth token in localStorage
 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem('auth_token', token);
  } catch (error) {
    authLogger.error('Error setting auth token:', error);
  }
}

/**
 * Remove auth token from localStorage
 */
export function removeAuthToken(): void {
  try {
    localStorage.removeItem('auth_token');
  } catch (error) {
    authLogger.error('Error removing auth token:', error);
  }
}

/**
 * Parse authentication errors from GraphQL responses
 */
export function parseAuthError(error: any): AuthError {
  const errorMessage = error?.message || String(error);
  
  // Check for specific authentication error patterns
  if (errorMessage.includes('Authentication required')) {
    return {
      type: 'EXPIRED',
      message: 'Your session has expired. Please log in again.',
      shouldRedirectToLogin: true,
    };
  }
  
  if (errorMessage.includes('Invalid token') || errorMessage.includes('Token expired')) {
    return {
      type: 'INVALID',
      message: 'Your session is invalid. Please log in again.',
      shouldRedirectToLogin: true,
    };
  }
  
  if (errorMessage.includes('Unexpected token') && errorMessage.includes('<html')) {
    return {
      type: 'NETWORK',
      message: 'Connection error. Please check your internet connection and try again.',
      shouldRedirectToLogin: false,
    };
  }
  
  // Network or server errors
  if (errorMessage.includes('Failed to fetch') || 
      errorMessage.includes('NetworkError') ||
      errorMessage.includes('fetch')) {
    return {
      type: 'NETWORK',
      message: 'Network error. Please try again.',
      shouldRedirectToLogin: false,
    };
  }
  
  // Default to expired session for unknown auth errors
  return {
    type: 'EXPIRED',
    message: 'Session error. Please log in again.',
    shouldRedirectToLogin: true,
  };
}

/**
 * Enhanced fetch wrapper for GraphQL requests with proper auth error handling
 */
export async function fetchGraphQLWithAuth(
  query: string,
  variables?: Record<string, any>,
  options: RequestInit = {}
): Promise<any> {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      ...options,
      headers,
      body: JSON.stringify({
        query,
        variables: variables || {},
      }),
    });

    // Check if response is not ok (4xx, 5xx status codes)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type to ensure we're getting JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON response but got: ${contentType}. Response: ${text.substring(0, 200)}`);
    }

    const result = await response.json();

    // Handle GraphQL errors
    if (result.errors && result.errors.length > 0) {
      const authError = parseAuthError(result.errors[0]);
      
      // If it's an auth error that should redirect to login, clean up token
      if (authError.shouldRedirectToLogin) {
        removeAuthToken();
      }
      
      throw new Error(authError.message);
    }

    return result;
  } catch (error) {
    // Handle network/parsing errors
    const authError = parseAuthError(error);
    
    if (authError.shouldRedirectToLogin) {
      removeAuthToken();
    }
    
    throw new Error(authError.message);
  }
}

/**
 * Get time until token expires (in seconds)
 */
export function getTokenTimeToExpiry(token: string): number | null {
  const payload = decodeJWTPayload(token);
  if (!payload || !payload.exp) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}

/**
 * Format time remaining until expiry
 */
export function formatTimeToExpiry(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
