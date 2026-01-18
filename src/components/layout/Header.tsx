'use client';

import { logger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { internalWalletUtils } from '@/connectors/internalWallet';

export default function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [forceRerender, setForceRerender] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token');
    setIsLoggedIn(!!token);
  }, []);

  // Listen to internal wallet state changes to force header re-render
  useEffect(() => {
    // Only set up event listeners on client side after hydration
    if (typeof window === 'undefined') return;

    const handleWalletChange = () => {
      // Force re-render by updating state
      setForceRerender(prev => prev + 1);
    };

    // Add a small delay to ensure internal wallet is initialized
    const timeoutId = setTimeout(() => {
      try {
        // Listen to internal wallet events
        internalWalletUtils.addEventListener('connect', handleWalletChange);
        internalWalletUtils.addEventListener('disconnect', handleWalletChange);
        internalWalletUtils.addEventListener('accountsChanged', handleWalletChange);
        internalWalletUtils.addEventListener('chainChanged', handleWalletChange);
      } catch (error) {
        logger.warn('Failed to set up internal wallet event listeners:', error);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      try {
        internalWalletUtils.removeEventListener('connect', handleWalletChange);
        internalWalletUtils.removeEventListener('disconnect', handleWalletChange);
        internalWalletUtils.removeEventListener('accountsChanged', handleWalletChange);
        internalWalletUtils.removeEventListener('chainChanged', handleWalletChange);
      } catch (error) {
        // Ignore cleanup errors
      }
    };
  }, []);

  const handleLogout = () => {
    // Import and use auth utilities for proper cleanup
    import('@/utils/auth').then(({ removeAuthToken }) => {
      removeAuthToken();
      setIsLoggedIn(false);
      window.location.href = '/';
    }).catch(() => {
      // Fallback to direct localStorage removal
      localStorage.removeItem('auth_token');
      setIsLoggedIn(false);
      window.location.href = '/';
    });
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b sticky top-0 z-40 shadow-lg" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img
                src="/icons/KalySwapLogo.png"
                alt="KalySwap Logo"
                className="h-8 w-8 mr-3"
              />
              <span
                className="text-xl md:text-2xl font-bold"
                style={{
                  background: 'linear-gradient(to right, #fbbf24, #d97706)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                KalySwap
              </span>
            </Link>

            <nav className="ml-10 hidden md:flex space-x-8">
              <Link
                href="/swaps"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/swaps'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/swaps' ? undefined : '#fef3c7' }}
              >
                Swap
              </Link>
              <Link
                href="/pools"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/pools'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/pools' ? undefined : '#fef3c7' }}
              >
                Pools
              </Link>
              <Link
                href="/farm"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/farm'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/farm' ? undefined : '#fef3c7' }}
              >
                Farm
              </Link>
              <Link
                href="/bridge"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/bridge'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/bridge' ? undefined : '#fef3c7' }}
              >
                Bridge
              </Link>
              <Link
                href="/stake"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/stake'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/stake' ? undefined : '#fef3c7' }}
              >
                Stake
              </Link>
              <Link
                href="/launchpad"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/launchpad'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/launchpad' ? undefined : '#fef3c7' }}
              >
                Launchpad
              </Link>
            </nav>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="text-slate-300 hover:text-white hover:bg-slate-800/50"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {/* Wallet Connection */}
            <ClientOnlyConnectWallet />

            {isLoggedIn ? (
              <>
                <Link href="/dashboard">
                  <Button variant="outline" size="sm" className="font-semibold border-white/30 text-white hover:text-white hover:border-white/50 hover:bg-white/10">
                    Dashboard
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="font-semibold text-white hover:text-white hover:bg-white/10"
                >
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="outline" size="sm" className="font-semibold border-white/30 text-white hover:text-white hover:border-white/50 hover:bg-white/10">
                    Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium shadow-lg hover:shadow-amber-500/25"
                  >
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900/95 backdrop-blur-sm border-b shadow-lg" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
          <div className="container mx-auto px-4 py-3">
            <nav className="flex flex-col space-y-3">
              <Link
                href="/swaps"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/swaps'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/swaps' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Swap
              </Link>
              <Link
                href="/pools"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/pools'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/pools' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Pools
              </Link>
              <Link
                href="/farm"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/farm'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/farm' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Farm
              </Link>
              <Link
                href="/bridge"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/bridge'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/bridge' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Bridge
              </Link>
              <Link
                href="/stake"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/stake'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/stake' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Stake
              </Link>
              <Link
                href="/launchpad"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/launchpad'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/launchpad' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Launchpad
              </Link>

              <div className="pt-3 border-t border-slate-700/50 flex flex-col space-y-3">
                {/* Mobile Wallet Connection */}
                <div className="pb-2">
                  <ClientOnlyConnectWallet className="w-full" />
                </div>

                {isLoggedIn ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="text-sm font-semibold text-white hover:text-white hover:bg-white/10 px-3 py-2 rounded-md transition-colors duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="text-sm font-semibold text-white hover:text-white hover:bg-white/10 px-3 py-2 rounded-md transition-colors duration-200 text-left"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-sm font-semibold text-white hover:text-white hover:bg-white/10 px-3 py-2 rounded-md transition-colors duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Login
                    </Link>
                    <Link
                      href="/signup"
                      className="text-sm font-semibold text-white bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 px-3 py-2 rounded-md transition-colors duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
