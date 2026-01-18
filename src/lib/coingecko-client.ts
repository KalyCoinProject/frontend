import { subgraphLogger } from '@/lib/logger';
import { Token } from '@/config/dex/types';

// CoinGecko API configuration
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const RATE_LIMIT_DELAY = 1000; // 1 second between requests for free tier

// Cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();

// Rate limiting queue
let lastRequestTime = 0;

/**
 * Rate-limited fetch with caching
 */
async function rateLimitedFetch(url: string): Promise<any> {
  const cacheKey = url;
  const cached = cache.get(cacheKey);
  
  // Return cached data if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    subgraphLogger.debug('🎯 CoinGecko cache hit:', url);
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    const delay = RATE_LIMIT_DELAY - timeSinceLastRequest;
    subgraphLogger.debug(`⏳ CoinGecko rate limit delay: ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  try {
    subgraphLogger.debug('🌐 CoinGecko API call:', url);
    lastRequestTime = Date.now();
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Cache the response
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    subgraphLogger.error('❌ CoinGecko API error:', error);
    throw error;
  }
}

/**
 * Token to CoinGecko ID mapping
 * Maps popular tokens to their CoinGecko coin IDs
 */
const TOKEN_TO_COINGECKO_ID: Record<string, Record<string, string>> = {
  // BSC (Chain ID 56)
  '56': {
    // Native and wrapped tokens
    'BNB': 'binancecoin',
    'WBNB': 'wbnb',
    
    // Stablecoins
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'BUSD': 'binance-usd',
    'DAI': 'dai',
    
    // Major tokens
    'BTCB': 'bitcoin',
    'ETH': 'ethereum',
    'WETH': 'weth',
    'CAKE': 'pancakeswap-token',
    'ADA': 'cardano',
    'DOT': 'polkadot',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
  },
  
  // Arbitrum (Chain ID 42161)
  '42161': {
    // Native and wrapped tokens
    'ETH': 'ethereum',
    'WETH': 'weth',
    
    // Stablecoins
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'DAI': 'dai',
    'FRAX': 'frax',
    
    // Major tokens
    'WBTC': 'wrapped-bitcoin',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'ARB': 'arbitrum',
    'MAGIC': 'magic',
    'DPX': 'dopex',
    'RDNT': 'radiant-capital',
    'CRV': 'curve-dao-token',
  }
};

/**
 * Get CoinGecko coin ID for a token
 * First checks if token has coingeckoId property, then falls back to hardcoded mapping
 */
function getTokenCoinGeckoId(token: Token): string | null {
  // First priority: use coingeckoId from token (from CoinGecko exchange API)
  if ('coingeckoId' in token && token.coingeckoId) {
    subgraphLogger.debug(`🎯 Using token coingeckoId: ${token.symbol} -> ${token.coingeckoId}`);
    return token.coingeckoId;
  }

  // Fallback: use hardcoded mapping
  const chainMapping = TOKEN_TO_COINGECKO_ID[token.chainId.toString()];
  if (!chainMapping) {
    subgraphLogger.warn(`⚠️ No CoinGecko mapping for chain ${token.chainId}`);
    return null;
  }

  const coinId = chainMapping[token.symbol];
  if (!coinId) {
    subgraphLogger.warn(`⚠️ No CoinGecko ID for token ${token.symbol} on chain ${token.chainId}`);
    return null;
  }

  return coinId;
}

/**
 * Get pair CoinGecko IDs for two tokens
 * Returns the base token ID (the one we'll get price data for)
 */
function getPairCoinGeckoIds(tokenA: Token, tokenB: Token): { baseId: string; quoteId: string } | null {
  const tokenAId = getTokenCoinGeckoId(tokenA);
  const tokenBId = getTokenCoinGeckoId(tokenB);

  if (!tokenAId || !tokenBId) {
    return null;
  }

  // Prioritize non-stablecoin as base token for better price data
  const stablecoins = ['tether', 'usd-coin', 'dai', 'binance-usd', 'frax'];
  
  if (stablecoins.includes(tokenBId) && !stablecoins.includes(tokenAId)) {
    return { baseId: tokenAId, quoteId: tokenBId };
  } else if (stablecoins.includes(tokenAId) && !stablecoins.includes(tokenBId)) {
    return { baseId: tokenBId, quoteId: tokenAId };
  } else {
    // Default to tokenA as base
    return { baseId: tokenAId, quoteId: tokenBId };
  }
}

/**
 * Fetch OHLC data from CoinGecko
 */
export async function getCoinGeckoOHLC(
  tokenA: Token,
  tokenB: Token,
  days: number = 7
): Promise<any[]> {
  try {
    const pairIds = getPairCoinGeckoIds(tokenA, tokenB);
    if (!pairIds) {
      subgraphLogger.warn(`⚠️ Cannot get CoinGecko IDs for pair ${tokenA.symbol}/${tokenB.symbol}`);
      return [];
    }

    const url = `${COINGECKO_API_BASE}/coins/${pairIds.baseId}/ohlc?vs_currency=usd&days=${days}`;
    const data = await rateLimitedFetch(url);

    if (!Array.isArray(data)) {
      subgraphLogger.warn('⚠️ CoinGecko OHLC data is not an array:', data);
      return [];
    }

    subgraphLogger.debug(`✅ CoinGecko OHLC data fetched for ${tokenA.symbol}/${tokenB.symbol}:`, {
      baseToken: pairIds.baseId,
      dataPoints: data.length,
      days
    });

    return data;
  } catch (error) {
    subgraphLogger.error(`❌ Error fetching CoinGecko OHLC for ${tokenA.symbol}/${tokenB.symbol}:`, error);
    return [];
  }
}

/**
 * Convert CoinGecko OHLC data to our chart format
 */
export function convertCoinGeckoToChartData(ohlcData: any[]): any[] {
  if (!Array.isArray(ohlcData)) {
    return [];
  }

  return ohlcData.map((item: any[]) => {
    if (!Array.isArray(item) || item.length < 5) {
      return null;
    }

    const [timestamp, open, high, low, close] = item;
    
    return {
      time: Math.floor(timestamp / 1000), // Convert to seconds
      open: parseFloat(open.toString()),
      high: parseFloat(high.toString()),
      low: parseFloat(low.toString()),
      close: parseFloat(close.toString()),
      volume: 0, // CoinGecko OHLC doesn't include volume
    };
  }).filter(Boolean);
}

/**
 * Get current token price from CoinGecko
 */
export async function getCoinGeckoPrice(token: Token): Promise<number | null> {
  try {
    const coinId = getTokenCoinGeckoId(token);
    if (!coinId) {
      return null;
    }

    const url = `${COINGECKO_API_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const data = await rateLimitedFetch(url);

    const price = data[coinId]?.usd;
    return price ? parseFloat(price.toString()) : null;
  } catch (error) {
    subgraphLogger.error(`❌ Error fetching CoinGecko price for ${token.symbol}:`, error);
    return null;
  }
}

/**
 * Check if a chain should use CoinGecko API
 */
export function shouldUseCoinGecko(chainId: number): boolean {
  return chainId === 56 || chainId === 42161; // BSC or Arbitrum
}

/**
 * Check if tokens are supported by CoinGecko
 */
export function areTokensSupportedByCoinGecko(tokenA: Token, tokenB: Token): boolean {
  return getTokenCoinGeckoId(tokenA) !== null && getTokenCoinGeckoId(tokenB) !== null;
}
