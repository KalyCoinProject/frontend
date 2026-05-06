'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePublicClient, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { getContract, formatUnits } from 'viem';
import { getContractAddress, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '@/config/abis';
import { useUserPositions } from './useUserPositions';
import { poolLogger } from '@/lib/logger';

// Blacklisted pool addresses (duplicate/test pools to exclude)
const BLACKLISTED_POOLS = [
  '0xf5d0e9ff1d439d478f13b167e8260a1f98f2b793',
  '0xd8aacb9a2084f73c53c4edb5633bfa01124669f6',
  '0x37ea64bb4d58b6513c80befa5dc777080ad62eb9',
  '0xb87d4bb205865716f556ba032eaeb41d7f096830',
  '0x83210c8c37913ff3e4a713767be416415db6e434',
].map(addr => addr.toLowerCase());

export interface PoolData {
  id: string;
  address: string;
  token0: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  // Enhanced subgraph data
  reserveUSD?: string;
  volumeUSD?: string;
  txCount?: string;
  token0Price?: string;
  token1Price?: string;
  // User position data
  userHasPosition?: boolean;
  userLpBalance?: string;
  userLpBalanceRaw?: bigint;
  userPoolShare?: string;
  userToken0Amount?: string;
  userToken1Amount?: string;
}

export interface PoolDiscoveryState {
  searchTerm: string;
  sortBy: 'liquidity' | 'name';
  sortOrder: 'asc' | 'desc';
}

// Fetch pools from subgraph - this is the main data fetching function
async function fetchPoolsFromSubgraph(): Promise<PoolData[]> {
  poolLogger.debug('📊 Fetching pools directly from DEX subgraph...');

  // Direct subgraph call - no backend proxy needed!
  const { getPairsData } = await import('@/lib/subgraph-client');
  const subgraphPairs = await getPairsData(100, 'reserveUSD', 'desc');

  if (!subgraphPairs || subgraphPairs.length === 0) {
    throw new Error('No pools available from subgraph');
  }

  poolLogger.debug('🔍 Blacklist:', BLACKLISTED_POOLS);

  // Filter out blacklisted pools
  const filteredPairs = subgraphPairs.filter((pair: any) => {
    const pairId = pair.id.toLowerCase();
    const isBlacklisted = BLACKLISTED_POOLS.includes(pairId);
    if (isBlacklisted) {
      poolLogger.debug(`❌ Filtering out blacklisted pool: ${pairId}`);
    }
    return !isBlacklisted;
  });

  poolLogger.debug(`🔍 Filtered ${subgraphPairs.length - filteredPairs.length} blacklisted pools out of ${subgraphPairs.length} total`);

  // Transform subgraph data to PoolData format
  const pools: PoolData[] = filteredPairs.map((pair: any) => ({
    id: pair.id,
    address: pair.id,
    token0: {
      address: pair.token0.id,
      symbol: pair.token0.symbol,
      name: pair.token0.name || pair.token0.symbol,
      decimals: parseInt(pair.token0.decimals)
    },
    token1: {
      address: pair.token1.id,
      symbol: pair.token1.symbol,
      name: pair.token1.name || pair.token1.symbol,
      decimals: parseInt(pair.token1.decimals)
    },
    reserve0: pair.reserve0,
    reserve1: pair.reserve1,
    totalSupply: pair.totalSupply,
    // Enhanced subgraph data
    reserveUSD: pair.reserveUSD,
    volumeUSD: pair.volumeUSD,
    txCount: pair.txCount,
    token0Price: pair.token0Price,
    token1Price: pair.token1Price
  }));

  poolLogger.debug(`✅ Successfully loaded ${pools.length} pools from direct subgraph`);
  return pools;
}

export function usePoolDiscovery() {
  // UI state for search and sorting
  const [uiState, setUiState] = useState<PoolDiscoveryState>({
    searchTerm: '',
    sortBy: 'liquidity',
    sortOrder: 'desc'
  });

  // Handle case where Wagmi providers aren't loaded yet
  let publicClient, address;
  try {
    publicClient = usePublicClient();
    const account = useAccount();
    address = account.address;
  } catch (error) {
    // Wagmi providers not available yet
    publicClient = null;
    address = undefined;
  }

  // Use TanStack Query for data fetching with automatic caching and refetching
  const {
    data: pools = [],
    isLoading: loading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['poolDiscovery'],
    queryFn: fetchPoolsFromSubgraph,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const error = queryError ? (queryError as Error).message : null;

  // Get pool addresses for user position tracking (memoized to prevent loops)
  const poolAddresses = useMemo(() => pools.map(pool => pool.address), [pools]);
  const { positions, getPosition } = useUserPositions(poolAddresses);

  // Filter and sort pools with user position data
  const filteredAndSortedPools = useCallback(() => {
    let filtered = pools.map(pool => {
      // Add user position data to each pool
      const userPosition = getPosition(pool.address);

      // Calculate user's token amounts if they have a position
      let userToken0Amount = '0';
      let userToken1Amount = '0';

      if (userPosition?.hasPosition && userPosition.lpTokenBalance && pool.totalSupply) {
        const userLpBalance = parseFloat(userPosition.lpTokenBalance);
        const totalSupply = parseFloat(pool.totalSupply);
        const reserve0 = parseFloat(pool.reserve0);
        const reserve1 = parseFloat(pool.reserve1);

        if (totalSupply > 0) {
          const userShare = userLpBalance / totalSupply;
          userToken0Amount = (reserve0 * userShare).toFixed(6);
          userToken1Amount = (reserve1 * userShare).toFixed(6);
        }
      }

      return {
        ...pool,
        userHasPosition: userPosition?.hasPosition || false,
        userLpBalance: userPosition?.lpTokenBalance || '0',
        userLpBalanceRaw: userPosition?.lpTokenBalanceRaw,
        userPoolShare: userPosition?.poolShare || '0',
        userToken0Amount,
        userToken1Amount
      };
    });

    // Apply search filter
    if (uiState.searchTerm) {
      const searchLower = uiState.searchTerm.toLowerCase();
      filtered = filtered.filter(pool =>
        pool.token0.symbol.toLowerCase().includes(searchLower) ||
        pool.token1.symbol.toLowerCase().includes(searchLower) ||
        pool.token0.name.toLowerCase().includes(searchLower) ||
        pool.token1.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      // Prioritize pools where user has positions
      if (a.userHasPosition && !b.userHasPosition) return -1;
      if (!a.userHasPosition && b.userHasPosition) return 1;

      let aValue: number | string, bValue: number | string;

      switch (uiState.sortBy) {
        case 'liquidity':
          // Sort by total supply as a proxy for liquidity
          aValue = parseFloat(a.totalSupply);
          bValue = parseFloat(b.totalSupply);
          break;
        case 'name':
          // Sort alphabetically by token pair name
          aValue = `${a.token0.symbol}/${a.token1.symbol}`;
          bValue = `${b.token0.symbol}/${b.token1.symbol}`;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return uiState.sortOrder === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        const numA = aValue as number;
        const numB = bValue as number;
        return uiState.sortOrder === 'asc' ? numA - numB : numB - numA;
      }
    });

    return filtered;
  }, [pools, uiState.searchTerm, uiState.sortBy, uiState.sortOrder, getPosition]);

  // Update search term
  const setSearchTerm = useCallback((term: string) => {
    setUiState(prev => ({ ...prev, searchTerm: term }));
  }, []);

  // Update sorting
  const setSorting = useCallback((sortBy: 'liquidity' | 'name', sortOrder: 'asc' | 'desc') => {
    setUiState(prev => ({ ...prev, sortBy, sortOrder }));
  }, []);

  return {
    pools: filteredAndSortedPools(),
    allPools: pools,
    loading,
    error,
    searchTerm: uiState.searchTerm,
    sortBy: uiState.sortBy,
    sortOrder: uiState.sortOrder,
    setSearchTerm,
    setSorting,
    refetch
  };
}
