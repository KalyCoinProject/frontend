'use client';

import { useState, useEffect, useCallback } from 'react';
import { graphqlRequest, isDevelopment } from '@/lib/api-config';
import { farmingLogger } from '@/lib/logger';

// Types for farming subgraph data
export interface FarmingPool {
  id: string;
  address: string;
  stakingToken: string;
  rewardsToken: string;
  totalStaked: string;
  rewardRate: string;
  periodFinish: string;
  farmers?: Farmer[];
}

export interface Farmer {
  id: string;
  address: string;
  stakedAmount: string;
  rewards: string;
}

export interface WhitelistedPool {
  id: string;
  pairAddress: string;
  weight: string;
  stakingPool?: FarmingPool | null;
}

export interface FarmingData {
  farmingPools: FarmingPool[];
  whitelistedPools: WhitelistedPool[];
  userFarms: Farmer[];
}

// Hook for fetching farming data from subgraph
export function useFarmingSubgraph(userAddress?: string) {
  const [farmingData, setFarmingData] = useState<FarmingData>({
    farmingPools: [],
    whitelistedPools: [],
    userFarms: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFarmingData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      farmingLogger.debug('Fetching farming data from backend GraphQL...');

      // Use backend API URL from environment variables with fallback
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      const graphqlEndpoint = `${apiUrl}/graphql`;

      farmingLogger.debug('GraphQL Endpoint:', graphqlEndpoint);

      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetFarmingData($userAddress: String) {
              farmingData(userAddress: $userAddress) {
                farmingPools {
                  id
                  address
                  stakingToken
                  rewardsToken
                  totalStaked
                  rewardRate
                  rewardsDuration
                  periodFinish
                  lastUpdateTime
                  rewardPerTokenStored
                  createdAt
                  updatedAt
                }
                whitelistedPools {
                  id
                  pair
                  weight
                  manager {
                    id
                    address
                  }
                }
                userFarms {
                  id
                  address
                  stakedAmount
                  rewards
                  lastAction
                  lastActionTimestamp
                  pool {
                    id
                    address
                    stakingToken
                    rewardsToken
                  }
                }
              }
            }
          `,
          variables: {
            userAddress: userAddress?.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        farmingLogger.debug('Farming subgraph response:', result);

        if (result.errors) {
          farmingLogger.error('GraphQL errors:', result.errors);
          throw new Error(result.errors[0].message);
        }

        if (result.data?.farmingData) {
          const { farmingPools, whitelistedPools, userFarms } = result.data.farmingData;

          setFarmingData({
            farmingPools: farmingPools || [],
            whitelistedPools: whitelistedPools || [],
            userFarms: userFarms || []
          });

          farmingLogger.debug(`Fetched ${farmingPools?.length || 0} farming pools, ${whitelistedPools?.length || 0} whitelisted pools, ${userFarms?.length || 0} user farms`);
        }
      } else {
        const errorText = await response.text();
        farmingLogger.error('Backend GraphQL response not ok:', response.status, errorText);
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      // Downgrade network errors to warn — backend may simply not be running
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch farming data';
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('ECONNREFUSED')) {
        farmingLogger.warn('[Farming] Backend unavailable, V2 farming data skipped');
      } else {
        farmingLogger.error('Error fetching farming data:', err);
      }
      setError(`Farming data fetch failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchFarmingData();
  }, [fetchFarmingData]);

  // Get farming pool by staking token address
  const getFarmingPoolByStakingToken = useCallback((stakingToken: string): FarmingPool | null => {
    return farmingData.farmingPools.find(pool => 
      pool.stakingToken.toLowerCase() === stakingToken.toLowerCase()
    ) || null;
  }, [farmingData.farmingPools]);

  // Get user's staked amount in a specific pool
  const getUserStakedAmount = useCallback((poolAddress: string): string => {
    const userFarm = farmingData.userFarms.find(farm => 
      farm.id.includes(poolAddress.toLowerCase())
    );
    return userFarm?.stakedAmount || '0';
  }, [farmingData.userFarms]);

  // Get user's earned rewards in a specific pool
  const getUserEarnedRewards = useCallback((poolAddress: string): string => {
    const userFarm = farmingData.userFarms.find(farm => 
      farm.id.includes(poolAddress.toLowerCase())
    );
    return userFarm?.rewards || '0';
  }, [farmingData.userFarms]);

  // Check if a pair is whitelisted for farming
  const isPairWhitelisted = useCallback((pairAddress: string): boolean => {
    return farmingData.whitelistedPools.some(pool => 
      pool.pairAddress.toLowerCase() === pairAddress.toLowerCase()
    );
  }, [farmingData.whitelistedPools]);

  // Get whitelisted pool info
  const getWhitelistedPool = useCallback((pairAddress: string): WhitelistedPool | null => {
    return farmingData.whitelistedPools.find(pool => 
      pool.pairAddress.toLowerCase() === pairAddress.toLowerCase()
    ) || null;
  }, [farmingData.whitelistedPools]);

  return {
    farmingData,
    isLoading,
    error,
    refetch: fetchFarmingData,
    // Helper functions
    getFarmingPoolByStakingToken,
    getUserStakedAmount,
    getUserEarnedRewards,
    isPairWhitelisted,
    getWhitelistedPool,
    // Computed values
    totalFarmingPools: farmingData.farmingPools.length,
    totalWhitelistedPools: farmingData.whitelistedPools.length,
    userActiveFarms: farmingData.userFarms.filter(farm => parseFloat(farm.stakedAmount) > 0).length
  };
}

// Hook for fetching specific farming pool data
export function useFarmingPool(poolAddress: string, userAddress?: string) {
  const [pool, setPool] = useState<FarmingPool | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPoolData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetFarmingPool($poolId: String!, $userAddress: String) {
              farmingPool(id: $poolId) {
                id
                address
                stakingToken
                rewardsToken
                totalStaked
                rewardRate
                periodFinish
                farmers(where: { address: $userAddress }) {
                  id
                  address
                  stakedAmount
                  rewards
                }
              }
            }
          `,
          variables: {
            poolId: poolAddress.toLowerCase(),
            userAddress: userAddress?.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        setPool(result.data?.farmingPool || null);
      } else {
        throw new Error('Failed to fetch farming pool data');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch farming pool';
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        farmingLogger.warn('[Farming] Backend unavailable, pool data skipped');
      } else {
        farmingLogger.error('❌ Error fetching farming pool:', err);
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [poolAddress, userAddress]);

  useEffect(() => {
    if (poolAddress) {
      fetchPoolData();
    }
  }, [fetchPoolData, poolAddress]);

  return {
    pool,
    isLoading,
    error,
    refetch: fetchPoolData,
    userStakedAmount: pool?.farmers?.[0]?.stakedAmount || '0',
    userEarnedRewards: pool?.farmers?.[0]?.rewards || '0'
  };
}
