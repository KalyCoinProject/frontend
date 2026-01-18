'use client';

import { CHAIN_IDS } from '@/config/chains';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useMemo } from 'react';
import { getPairAddress } from '@/utils/priceImpact';
import {
  isChainSupported as isGeckoTerminalSupported,
  findPoolAddress,
  getGeckoTerminalOHLC,
  convertGeckoTerminalToChartData,
  getPoolInfo
} from '@/lib/geckoterminal-client';
import { getPairHourData, getPairData } from '@/lib/subgraph-client';
import { Token } from '@/config/dex/types';
import { chartLogger as logger } from '@/lib/logger';
import { calculatePriceFromReservesRaw } from '@/utils/price';
import { getEffectiveAddress } from '@/utils/tokens';
import { isStablecoinAddress } from '@/config/contracts';

// Re-export types for convenience
export interface PricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Wrapped token addresses for native token matching
const WRAPPED_ADDRESSES = {
  WBNB: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // BSC
  WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // Arbitrum
  WKLC: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', // KalyChain
} as const;

const NATIVE_ADDR = '0x0000000000000000000000000000000000000000';

// Normalize token pair order (stablecoins always as quote token)
// IMPORTANT: Uses ADDRESS matching, not symbol matching (symbols are not unique)
function normalizeTokenPair(tokenA: Token | null, tokenB: Token | null): [Token | null, Token | null] {
  if (!tokenA || !tokenB) return [tokenA, tokenB];

  // Check stablecoin status by ADDRESS (not symbol)
  const addrA = getEffectiveAddress(tokenA).toLowerCase();
  const addrB = getEffectiveAddress(tokenB).toLowerCase();
  const isTokenAStable = isStablecoinAddress(addrA);
  const isTokenBStable = isStablecoinAddress(addrB);

  if (isTokenAStable && !isTokenBStable) {
    return [tokenB, tokenA];
  }
  if (isTokenBStable && !isTokenAStable) {
    return [tokenA, tokenB];
  }

  return addrA < addrB ? [tokenA, tokenB] : [tokenB, tokenA];
}

// Check if addresses match (considering native/wrapped equivalence)
function addressMatches(userAddr: string, poolAddr: string): boolean {
  if (userAddr === poolAddr) return true;
  
  const wrappedTokens = Object.values(WRAPPED_ADDRESSES).map(a => a.toLowerCase());
  if (userAddr === NATIVE_ADDR && wrappedTokens.includes(poolAddr.toLowerCase())) {
    return true;
  }
  if (poolAddr === NATIVE_ADDR && wrappedTokens.includes(userAddr.toLowerCase())) {
    return true;
  }
  return false;
}

interface UseChartDataOptions {
  tokenA: Token | null;
  tokenB: Token | null;
  enabled?: boolean;
  refetchInterval?: number;
}

interface UseChartDataResult {
  priceData: PricePoint[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  pairAddress: string | null | undefined;
}

/**
 * Hook for fetching historical chart data (OHLCV) for a token pair.
 * Uses TanStack Query for caching and deduplication.
 * Supports both GeckoTerminal (external chains) and Subgraph (KalyChain).
 */
export function useChartData({ tokenA, tokenB, enabled = true, refetchInterval }: UseChartDataOptions): UseChartDataResult {
  const publicClient = usePublicClient();
  
  const hasValidTokens = Boolean(tokenA && tokenB && tokenA.address !== tokenB.address);
  const [normalizedTokenA, normalizedTokenB] = useMemo(
    () => normalizeTokenPair(tokenA, tokenB),
    [tokenA?.address, tokenA?.symbol, tokenB?.address, tokenB?.symbol]
  );

  // Query for pair address
  const pairAddressQuery = useQuery({
    queryKey: ['pairAddress', normalizedTokenA?.address, normalizedTokenB?.address, normalizedTokenA?.chainId],
    queryFn: async () => {
      if (!publicClient || !normalizedTokenA || !normalizedTokenB) return null;
      return getPairAddress(publicClient, normalizedTokenA, normalizedTokenB);
    },
    enabled: enabled && hasValidTokens && !!publicClient,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Main chart data query
  const chartQuery = useQuery<PricePoint[], Error>({
    queryKey: ['chartData', normalizedTokenA?.address, normalizedTokenB?.address, normalizedTokenA?.chainId, pairAddressQuery.data],
    queryFn: async (): Promise<PricePoint[]> => {
      const chainId = normalizedTokenA?.chainId || normalizedTokenB?.chainId || CHAIN_IDS.KALYCHAIN;
      const pairAddress = pairAddressQuery.data;

      logger.debug('Fetching chart data', { chainId, normalizedTokenA: normalizedTokenA?.symbol, normalizedTokenB: normalizedTokenB?.symbol });

      // Route to GeckoTerminal for external chains
      if (isGeckoTerminalSupported(chainId)) {
        return fetchGeckoTerminalData(chainId, normalizedTokenA!, normalizedTokenB!, tokenA!, tokenB!, pairAddress ?? null);
      }

      // Use subgraph for KalyChain
      return fetchSubgraphData(chainId, normalizedTokenA!, normalizedTokenB!, pairAddress ?? null);
    },
    enabled: enabled && hasValidTokens && (!!pairAddressQuery.data || Boolean(normalizedTokenA?.chainId && isGeckoTerminalSupported(normalizedTokenA.chainId))),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval,
  });

  // Wrap refetch to match MouseEventHandler signature
  const handleRefetch = () => {
    chartQuery.refetch();
  };

  return {
    priceData: (chartQuery.data as PricePoint[] | undefined) ?? [],
    isLoading: chartQuery.isLoading || pairAddressQuery.isLoading,
    error: chartQuery.error?.message ?? pairAddressQuery.error?.message ?? null,
    refetch: handleRefetch,
    pairAddress: pairAddressQuery.data ?? null,
  };
}

// GeckoTerminal data fetcher for external chains (BSC, Arbitrum, etc.)
async function fetchGeckoTerminalData(
  chainId: number,
  normalizedTokenA: Token,
  normalizedTokenB: Token,
  tokenA: Token,
  tokenB: Token,
  pairAddress: string | null
): Promise<PricePoint[]> {
  logger.debug('Using GeckoTerminal API for chain:', chainId);

  let poolAddr = pairAddress;
  if (!poolAddr) {
    poolAddr = await findPoolAddress(chainId, normalizedTokenA, normalizedTokenB);
    if (!poolAddr) {
      throw new Error(`No liquidity pool found for ${tokenA.symbol}/${tokenB.symbol}`);
    }
  }

  const poolInfo = await getPoolInfo(chainId, poolAddr);
  if (!poolInfo) {
    throw new Error(`Could not fetch pool information for ${tokenA.symbol}/${tokenB.symbol}`);
  }

  const ohlcvList = await getGeckoTerminalOHLC(chainId, poolAddr, 'hour', 1, 168);
  if (ohlcvList.length === 0) {
    throw new Error(`Chart data not available for ${tokenA.symbol}/${tokenB.symbol}`);
  }

  // Determine if we need to invert prices
  const userTokenAAddr = tokenA.address.toLowerCase();
  const poolBaseToken = poolInfo.relationships?.base_token?.data?.id?.split('_')[1]?.toLowerCase();
  const poolQuoteToken = poolInfo.relationships?.quote_token?.data?.id?.split('_')[1]?.toLowerCase();

  if (!poolBaseToken || !poolQuoteToken) {
    throw new Error('Could not extract token information from pool data');
  }

  const isTokenAQuote = addressMatches(userTokenAAddr, poolQuoteToken);
  const isTokenABase = addressMatches(userTokenAAddr, poolBaseToken);
  const isTokenBQuote = addressMatches(tokenB.address.toLowerCase(), poolQuoteToken);
  const shouldInvert = isTokenAQuote || (isTokenABase && !isTokenBQuote);

  logger.debug('GeckoTerminal price orientation:', { shouldInvert, isTokenABase, isTokenAQuote });

  return convertGeckoTerminalToChartData(ohlcvList, shouldInvert);
}

// Subgraph data fetcher for KalyChain
async function fetchSubgraphData(
  chainId: number,
  normalizedTokenA: Token,
  normalizedTokenB: Token,
  pairAddress: string | null
): Promise<PricePoint[]> {
  logger.debug('Using subgraph for KalyChain');

  if (!pairAddress) {
    throw new Error('No liquidity pool exists for this token pair');
  }

  const [hourData, pairData] = await Promise.all([
    getPairHourData(pairAddress.toLowerCase(), 168, 0, chainId),
    getPairData(pairAddress.toLowerCase(), chainId)
  ]);

  if (!hourData || !pairData || hourData.length === 0) {
    throw new Error('Chart data not available - pair not indexed in subgraph yet');
  }

  const pairInfo = pairData;

  // Convert hourly data to OHLCV format
  const historicalData: PricePoint[] = hourData
    .map((hour: any) => {
      const reserve0 = parseFloat(hour.reserve0 || '0');
      const reserve1 = parseFloat(hour.reserve1 || '0');
      const volume = parseFloat(hour.hourlyVolumeUSD || '0');

      if (reserve0 <= 0 || reserve1 <= 0) return null;

      // Use centralized price calculation utility
      const tokenAAddress = getEffectiveAddress(normalizedTokenA);
      const price = calculatePriceFromReservesRaw(tokenAAddress, {
        token0: { id: pairInfo?.token0?.id || '' },
        token1: { id: pairInfo?.token1?.id || '' },
        reserve0: hour.reserve0,
        reserve1: hour.reserve1,
      });

      return {
        time: parseInt(hour.hourStartUnix),
        open: price,
        high: price * 1.005,
        low: price * 0.995,
        close: price,
        volume
      };
    })
    .filter((point: PricePoint | null): point is PricePoint => point !== null && point.close > 0)
    .sort((a: PricePoint, b: PricePoint) => a.time - b.time);

  // Deduplicate by timestamp
  const deduplicatedData = Array.from(
    historicalData.reduce((map, point) => {
      map.set(point.time, point);
      return map;
    }, new Map<number, PricePoint>()).values()
  );

  logger.debug(`Processed ${deduplicatedData.length} historical price points from subgraph`);
  return deduplicatedData;
}

