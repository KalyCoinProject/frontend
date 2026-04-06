'use client';

import { useState, useEffect } from 'react';
import { request, gql } from 'graphql-request';
import { KALYSWAP_V3_TESTNET_CONFIG } from '@/config/dex/v3-config';
import { DexConfig } from '@/config/dex/types';

// Use the testnet config by default or logic to switch based on chainId if needed
// For now, defaulting to the config that has the URL we just verified.
const SUBGRAPH_URL = KALYSWAP_V3_TESTNET_CONFIG.subgraphUrl;

export interface V3Pool {
    id: string;
    token0: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
    };
    token1: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
    };
    feeTier: string;
    liquidity: string;
    sqrtPriceX96: string;
    tick: string;
    token0Price: string;
    token1Price: string;
    volumeUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    txCount: string;
    totalValueLockedUSD: string;
    totalValueLockedToken0: string;
    totalValueLockedToken1: string;
}

export interface V3Position {
    id: string;
    owner: string;
    pool: {
        id: string;
        token0: {
            symbol: string;
            decimals: string;
        };
        token1: {
            symbol: string;
            decimals: string;
        };
        feeTier: string;
        sqrtPriceX96: string;
        tick: string;
    };
    liquidity: string;
    tickLower: string;
    tickUpper: string;
    depositedToken0: string;
    depositedToken1: string;
    withdrawnToken0: string;
    withdrawnToken1: string;
    collectedFeesToken0: string;
    collectedFeesToken1: string;
}

export function useV3Pools() {
    const [pools, setPools] = useState<V3Pool[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPools = async () => {
            setLoading(true);
            setError(null);

            try {
                const query = gql`
          {
            pools(first: 100, orderBy: totalValueLockedUSD, orderDirection: desc) {
              id
              token0 {
                id
                symbol
                name
                decimals
              }
              token1 {
                id
                symbol
                name
                decimals
              }
              feeTier
              liquidity
              sqrtPriceX96
              tick
              token0Price
              token1Price
              volumeUSD
              volumeToken0
              volumeToken1
              txCount
              totalValueLockedUSD
              totalValueLockedToken0
              totalValueLockedToken1
            }
          }
        `;

                const data = await request<{ pools: V3Pool[] }>(SUBGRAPH_URL, query);
                setPools(data.pools);
            } catch (err) {
                console.error('Failed to fetch V3 pools:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch V3 pools');
            } finally {
                setLoading(false);
            }
        };

        fetchPools();
    }, []);

    return { pools, loading, error };
}

export function useUserV3Positions(userAddress: string | undefined | null) {
    const [positions, setPositions] = useState<V3Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userAddress) {
            setPositions([]);
            return;
        }

        const fetchPositions = async () => {
            setLoading(true);
            setError(null);

            try {
                const query = gql`
          {
            positions(
              where: { owner: "${userAddress.toLowerCase()}" }
              orderBy: liquidity
              orderDirection: desc
            ) {
              id
              owner
              pool {
                id
                token0 {
                    symbol
                    decimals
                }
                token1 {
                    symbol
                    decimals
                }
                feeTier
                sqrtPriceX96
                tick
              }
              liquidity
              tickLower
              tickUpper
              depositedToken0
              depositedToken1
              withdrawnToken0
              withdrawnToken1
              collectedFeesToken0
              collectedFeesToken1
            }
          }
        `;

                const data = await request<{ positions: V3Position[] }>(SUBGRAPH_URL, query);
                setPositions(data.positions);
            } catch (err) {
                console.error('Failed to fetch V3 positions:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch V3 positions');
            } finally {
                setLoading(false);
            }
        };

        fetchPositions();
    }, [userAddress]);

    return { positions, loading, error };
}
