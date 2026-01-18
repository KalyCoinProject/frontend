import { authLogger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  fetchGraphQLWithAuth,
  isTokenExpired,
  parseAuthError
} from '@/utils/auth';

interface User {
  id: string;
  username: string;
  email: string;
}

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check if user is authenticated on mount
  const checkAuth = useCallback(async () => {
    try {
      setError(null);
      const token = getAuthToken();

      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Check if token is expired before making request
      if (isTokenExpired(token)) {
        authLogger.warn('Token is expired, removing from storage');
        removeAuthToken();
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Verify token with backend using enhanced fetch
      const result = await fetchGraphQLWithAuth(`
        query Me {
          me {
            id
            username
            email
          }
        }
      `);

      if (result.data?.me) {
        setUser(result.data.me);
      } else {
        // No user data returned, token might be invalid
        removeAuthToken();
        setUser(null);
      }
    } catch (error) {
      authLogger.error('Auth check failed:', error);
      const authError = parseAuthError(error);

      // Set user-friendly error message
      setError(authError.message);

      // Clean up if it's an auth-related error
      if (authError.shouldRedirectToLogin) {
        removeAuthToken();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Login function
  const login = useCallback(async (username: string, password: string) => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await fetchGraphQLWithAuth(`
        mutation Login($username: String!, $password: String!) {
          login(username: $username, password: $password) {
            token
            user {
              id
              username
              email
            }
          }
        }
      `, { username, password });

      const { token, user: userData } = result.data.login;
      setAuthToken(token);
      setUser(userData);
    } catch (error) {
      const authError = parseAuthError(error);
      setError(authError.message);
      throw new Error(authError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    removeAuthToken();
    setUser(null);
    setError(null);
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    checkAuth,
    clearError
  };
}
