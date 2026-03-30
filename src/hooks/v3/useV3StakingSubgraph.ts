'use client';

/**
 * useV3StakingSubgraph - Hook for querying V3 staking data from the subgraph
 * Provides incentive listings, user stakes, and reward claim history.
 *
 * Note: These queries depend on the V3 staking subgraph schema being deployed (Phase 6).
 * The hook gracefully handles errors when the subgraph entities don't exist yet.
 */

import { useState, useEffect, useCallback } from 'react';
import { request, gql } from 'graphql-request';
import { useAccount } from 'wagmi';
import { getV3Config } from '@/config/dex/v3-config';
import { CHAIN_IDS } from '@/config/chains';
import { dexLogger as logger } from '@/lib/logger';

// ========== Subgraph Types ==========

export interface SubgraphIncentive {
    id: string;
    rewardToken: {
        id: string;
        symbol: string;
        decimals: string;
    };
    pool: {
        id: string;
        token0: { symbol: string };
        token1: { symbol: string };
        feeTier: string;
    };
    startTime: string;
    endTime: string;
    refundee: string;
    reward: string;
    numberOfStakes: string;
}

export interface SubgraphStake {
    incentive: {
        id: string;
        rewardToken: { symbol: string };
    };
    liquidity: string;
}

export interface SubgraphDeposit {
    id: string;
    numberOfStakes: string;
    stakes: SubgraphStake[];
}

export interface SubgraphRewardClaim {
    id: string;
    rewardToken: { id: string; symbol: string };
    amount: string;
    timestamp: string;
}

// ========== GraphQL Queries ==========

const GET_INCENTIVES = gql`
    query GetIncentives {
        incentives(first: 100, where: { ended: false }) {
            id
            rewardToken {
                id
                symbol
                decimals
            }
            pool {
                id
                token0 { symbol }
                token1 { symbol }
                feeTier
            }
            startTime
            endTime
            refundee
            reward
            numberOfStakes
        }
    }
`;

const GET_USER_STAKES = gql`
    query GetUserStakes($owner: Bytes!) {
        stakerDeposits(where: { owner: $owner }) {
            id
            numberOfStakes
            stakes {
                incentive {
                    id
                    rewardToken { symbol }
                }
                liquidity
            }
        }
    }
`;

const GET_REWARD_CLAIMS = gql`
    query GetRewardClaims($owner: Bytes!) {
        rewardClaims(
            where: { owner: $owner }
            orderBy: timestamp
            orderDirection: desc
            first: 50
        ) {
            id
            rewardToken {
                id
                symbol
            }
            amount
            timestamp
        }
    }
`;

// ========== Hook ==========

export function useV3StakingSubgraph(chainId: number = CHAIN_IDS.KALYCHAIN_TESTNET) {
    const { address } = useAccount();
    const [incentives, setIncentives] = useState<SubgraphIncentive[]>([]);
    const [userStakes, setUserStakes] = useState<SubgraphDeposit[]>([]);
    const [rewardClaims, setRewardClaims] = useState<SubgraphRewardClaim[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    let subgraphUrl: string;
    try {
        subgraphUrl = getV3Config(chainId).subgraphUrl;
    } catch {
        subgraphUrl = '';
    }

    // Fetch active incentives
    const fetchIncentives = useCallback(async () => {
        if (!subgraphUrl) return;

        try {
            const data = await request<{ incentives: SubgraphIncentive[] }>(
                subgraphUrl,
                GET_INCENTIVES,
            );
            setIncentives(data.incentives);
        } catch (err) {
            // Expected to fail if staking entities aren't in the subgraph yet
            logger.debug('V3 Staking subgraph: incentives query failed (schema may not be deployed yet):', err);
            setIncentives([]);
        }
    }, [subgraphUrl]);

    // Fetch user stakes
    const fetchUserStakes = useCallback(async () => {
        if (!subgraphUrl || !address) {
            setUserStakes([]);
            return;
        }

        try {
            const data = await request<{ stakerDeposits: SubgraphDeposit[] }>(
                subgraphUrl,
                GET_USER_STAKES,
                { owner: address.toLowerCase() },
            );
            setUserStakes(data.stakerDeposits);
        } catch (err) {
            logger.debug('V3 Staking subgraph: user stakes query failed:', err);
            setUserStakes([]);
        }
    }, [subgraphUrl, address]);

    // Fetch reward claims history
    const fetchRewardClaims = useCallback(async () => {
        if (!subgraphUrl || !address) {
            setRewardClaims([]);
            return;
        }

        try {
            const data = await request<{ rewardClaims: SubgraphRewardClaim[] }>(
                subgraphUrl,
                GET_REWARD_CLAIMS,
                { owner: address.toLowerCase() },
            );
            setRewardClaims(data.rewardClaims);
        } catch (err) {
            logger.debug('V3 Staking subgraph: reward claims query failed:', err);
            setRewardClaims([]);
        }
    }, [subgraphUrl, address]);

    // Fetch all data on mount and when dependencies change
    useEffect(() => {
        const fetchAll = async () => {
            if (!subgraphUrl) {
                setError('Subgraph URL not configured');
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                await Promise.all([
                    fetchIncentives(),
                    fetchUserStakes(),
                    fetchRewardClaims(),
                ]);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to fetch staking subgraph data';
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAll();
    }, [subgraphUrl, address, fetchIncentives, fetchUserStakes, fetchRewardClaims]);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await Promise.all([
                fetchIncentives(),
                fetchUserStakes(),
                fetchRewardClaims(),
            ]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to refetch staking data';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [fetchIncentives, fetchUserStakes, fetchRewardClaims]);

    return {
        incentives,
        userStakes,
        rewardClaims,
        isLoading,
        error,
        refetch,
    };
}

export default useV3StakingSubgraph;
