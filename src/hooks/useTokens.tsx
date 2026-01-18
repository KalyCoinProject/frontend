'use client';

import { CHAIN_IDS } from '@/config/chains';

/**
 * @deprecated This hook is deprecated. Use `useTokenLists` from '@/hooks/useTokenLists' instead.
 * This hook uses hardcoded token lists. The newer useTokenLists fetches from the API.
 */

import { useState, useEffect } from 'react';
import { Token } from '@/config/dex/types';
import { logger, tokenLogger } from '@/lib/logger';

// Official KalyChain tokens from https://raw.githubusercontent.com/KalyCoinProject/tokenlists/main/kalyswap.tokenlist.json
const COMMON_TOKENS: Token[] = [
  // Add native KLC as first option
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x0000000000000000000000000000000000000000', // Native token
    decimals: 18,
    name: 'KalyCoin',
    symbol: 'KLC',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x069255299Bb729399f3CECaBdc73d15d3D10a2A3/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
    decimals: 18,
    name: 'Wrapped KalyCoin',
    symbol: 'wKLC',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x069255299Bb729399f3CECaBdc73d15d3D10a2A3/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a',
    decimals: 18,
    name: 'KalySwap Token',
    symbol: 'KSWAP',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9',
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6',
    decimals: 18,
    name: 'DAI Token',
    symbol: 'DAI',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455',
    decimals: 8,
    name: 'Wrapped BTC',
    symbol: 'WBTC',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0xfdbB253753dDE60b11211B169dC872AaE672879b',
    decimals: 18,
    name: 'Ether Token',
    symbol: 'ETH',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0xfdbB253753dDE60b11211B169dC872AaE672879b/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb',
    decimals: 18,
    name: 'Binance',
    symbol: 'BNB',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac',
    decimals: 18,
    name: 'Polygon Token',
    symbol: 'POL',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac/logo_24.png'
  },
  {
    chainId: CHAIN_IDS.KALYCHAIN,
    address: '0x376E0ac0B55aA79F9B30aAc8842e5E84fF06360C',
    decimals: 18,
    name: 'Clisha Coin',
    symbol: 'CLISHA',
    logoURI: 'https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/0x376E0ac0B55aA79F9B30aAc8842e5E84fF06360C/logo_24.png'
  }
];

export function useTokens() {
  const [tokens, setTokens] = useState<Token[]>(COMMON_TOKENS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTokensFromSubgraph();
  }, []);

  const fetchTokensFromSubgraph = async () => {
    setLoading(true);
    setError(null);

    try {
      logger.debug('Fetching tokens from DEX subgraph...');

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetTokens {
              tokens(
                first: 100
                orderBy: tradeVolumeUSD
                orderDirection: desc
                where: { tradeVolumeUSD_gt: "0" }
              ) {
                id
                symbol
                name
                decimals
                tradeVolumeUSD
                totalLiquidity
                derivedKLC
                txCount
              }
            }
          `
        })
      });

      if (response.ok) {
        const result = await response.json();
        logger.debug('Subgraph tokens response:', result);

        if (result.errors) {
          tokenLogger.error('GraphQL errors:', result.errors);
          throw new Error(result.errors[0].message);
        }

        if (result.data && result.data.tokens) {
          const subgraphTokens: Token[] = result.data.tokens.map((token: any) => ({
            chainId: CHAIN_IDS.KALYCHAIN,
            address: token.id,
            symbol: token.symbol,
            name: token.name,
            decimals: parseInt(token.decimals),
            logoURI: `https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/3888/${token.id}/logo_24.png`,
            // Enhanced subgraph data
            tradeVolumeUSD: token.tradeVolumeUSD,
            totalLiquidity: token.totalLiquidity,
            derivedKLC: token.derivedKLC,
            txCount: token.txCount,
            // Do not calculate price with hardcoded KLC value - requires real market data
            priceUSD: undefined // Price calculation requires real-time KLC price from market
          }));

          logger.debug(`Fetched ${subgraphTokens.length} tokens from subgraph`);

          // Merge with common tokens, prioritizing common tokens but adding subgraph data
          const mergedTokens = mergeTokenLists(COMMON_TOKENS, subgraphTokens);
          setTokens(mergedTokens);
        } else {
          tokenLogger.warn('No token data in subgraph response, using common tokens');
          setTokens(COMMON_TOKENS);
        }
      } else {
        tokenLogger.warn('Failed to fetch tokens from subgraph, using common tokens');
        setTokens(COMMON_TOKENS);
      }
    } catch (err) {
      tokenLogger.error('❌ Error fetching tokens from subgraph:', err);
      setError('Failed to load tokens from subgraph');
      // Keep using common tokens as fallback
      setTokens(COMMON_TOKENS);
    } finally {
      setLoading(false);
    }
  };

  const mergeTokenLists = (commonTokens: Token[], subgraphTokens: Token[]): Token[] => {
    const tokenMap = new Map<string, Token>();

    // Add common tokens first (higher priority for basic info)
    commonTokens.forEach(token => {
      tokenMap.set(token.address.toLowerCase(), token);
    });

    // Enhance common tokens with subgraph data and add new subgraph tokens
    subgraphTokens.forEach(token => {
      const key = token.address.toLowerCase();
      const existingToken = tokenMap.get(key);

      if (existingToken) {
        // Enhance existing common token with subgraph data
        tokenMap.set(key, {
          ...existingToken,
          tradeVolumeUSD: token.tradeVolumeUSD,
          totalLiquidity: token.totalLiquidity,
          derivedKLC: token.derivedKLC,
          txCount: token.txCount,
          priceUSD: token.priceUSD
        });
      } else {
        // Add new token from subgraph
        tokenMap.set(key, token);
      }
    });

    return Array.from(tokenMap.values());
  };



  const getTokenByAddress = (address: string): Token | undefined => {
    return tokens.find(token =>
      token.address.toLowerCase() === address.toLowerCase()
    );
  };

  const getTokenBySymbol = (symbol: string): Token | undefined => {
    return tokens.find(token =>
      token.symbol.toLowerCase() === symbol.toLowerCase()
    );
  };

  const searchTokens = (query: string): Token[] => {
    if (!query) return tokens;

    const queryLower = query.toLowerCase();
    return tokens.filter(token =>
      token.symbol.toLowerCase().includes(queryLower) ||
      token.name.toLowerCase().includes(queryLower) ||
      token.address.toLowerCase().includes(queryLower)
    );
  };

  return {
    tokens,
    loading,
    error,
    getTokenByAddress,
    getTokenBySymbol,
    searchTokens,
    refetch: fetchTokensFromSubgraph,
    // Additional utilities for enhanced token data
    getTokenWithMetadata: (address: string): Token | undefined => {
      const token = getTokenByAddress(address);
      return token;
    },
    getTopTokensByVolume: (limit: number = 10): Token[] => {
      return tokens
        .filter(token => token.tradeVolumeUSD && parseFloat(token.tradeVolumeUSD) > 0)
        .sort((a, b) => parseFloat(b.tradeVolumeUSD || '0') - parseFloat(a.tradeVolumeUSD || '0'))
        .slice(0, limit);
    },
    getTopTokensByLiquidity: (limit: number = 10): Token[] => {
      return tokens
        .filter(token => token.totalLiquidity && parseFloat(token.totalLiquidity) > 0)
        .sort((a, b) => parseFloat(b.totalLiquidity || '0') - parseFloat(a.totalLiquidity || '0'))
        .slice(0, limit);
    }
  };
}
