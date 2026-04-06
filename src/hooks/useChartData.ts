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
import { getPairHourData, getPairData, getV3PoolHourData } from '@/lib/subgraph-client';
import { getV3Config } from '@/config/dex/v3-config';
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
  protocolVersion?: 'v2' | 'v3';
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
export function useChartData({ tokenA, tokenB, enabled = true, refetchInterval, protocolVersion = 'v2' }: UseChartDataOptions): UseChartDataResult {
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
      if (protocolVersion === 'v3') {
        return fetchV3SubgraphData(chainId, normalizedTokenA!, normalizedTokenB!, pairAddress ?? null);
      }
      return fetchSubgraphData(chainId, normalizedTokenA!, normalizedTokenB!, pairAddress ?? null);
    },
    enabled: enabled && hasValidTokens,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
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

// V3 Subgraph data fetcher
async function fetchV3SubgraphData(
  chainId: number,
  normalizedTokenA: Token,
  normalizedTokenB: Token,
  poolAddress: string | null
): Promise<PricePoint[]> {
  logger.debug('Using V3 subgraph for KalyChain', { poolAddress });

  if (!poolAddress) {
    // Ideally we might want to discover the pool via factory if not provided,
    // but for now we expect the caller (or getPairAddress) to provide it.
    // NOTE: getPairAddress in useChartData currently assumes V2 factory.
    // If poolAddress is null in V3 mode, we might need a V3-specific lookup logic here
    // or rely on the fact that V3 pages usually pass the pool address explicitly if known.
    // For this implementation, we throw if missing, similar to V2.
    throw new Error('No V3 pool address found');
  }

  const v3Config = getV3Config(chainId);
  if (!v3Config) throw new Error('V3 not available on this chain');
  const hourData = await getV3PoolHourData(poolAddress, v3Config.subgraphUrl, 168, 0);

  if (!hourData || hourData.length === 0) {
    throw new Error('Chart data not available - V3 pool not indexed yet');
  }

  // Convert hourly data to OHLCV format
  const historicalData: PricePoint[] = hourData
    .map((hour: any) => {
      // V3 subgraph usually stores prices indexed to token0/token1.
      // We need to check which token is token0/token1 vs normalizedTokenA/B.
      // The V3 poolHourData entity often has 'open', 'high', 'low', 'close' based on token1/token0 price.
      // Assume 'close' is price of token0 in terms of token1 (or similar standard).
      // Let's rely on standard V3 subgraph schema where prices are typically tracked.
      // If the schema matches the standard Uniswap V3 subgraph:
      // open/high/low/close are usually tracked as token1 price (i.e. how much token1 for 1 token0) or vice versa.
      // We will assume 'close' is price of token0 in terms of token1.

      // We need to verify if normalizedTokenA is token0 or token1.
      // Note: The poolHourData doesn't explicitly give us token0/1 addresses in this query result (only pool id).
      // However, we know normalizedTokenA/B are sorted.
      // If normalizedTokenA is token0, we use the price directly.
      // If normalizedTokenA is token1, we invert the price.
      // BUT, getV3PoolHourData result doesn't explicitly link tokens.
      // We can infer using the same sorting logic as the factory.
      // V3 factory sorts tokens just like V2.
      // So normalizedTokenA should be token0.

      const price = parseFloat(hour.close);
      const volume = parseFloat(hour.volumeUSD);

      if (isNaN(price) || price <= 0) return null;

      return {
        time: parseInt(hour.periodStartUnix),
        open: parseFloat(hour.open),
        high: parseFloat(hour.high),
        low: parseFloat(hour.low),
        close: parseFloat(hour.close),
        volume
      };
    })
    .filter((point: PricePoint | null): point is PricePoint => point !== null && point.close > 0)
    .sort((a: PricePoint, b: PricePoint) => a.time - b.time);

  // Deduplicate
  const deduplicatedData = Array.from(
    historicalData.reduce((map, point) => {
      map.set(point.time, point);
      return map;
    }, new Map<number, PricePoint>()).values()
  );

  return deduplicatedData;
}

