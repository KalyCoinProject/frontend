'use client';

import { useQuery } from '@tanstack/react-query';
import { getFactoryData, getPairsData, getKalyswapDayData } from '@/lib/subgraph-client';
import { priceLogger as logger } from '@/lib/logger';
import { MAINNET_CONTRACTS, isStablecoinAddress } from '@/config/contracts';

// Known token addresses for identification (NEVER use symbols)
const WKLC_ADDRESS = MAINNET_CONTRACTS.WKLC.toLowerCase();
const USDT_ADDRESS = MAINNET_CONTRACTS.USDT.toLowerCase();
const WKLC_USDT_PAIR_ADDRESS = '0x25fddaf836d12dc5e285823a644bb86e0b79c8e2';

// DEX Market Stats interface
export interface DexMarketStats {
  klcPrice: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  totalLiquidity: number | null;
}

interface UseDexStatsOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

/**
 * Hook for fetching DEX-wide market stats (TVL, volume, KLC price).
 * Uses TanStack Query for caching and automatic refetching.
 */
export function useDexStats({ enabled = true, refetchInterval = 30000 }: UseDexStatsOptions = {}) {
  const query = useQuery({
    queryKey: ['dexStats'],
    queryFn: fetchDexStats,
    enabled,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval,
  });

  return {
    klcPrice: query.data?.klcPrice ?? null,
    priceChange24h: query.data?.priceChange24h ?? null,
    volume24h: query.data?.volume24h ?? null,
    totalLiquidity: query.data?.totalLiquidity ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

async function fetchDexStats(): Promise<DexMarketStats> {
  logger.debug('Fetching DEX market stats from subgraph...');

  const [factoryData, pairsData, dayData] = await Promise.all([
    getFactoryData(),
    getPairsData(20, 'txCount', 'desc'),
    getKalyswapDayData(2, 0)
  ]);

  if (!factoryData || !pairsData) {
    throw new Error('Failed to fetch DEX stats from subgraph');
  }

  const factory = factoryData;
  const pairs = pairsData || [];
  const dayDatas = dayData || [];

  // Calculate KLC price from WKLC/USDT pairs
  // IMPORTANT: Use ADDRESS matching, not symbol matching
  // Symbols are not unique - anyone can create a token with any symbol
  let calculatedKlcPrice = 0;
  let totalLiquidityUsd = 0;

  if (pairs.length > 0) {
    // Find WKLC/USDT pair by known pair address first, then by token addresses
    let wklcUsdtPair = pairs.find((pair: any) =>
      pair.id.toLowerCase() === WKLC_USDT_PAIR_ADDRESS
    );

    if (!wklcUsdtPair) {
      // Fallback: find by token addresses (NOT symbols)
      wklcUsdtPair = pairs.find((pair: any) => {
        const token0Addr = pair.token0?.id?.toLowerCase();
        const token1Addr = pair.token1?.id?.toLowerCase();
        return (
          (token0Addr === WKLC_ADDRESS && token1Addr === USDT_ADDRESS) ||
          (token1Addr === WKLC_ADDRESS && token0Addr === USDT_ADDRESS)
        );
      });
    }

    if (wklcUsdtPair) {
      const reserve0 = parseFloat(wklcUsdtPair.reserve0);
      const reserve1 = parseFloat(wklcUsdtPair.reserve1);
      const token0Addr = wklcUsdtPair.token0?.id?.toLowerCase();

      // Use ADDRESS to determine which token is WKLC
      if (token0Addr === WKLC_ADDRESS) {
        calculatedKlcPrice = reserve1 / reserve0;
      } else {
        calculatedKlcPrice = reserve0 / reserve1;
      }

      logger.debug(`KLC price calculated: $${calculatedKlcPrice.toFixed(6)}`);
    }

    // Calculate total liquidity from pairs using ADDRESS matching
    totalLiquidityUsd = pairs.reduce((sum: number, pair: any) => {
      const reserve0 = parseFloat(pair.reserve0 || '0');
      const reserve1 = parseFloat(pair.reserve1 || '0');
      const token0Addr = pair.token0?.id?.toLowerCase();
      const token1Addr = pair.token1?.id?.toLowerCase();
      let pairLiquidity = 0;

      // Check if token0 or token1 is a stablecoin (by address)
      const isToken0Stable = isStablecoinAddress(token0Addr || '');
      const isToken1Stable = isStablecoinAddress(token1Addr || '');
      const isToken0Wklc = token0Addr === WKLC_ADDRESS;
      const isToken1Wklc = token1Addr === WKLC_ADDRESS;

      if (isToken0Stable) {
        // Token0 is stablecoin, count its reserve + WKLC value if present
        pairLiquidity = reserve0 + (isToken1Wklc ? reserve1 * calculatedKlcPrice : 0);
      } else if (isToken1Stable) {
        // Token1 is stablecoin, count its reserve + WKLC value if present
        pairLiquidity = reserve1 + (isToken0Wklc ? reserve0 * calculatedKlcPrice : 0);
      } else if (isToken0Wklc) {
        // No stablecoin, but token0 is WKLC
        pairLiquidity = reserve0 * calculatedKlcPrice;
      } else if (isToken1Wklc) {
        // No stablecoin, but token1 is WKLC
        pairLiquidity = reserve1 * calculatedKlcPrice;
      }

      return sum + pairLiquidity;
    }, 0);
  }

  // Calculate 24h volume and change
  let volume24h = 0;
  let priceChange24h = 2.5; // Default

  if (dayDatas.length >= 2) {
    const today = dayDatas[0];
    const yesterday = dayDatas[1];

    volume24h = parseFloat(today.dailyVolumeUSD || '0');

    if (yesterday.totalLiquidityUSD && today.totalLiquidityUSD) {
      const yesterdayLiquidity = parseFloat(yesterday.totalLiquidityUSD);
      const todayLiquidity = parseFloat(today.totalLiquidityUSD);
      priceChange24h = ((todayLiquidity - yesterdayLiquidity) / yesterdayLiquidity) * 100;
    }
  }

  // Use factory liquidity if available
  if (factory?.totalLiquidityUSD && parseFloat(factory.totalLiquidityUSD) > 0) {
    totalLiquidityUsd = parseFloat(factory.totalLiquidityUSD);
  }

  logger.debug('DEX stats updated:', {
    klcPrice: calculatedKlcPrice,
    totalLiquidity: totalLiquidityUsd,
    volume24h,
    priceChange24h
  });

  return {
    klcPrice: calculatedKlcPrice,
    priceChange24h,
    volume24h,
    totalLiquidity: totalLiquidityUsd,
  };
}

