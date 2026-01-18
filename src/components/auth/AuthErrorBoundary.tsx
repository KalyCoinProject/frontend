'use client';

import { authLogger } from '@/lib/logger';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

/**
 * Error boundary specifically designed to handle authentication-related errors
 * Provides user-friendly error messages and recovery options
 */
export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    authLogger.error('AuthErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Check if it's an authentication-related error
    const isAuthError = this.isAuthenticationError(error);
    if (isAuthError) {
      // Clean up auth token on authentication errors
      this.cleanupAuthToken();
    }
  }

  private isAuthenticationError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('token') ||
      message.includes('session') ||
      message.includes('login')
    );
  }

  private cleanupAuthToken() {
    try {
      localStorage.removeItem('auth_token');
    } catch (error) {
      authLogger.warn('Failed to clean up auth token:', error);
    }
  }

  private handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  private handleGoHome = () => {
    this.cleanupAuthToken();
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const isAuthError = this.isAuthenticationError(this.state.error);
      const isNetworkError = this.state.error.message.toLowerCase().includes('network') ||
                            this.state.error.message.toLowerCase().includes('fetch');

      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
          <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
            <CardContent className="p-8">
              <div className="flex flex-col items-center space-y-6">
                <AlertTriangle className="h-16 w-16 text-red-400" />
                
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-bold text-white">
                    {isAuthError ? 'Authentication Error' : 'Something Went Wrong'}
                  </h1>
                  <p className="text-slate-400">
                    {isAuthError 
                      ? 'There was a problem with your session. Please log in again.'
                      : isNetworkError
                      ? 'Unable to connect to the server. Please check your internet connection.'
                      : 'An unexpected error occurred. We apologize for the inconvenience.'
                    }
                  </p>
                </div>

                {/* Error details for development */}
                {process.env.NODE_ENV === 'development' && (
                  <details className="w-full">
                    <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-400">
                      Error Details (Development)
                    </summary>
                    <div className="mt-2 p-3 bg-slate-900/50 rounded border border-slate-700">
                      <p className="text-xs text-red-400 font-mono break-all">
                        {this.state.error.message}
                      </p>
                      {this.state.error.stack && (
                        <pre className="text-xs text-slate-500 mt-2 overflow-auto max-h-32">
                          {this.state.error.stack}
                        </pre>
                      )}
                    </div>
                  </details>
                )}

                <div className="flex flex-col space-y-3 w-full">
                  {isNetworkError && (
                    <Button
                      onClick={this.handleRetry}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again {this.state.retryCount > 0 && `(${this.state.retryCount})`}
                    </Button>
                  )}

                  {isAuthError && (
                    <Button
                      onClick={() => window.location.href = '/login'}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Go to Login
                    </Button>
                  )}

                  <Button
                    onClick={this.handleReload}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reload Page
                  </Button>

                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                  If this problem persists, please contact support.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook version for functional components
 */
export function useAuthErrorHandler() {
  const handleAuthError = (error: Error) => {
    authLogger.error('Authentication error:', error);
    
    // Clean up auth token
    try {
      localStorage.removeItem('auth_token');
    } catch (e) {
      authLogger.warn('Failed to clean up auth token:', e);
    }

    // Redirect to login for auth errors
    const isAuthError = error.message.toLowerCase().includes('authentication') ||
                       error.message.toLowerCase().includes('unauthorized') ||
                       error.message.toLowerCase().includes('token') ||
                       error.message.toLowerCase().includes('session');

    if (isAuthError) {
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    }
  };

  return { handleAuthError };
}
