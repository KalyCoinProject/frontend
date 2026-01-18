import { swapLogger } from '@/lib/logger';
// Multichain token balance hook
// This hook provides token balances for any supported chain

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { getContract, formatUnits } from 'viem';
import { Token } from '@/config/dex/types';
import { ERC20_ABI } from '@/config/abis';

interface TokenBalance {
  address: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  symbol: string;
}

interface UseMultichainTokenBalanceReturn {
  balances: Record<string, TokenBalance>;
  getBalance: (tokenAddress: string) => string;
  getFormattedBalance: (tokenAddress: string) => string;
  isLoading: boolean;
  error: string | null;
  refreshBalances: () => Promise<void>;
}

export function useMultichainTokenBalance(
  tokens: Token[],
  enabled: boolean = true
): UseMultichainTokenBalanceReturn {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter tokens for current chain - memoized to prevent unnecessary re-renders
  const chainTokens = useMemo(() =>
    tokens.filter(token => token.chainId === chainId),
    [tokens, chainId]
  );

  const fetchTokenBalance = useCallback(async (token: Token): Promise<TokenBalance | null> => {
    if (!address || !publicClient || !isConnected) {
      return null;
    }

    try {
      let balance: bigint;

      if (token.isNative) {
        // Get native token balance
        balance = await publicClient.getBalance({ address: address as `0x${string}` });
      } else {
        // Get ERC20 token balance
        const tokenContract = getContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          client: publicClient,
        });

        balance = await tokenContract.read.balanceOf([address as `0x${string}`]) as bigint;
      }

      const formattedBalance = formatUnits(balance, token.decimals);

      return {
        address: token.address,
        balance: balance.toString(),
        formattedBalance,
        decimals: token.decimals,
        symbol: token.symbol,
      };
    } catch (error) {
      swapLogger.error(`Error fetching balance for ${token.symbol}:`, error);
      return null;
    }
  }, [address, publicClient, isConnected]);

  const fetchAllBalances = useCallback(async () => {
    if (!enabled || !address || !isConnected || chainTokens.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balancePromises = chainTokens.map(token => fetchTokenBalance(token));
      const balanceResults = await Promise.all(balancePromises);

      const newBalances: Record<string, TokenBalance> = {};
      
      balanceResults.forEach((balance, index) => {
        if (balance) {
          const token = chainTokens[index];
          newBalances[token.address.toLowerCase()] = balance;
        }
      });

      setBalances(newBalances);
    } catch (error) {
      swapLogger.error('Error fetching token balances:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch balances');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, address, isConnected, chainTokens, fetchTokenBalance]);

  // Fetch balances when dependencies change
  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  // Refresh balances periodically
  useEffect(() => {
    if (!enabled || !address || !isConnected) {
      return;
    }

    const interval = setInterval(() => {
      fetchAllBalances();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [enabled, address, isConnected, fetchAllBalances]);

  const getBalance = useCallback((tokenAddress: string): string => {
    const balance = balances[tokenAddress.toLowerCase()];
    return balance?.balance || '0';
  }, [balances]);

  const getFormattedBalance = useCallback((tokenAddress: string): string => {
    const balance = balances[tokenAddress.toLowerCase()];
    if (!balance) return '0';

    // Format with appropriate decimal places
    const num = parseFloat(balance.formattedBalance);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    if (num < 1000000) return num.toFixed(2);
    
    // For large numbers, use compact notation
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    
    return num.toFixed(2);
  }, [balances]);

  const refreshBalances = useCallback(async () => {
    await fetchAllBalances();
  }, [fetchAllBalances]);

  return {
    balances,
    getBalance,
    getFormattedBalance,
    isLoading,
    error,
    refreshBalances,
  };
}

// Helper hook for single token balance
export function useTokenBalance(token: Token | null, enabled: boolean = true) {
  const tokens = token ? [token] : [];
  const result = useMultichainTokenBalance(tokens, enabled && !!token);

  return {
    balance: token ? result.getBalance(token.address) : '0',
    formattedBalance: token ? result.getFormattedBalance(token.address) : '0',
    isLoading: result.isLoading,
    error: result.error,
    refreshBalance: result.refreshBalances,
  };
}

// Helper hook for native token balance
export function useNativeTokenBalance(chainId: number | undefined, enabled: boolean = true) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const currentChainId = useChainId();

  const [balance, setBalance] = useState<string>('0');
  const [formattedBalance, setFormattedBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNativeBalance = useCallback(async () => {
    if (!enabled || !address || !isConnected || !publicClient || chainId !== currentChainId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balance = await publicClient.getBalance({ address: address as `0x${string}` });
      const formatted = formatUnits(balance, 18); // Most native tokens have 18 decimals

      setBalance(balance.toString());
      setFormattedBalance(formatted);
    } catch (error) {
      swapLogger.error('Error fetching native balance:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch native balance');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, address, isConnected, publicClient, chainId, currentChainId]);

  useEffect(() => {
    fetchNativeBalance();
  }, [fetchNativeBalance]);

  return {
    balance,
    formattedBalance,
    isLoading,
    error,
    refreshBalance: fetchNativeBalance,
  };
}
