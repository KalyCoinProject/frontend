'use client';

import { authLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken, getTokenTimeToExpiry, formatTimeToExpiry } from '@/utils/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';

interface TokenExpirationWarningProps {
  warningThresholdMinutes?: number; // Show warning when token expires within this many minutes
  className?: string;
}

/**
 * Component that shows a warning when the user's token is about to expire
 * Provides options to refresh the session or logout
 */
export function TokenExpirationWarning({ 
  warningThresholdMinutes = 30,
  className = ''
}: TokenExpirationWarningProps) {
  const { user, logout, checkAuth } = useAuth();
  const router = useRouter();
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check token expiration every minute
  useEffect(() => {
    if (!user) return;

    const checkExpiration = () => {
      const token = getAuthToken();
      if (!token) return;

      const secondsToExpiry = getTokenTimeToExpiry(token);
      if (secondsToExpiry === null) return;

      setTimeToExpiry(secondsToExpiry);

      // Show warning if token expires within threshold
      const minutesToExpiry = secondsToExpiry / 60;
      setShowWarning(minutesToExpiry <= warningThresholdMinutes && minutesToExpiry > 0);
    };

    // Check immediately
    checkExpiration();

    // Check every minute
    const interval = setInterval(checkExpiration, 60000);

    return () => clearInterval(interval);
  }, [user, warningThresholdMinutes]);

  // Handle session refresh
  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    try {
      await checkAuth();
      setShowWarning(false);
    } catch (error) {
      authLogger.error('Failed to refresh session:', error);
      // If refresh fails, redirect to login
      logout();
      router.push('/login');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!showWarning || !timeToExpiry) {
    return null;
  }

  const timeRemaining = formatTimeToExpiry(timeToExpiry);
  const isExpiringSoon = timeToExpiry <= 300; // 5 minutes

  return (
    <Card className={`border-amber-500/50 bg-amber-500/10 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className={`h-5 w-5 mt-0.5 ${
            isExpiringSoon ? 'text-red-400' : 'text-amber-400'
          }`} />
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <h4 className="text-sm font-semibold text-white">
                Session Expiring Soon
              </h4>
            </div>
            
            <p className="text-sm text-slate-300">
              Your session will expire in{' '}
              <span className={`font-medium ${
                isExpiringSoon ? 'text-red-400' : 'text-amber-400'
              }`}>
                {timeRemaining}
              </span>
              . Please refresh your session to continue.
            </p>

            <div className="flex space-x-2 pt-2">
              <Button
                onClick={handleRefreshSession}
                disabled={isRefreshing}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh Session
                  </>
                )}
              </Button>

              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Hook to get token expiration status
 */
export function useTokenExpiration(warningThresholdMinutes: number = 30) {
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const checkExpiration = () => {
      const token = getAuthToken();
      if (!token) {
        setTimeToExpiry(null);
        setIsExpiringSoon(false);
        setIsExpired(true);
        return;
      }

      const secondsToExpiry = getTokenTimeToExpiry(token);
      if (secondsToExpiry === null) {
        setTimeToExpiry(null);
        setIsExpiringSoon(false);
        setIsExpired(true);
        return;
      }

      setTimeToExpiry(secondsToExpiry);
      setIsExpired(secondsToExpiry <= 0);
      setIsExpiringSoon(secondsToExpiry <= warningThresholdMinutes * 60 && secondsToExpiry > 0);
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 60000);

    return () => clearInterval(interval);
  }, [warningThresholdMinutes]);

  return {
    timeToExpiry,
    isExpiringSoon,
    isExpired,
    timeRemaining: timeToExpiry ? formatTimeToExpiry(timeToExpiry) : null,
  };
}
