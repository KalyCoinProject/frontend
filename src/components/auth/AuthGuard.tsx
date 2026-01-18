'use client';

import { authLogger } from '@/lib/logger';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * AuthGuard component that protects routes requiring authentication
 * Handles token expiration, network errors, and provides user feedback
 */
export function AuthGuard({ 
  children, 
  fallback, 
  redirectTo = '/login' 
}: AuthGuardProps) {
  const { user, isAuthenticated, isLoading, error, checkAuth, logout, clearError } = useAuth();
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // Handle authentication errors
  useEffect(() => {
    if (error && !isLoading) {
      // If it's an authentication error, redirect after a delay
      if (error.includes('session') || error.includes('log in')) {
        const timer = setTimeout(() => {
          router.push(redirectTo);
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
  }, [error, isLoading, router, redirectTo]);

  // Retry authentication check
  const handleRetry = async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    clearError();
    
    try {
      await checkAuth();
      setRetryCount(prev => prev + 1);
    } catch (err) {
      authLogger.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Show loading state
  if (isLoading) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Card className="w-full max-w-md mx-4 bg-slate-800/50 border-slate-700">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
              <h3 className="text-lg font-semibold text-white">Checking Authentication</h3>
              <p className="text-slate-400 text-center">
                Verifying your session...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state with retry options
  if (error && !isAuthenticated) {
    const isNetworkError = error.includes('Network') || error.includes('connection');
    const isAuthError = error.includes('session') || error.includes('log in');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Card className="w-full max-w-md mx-4 bg-slate-800/50 border-slate-700">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-6">
              <AlertCircle className="h-12 w-12 text-red-400" />
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">
                  {isAuthError ? 'Session Expired' : 'Connection Error'}
                </h3>
                <p className="text-slate-400">
                  {error}
                </p>
              </div>

              <div className="flex flex-col space-y-3 w-full">
                {isNetworkError && (
                  <Button
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again {retryCount > 0 && `(${retryCount})`}
                      </>
                    )}
                  </Button>
                )}

                {isAuthError && (
                  <Button
                    onClick={() => router.push(redirectTo)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Go to Login
                  </Button>
                )}

                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout & Return Home
                </Button>
              </div>

              {isAuthError && (
                <p className="text-xs text-slate-500 text-center">
                  Redirecting to login in a few seconds...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Redirect to login if not authenticated and no error (shouldn't happen but safety check)
  if (!isAuthenticated && !error) {
    router.push(redirectTo);
    return null;
  }

  // Render protected content
  return <>{children}</>;
}

/**
 * Higher-order component version of AuthGuard
 */
export function withAuthGuard<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<AuthGuardProps, 'children'>
) {
  return function AuthGuardedComponent(props: P) {
    return (
      <AuthGuard {...options}>
        <Component {...props} />
      </AuthGuard>
    );
  };
}
