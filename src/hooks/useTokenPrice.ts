'use client';

import { useQuery } from '@tanstack/react-query';
import { priceLogger as logger } from '@/lib/logger';

// Known token addresses on KalyChain
const KALYCHAIN_TOKEN_ADDRESSES: Record<string, string> = {
  'KLC': '0x069255299bb729399f3cecabdc73d15d3d10a2a3', // WKLC
  'WKLC': '0x069255299bb729399f3cecabdc73d15d3d10a2a3',
  'USDT': '0x2ca775c77b922a51fcf3097f52bffdbc0250d99a',
  'KSWAP': '0xcc93b84ceed74dc28c746b7697d6fa477ffff65a',
  'DAI': '0x6e92cac380f7a7b86f4163fad0df2f277b16edc6',
  'CLISHA': '0x376e0ac0b55aa79f9b30aac8842e5e84ff06360c'
};

// Stablecoins always priced at $1
const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'KUSD'];

interface UseTokenPriceOptions {
  symbol: string;
  enabled?: boolean;
  refetchInterval?: number;
}

interface TokenPriceData {
  price: number | null;
  change24h: number | null;
}

/**
 * Hook for fetching the USD price of a single token.
 * Uses TanStack Query for caching and deduplication.
 */
export function useTokenPrice({ symbol, enabled = true, refetchInterval = 30000 }: UseTokenPriceOptions) {
  const query = useQuery({
    queryKey: ['tokenPrice', symbol],
    queryFn: () => fetchTokenPrice(symbol),
    enabled: enabled && !!symbol,
    staleTime: 15 * 1000, // 15 seconds
    refetchInterval,
  });

  return {
    price: query.data?.price ?? null,
    change24h: query.data?.change24h ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

async function fetchTokenPrice(symbol: string): Promise<TokenPriceData> {
  logger.debug('Fetching price for token:', symbol);

  // Stablecoins are always $1
  if (STABLECOINS.includes(symbol)) {
    return { price: 1.0, change24h: 0 };
  }

  const tokenAddress = KALYCHAIN_TOKEN_ADDRESSES[symbol];
  if (!tokenAddress) {
    logger.warn(`Unknown token ${symbol} - no address mapping`);
    return { price: 0, change24h: 0 };
  }

  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query GetTokenPrice($tokenId: String!) {
          token(id: $tokenId) {
            id
            symbol
            derivedKLC
            tradeVolumeUSD
          }
          pairs(where: {
            or: [
              { and: [{ token0: $tokenId }, { token1: "0x2ca775c77b922a51fcf3097f52bffdbc0250d99a" }] },
              { and: [{ token0: "0x2ca775c77b922a51fcf3097f52bffdbc0250d99a" }, { token1: $tokenId }] }
            ]
          }) {
            id
            token0 { id symbol }
            token1 { id symbol }
            reserve0
            reserve1
            token0Price
            token1Price
          }
        }
      `,
      variables: { tokenId: tokenAddress.toLowerCase() }
    })
  });

  if (!response.ok) {
    throw new Error('Failed to fetch token price');
  }

  const result = await response.json();
  logger.debug('Token price response:', result);

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  let calculatedPrice = 0;
  let change24h = 0;

  if (result.data?.pairs && result.data.pairs.length > 0) {
    const pair = result.data.pairs[0];
    const isToken0 = pair.token0.id.toLowerCase() === tokenAddress.toLowerCase();
    if (isToken0) {
      calculatedPrice = parseFloat(pair.reserve1) / parseFloat(pair.reserve0);
    } else {
      calculatedPrice = parseFloat(pair.reserve0) / parseFloat(pair.reserve1);
    }

    // Fetch yesterday's price from pairDayDatas for real 24h change
    try {
      const dayDataResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetPairDayData($pairId: ID!) {
              pairDayDatas(first: 2, orderBy: date, orderDirection: desc, where: { pair: $pairId }) {
                date
                reserve0
                reserve1
              }
            }
          `,
          variables: { pairId: pair.id }
        })
      });

      const dayDataResult = await dayDataResponse.json();
      const dayDatas = dayDataResult.data?.pairDayDatas;

      if (dayDatas && dayDatas.length >= 2) {
        const yesterday = dayDatas[1];
        const yesterdayPrice = isToken0
          ? parseFloat(yesterday.reserve1) / parseFloat(yesterday.reserve0)
          : parseFloat(yesterday.reserve0) / parseFloat(yesterday.reserve1);

        if (yesterdayPrice > 0) {
          change24h = ((calculatedPrice - yesterdayPrice) / yesterdayPrice) * 100;
        }
      }
    } catch (err) {
      logger.debug('Could not fetch 24h price change, using 0:', err);
    }
  }

  return {
    price: calculatedPrice,
    change24h,
  };
}

// Utility function to format price based on token and magnitude
export function formatTokenPrice(price: number, symbol: string): string {
  if (!price || price === 0 || !isFinite(price)) {
    return '0.0000';
  }

  if (STABLECOINS.includes(symbol)) {
    return price.toFixed(4);
  }

  if (['WBTC', 'BTC', 'ETH', 'WETH'].includes(symbol)) {
    return price.toFixed(2);
  }

  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  if (price >= 0.00000001) return price.toFixed(8);
  return price.toExponential(4);
}

// Utility function to format price change
export function formatPriceChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

