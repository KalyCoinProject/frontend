'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatUnits } from 'ethers/lib/utils';
import { farmingLogger } from '@/lib/logger';

// Types for user farming positions
export interface UserFarmingPosition {
  poolAddress: string;
  stakingToken: string;
  rewardsToken: string;
  stakedAmount: string;
  stakedAmountFormatted: string;
  earnedRewards: string;
  earnedRewardsFormatted: string;
  rewardRate: string;
  periodFinish: Date;
  isActive: boolean;
  poolInfo?: {
    totalStaked: string;
    totalStakedFormatted: string;
    userSharePercentage: number;
  };
}

export interface UserFarmingSummary {
  totalPositions: number;
  activePositions: number;
  totalStakedValue: string; // In USD if available
  totalEarnedRewards: string;
  totalEarnedRewardsFormatted: string;
}

// Hook for fetching user's farming positions from subgraph
export function useUserFarmingPositions(userAddress?: string) {
  const [positions, setPositions] = useState<UserFarmingPosition[]>([]);
  const [summary, setSummary] = useState<UserFarmingSummary>({
    totalPositions: 0,
    activePositions: 0,
    totalStakedValue: '0',
    totalEarnedRewards: '0',
    totalEarnedRewardsFormatted: '0.000000'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserPositions = useCallback(async () => {
    if (!userAddress) {
      setPositions([]);
      setSummary({
        totalPositions: 0,
        activePositions: 0,
        totalStakedValue: '0',
        totalEarnedRewards: '0',
        totalEarnedRewardsFormatted: '0.000000'
      });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      farmingLogger.debug('🔍 Fetching user farming positions for:', userAddress);

      // Use backend API URL from environment variables with fallback
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      const graphqlEndpoint = `${apiUrl}/graphql`;

      farmingLogger.debug('📡 GraphQL Endpoint:', graphqlEndpoint);

      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetUserFarmingPositions($userAddress: String!) {
              userFarmingData(userAddress: $userAddress) {
                id
                address
                stakedAmount
                rewards
                pool {
                  id
                  address
                  stakingToken
                  rewardsToken
                  totalStaked
                  rewardRate
                  periodFinish
                }
              }
            }
          `,
          variables: {
            userAddress: userAddress.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        farmingLogger.debug('📊 User farming positions response:', result);

        if (result.errors) {
          farmingLogger.error('GraphQL errors:', result.errors);
          throw new Error(result.errors[0].message);
        }

        if (result.data?.userFarmingData) {
          const farmers = result.data.userFarmingData;
          
          const userPositions: UserFarmingPosition[] = farmers.map((farmer: any) => {
            const pool = farmer.pool;
            const stakedAmount = farmer.stakedAmount || '0';
            const earnedRewards = farmer.rewards || '0';
            const periodFinish = new Date(parseInt(pool.periodFinish) * 1000);
            const isActive = parseFloat(stakedAmount) > 0;

            // Calculate user's share of the pool
            const totalStaked = pool.totalStaked || '0';
            const userSharePercentage = parseFloat(totalStaked) > 0 
              ? (parseFloat(stakedAmount) / parseFloat(totalStaked)) * 100 
              : 0;

            return {
              poolAddress: pool.address,
              stakingToken: pool.stakingToken,
              rewardsToken: pool.rewardsToken,
              stakedAmount,
              stakedAmountFormatted: formatUnits(stakedAmount, 18),
              earnedRewards,
              earnedRewardsFormatted: formatUnits(earnedRewards, 18),
              rewardRate: pool.rewardRate,
              periodFinish,
              isActive,
              poolInfo: {
                totalStaked,
                totalStakedFormatted: formatUnits(totalStaked, 18),
                userSharePercentage
              }
            };
          });

          // Calculate summary
          const activePositions = userPositions.filter(pos => pos.isActive);
          const totalEarnedRewards = userPositions.reduce((sum, pos) => {
            return sum + parseFloat(pos.earnedRewards);
          }, 0);

          const newSummary: UserFarmingSummary = {
            totalPositions: userPositions.length,
            activePositions: activePositions.length,
            totalStakedValue: '0', // TODO: Calculate USD value
            totalEarnedRewards: totalEarnedRewards.toString(),
            totalEarnedRewardsFormatted: formatUnits(totalEarnedRewards.toString(), 18)
          };

          setPositions(userPositions);
          setSummary(newSummary);

          farmingLogger.debug(`✅ Fetched ${userPositions.length} farming positions (${activePositions.length} active)`);
        } else {
          setPositions([]);
          setSummary({
            totalPositions: 0,
            activePositions: 0,
            totalStakedValue: '0',
            totalEarnedRewards: '0',
            totalEarnedRewardsFormatted: '0.000000'
          });
        }
      } else {
        const errorText = await response.text();
        farmingLogger.error('❌ Backend GraphQL response not ok:', response.status, errorText);
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      farmingLogger.error('❌ Error fetching user farming positions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch farming positions';
      setError(`User farming positions fetch failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchUserPositions();
  }, [fetchUserPositions]);

  // Helper functions
  const getPositionByPool = useCallback((poolAddress: string): UserFarmingPosition | null => {
    return positions.find(pos => 
      pos.poolAddress.toLowerCase() === poolAddress.toLowerCase()
    ) || null;
  }, [positions]);

  const getActivePositions = useCallback((): UserFarmingPosition[] => {
    return positions.filter(pos => pos.isActive);
  }, [positions]);

  const getTotalStakedInPool = useCallback((poolAddress: string): string => {
    const position = getPositionByPool(poolAddress);
    return position?.stakedAmount || '0';
  }, [getPositionByPool]);

  const getTotalEarnedInPool = useCallback((poolAddress: string): string => {
    const position = getPositionByPool(poolAddress);
    return position?.earnedRewards || '0';
  }, [getPositionByPool]);

  return {
    positions,
    summary,
    isLoading,
    error,
    refetch: fetchUserPositions,
    // Helper functions
    getPositionByPool,
    getActivePositions,
    getTotalStakedInPool,
    getTotalEarnedInPool,
    // Computed values
    hasActivePositions: summary.activePositions > 0,
    totalPositionsCount: summary.totalPositions,
    activePositionsCount: summary.activePositions
  };
}

// Hook for fetching a specific farming position
export function useUserFarmingPosition(userAddress?: string, poolAddress?: string) {
  const [position, setPosition] = useState<UserFarmingPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosition = useCallback(async () => {
    if (!userAddress || !poolAddress) {
      setPosition(null);
      setIsLoading(false);
      return;
    }

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
            query GetUserFarmingPosition($userAddress: String!) {
              userFarmingData(userAddress: $userAddress) {
                id
                address
                stakedAmount
                rewards
                pool {
                  id
                  address
                  stakingToken
                  rewardsToken
                  totalStaked
                  rewardRate
                  periodFinish
                }
              }
            }
          `,
          variables: {
            userAddress: userAddress.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        if (result.data?.farmer) {
          const farmer = result.data.farmer;
          const pool = farmer.pool;
          
          const userPosition: UserFarmingPosition = {
            poolAddress: pool.address,
            stakingToken: pool.stakingToken,
            rewardsToken: pool.rewardsToken,
            stakedAmount: farmer.stakedAmount || '0',
            stakedAmountFormatted: formatUnits(farmer.stakedAmount || '0', 18),
            earnedRewards: farmer.rewards || '0',
            earnedRewardsFormatted: formatUnits(farmer.rewards || '0', 18),
            rewardRate: pool.rewardRate,
            periodFinish: new Date(parseInt(pool.periodFinish) * 1000),
            isActive: parseFloat(farmer.stakedAmount || '0') > 0,
            poolInfo: {
              totalStaked: pool.totalStaked,
              totalStakedFormatted: formatUnits(pool.totalStaked, 18),
              userSharePercentage: parseFloat(pool.totalStaked) > 0 
                ? (parseFloat(farmer.stakedAmount || '0') / parseFloat(pool.totalStaked)) * 100 
                : 0
            }
          };

          setPosition(userPosition);
        } else {
          setPosition(null);
        }
      } else {
        throw new Error('Failed to fetch farming position');
      }
    } catch (err) {
      farmingLogger.error('❌ Error fetching farming position:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch farming position');
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, poolAddress]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  return {
    position,
    isLoading,
    error,
    refetch: fetchPosition,
    isActive: position?.isActive || false,
    stakedAmount: position?.stakedAmount || '0',
    earnedRewards: position?.earnedRewards || '0'
  };
}
