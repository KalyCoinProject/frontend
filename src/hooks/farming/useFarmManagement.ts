'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { DoubleSideStakingInfo, TokenAmount, Token } from '@/types/farming'
import { BigNumber } from 'ethers'
import { FARMING_CONFIG, getTokenBySymbol } from '@/config/farming'
import { useFarmingContracts } from './useFarmingContracts'
import { farmingLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

// Mock TokenAmount implementation (same as in useFarmingData)
class MockTokenAmount implements TokenAmount {
  constructor(public token: Token, public raw: BigNumber) {}

  toSignificant(digits: number, options?: { groupSeparator?: string }): string {
    const value = parseFloat(this.raw.toString()) / Math.pow(10, this.token.decimals)
    return value.toFixed(Math.min(digits, 6))
  }

  toFixed(digits: number, options?: { groupSeparator?: string }): string {
    const value = parseFloat(this.raw.toString()) / Math.pow(10, this.token.decimals)
    return value.toFixed(digits)
  }

  toNumber(): number {
    return parseFloat(this.raw.toString()) / Math.pow(10, this.token.decimals)
  }

  greaterThan(other: TokenAmount | string): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.gt(otherValue)
  }

  lessThan(other: TokenAmount | string): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.lt(otherValue)
  }

  equalTo(other: TokenAmount | string): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.eq(otherValue)
  }
}

export function useFarmManagement(token0Symbol: string, token1Symbol: string, version: string) {
  const { address, chainId } = useWallet()
  const [stakingInfo, setStakingInfo] = useState<DoubleSideStakingInfo | null>(null)
  const [userLiquidityUnstaked, setUserLiquidityUnstaked] = useState<TokenAmount | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { getStakingInfo, getPoolAPR } = useFarmingContracts()

  useEffect(() => {
    const fetchFarmData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Use default chainId if not available
        const currentChainId = chainId || CHAIN_IDS.KALYCHAIN

        // Find the matching farm configuration
        const allPools = FARMING_CONFIG.DOUBLE_SIDE_STAKING_REWARDS_INFO[currentChainId]?.flat() || []
        const matchingPool = allPools.find(pool => {
          const pool0Symbol = pool.tokens[0].symbol.toLowerCase()
          const pool1Symbol = pool.tokens[1].symbol.toLowerCase()
          const t0 = token0Symbol.toLowerCase()
          const t1 = token1Symbol.toLowerCase()
          
          return (
            (pool0Symbol === t0 && pool1Symbol === t1) ||
            (pool0Symbol === t1 && pool1Symbol === t0)
          ) && pool.version.toString() === version
        })

        if (!matchingPool) {
          throw new Error(`Farm not found for ${token0Symbol}-${token1Symbol} v${version}`)
        }

        // Get tokens
        const token0 = getTokenBySymbol(token0Symbol) || matchingPool.tokens[0]
        const token1 = getTokenBySymbol(token1Symbol) || matchingPool.tokens[1]

        if (!token0 || !token1) {
          throw new Error('Token information not found')
        }

        // Create LP token using the actual pair address
        const lpToken: Token = {
          address: matchingPool.pairAddress || matchingPool.stakingRewardAddress, // Use pair address for LP token
          symbol: `${token0.symbol}-${token1.symbol}`,
          name: `${token0.name}-${token1.name} LP`,
          decimals: 18,
          chainId: currentChainId
        }

        // Get contract data
        const contractData = await getStakingInfo(matchingPool.stakingRewardAddress, address)
        const aprData = await getPoolAPR(matchingPool.stakingRewardAddress)

        // Create TokenAmounts
        const stakedAmount = new MockTokenAmount(lpToken, contractData?.stakedAmount || BigNumber.from(0))
        const earnedAmount = new MockTokenAmount(token0, contractData?.earnedAmount || BigNumber.from(0))
        const totalStakedAmount = new MockTokenAmount(lpToken, contractData?.totalStakedAmount || BigNumber.from('1000000000000000000000'))
        const totalRewardRatePerSecond = new MockTokenAmount(token0, contractData?.rewardRate || BigNumber.from('1000000000000000000'))
        const totalRewardRatePerWeek = new MockTokenAmount(token0, totalRewardRatePerSecond.raw.mul(604800))
        
        // Calculate user's weekly reward rate
        const rewardRatePerWeek = stakedAmount.greaterThan('0') && !totalStakedAmount.equalTo('0')
          ? new MockTokenAmount(
              token0,
              totalRewardRatePerWeek.raw.mul(stakedAmount.raw).div(totalStakedAmount.raw)
            )
          : new MockTokenAmount(token0, BigNumber.from(0))

        // Use real contract data for totalStakedInUsd (same as useFarmingData)
        const totalStakedInUsd = new MockTokenAmount(
          { ...lpToken, symbol: `${token0.symbol}-${token1.symbol} LP`, decimals: 18 },
          contractData?.totalStakedAmount || BigNumber.from(0) // Real staked LP tokens from staking contract
        )

        const totalStakedInWklc = new MockTokenAmount(token0, BigNumber.from(0))

        // Create staking info
        const farmStakingInfo: DoubleSideStakingInfo = {
          stakingRewardAddress: matchingPool.stakingRewardAddress,
          tokens: [token0, token1],
          multiplier: BigNumber.from(matchingPool.multiplier || 1),
          stakedAmount,
          earnedAmount,
          totalStakedAmount,
          totalStakedInWklc,
          totalStakedInUsd,
          totalRewardRatePerSecond,
          totalRewardRatePerWeek,
          rewardRatePerWeek,
          periodFinish: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isPeriodFinished: false,
          swapFeeApr: aprData?.swapFeeApr || 0, // Use 0 instead of random data
          stakingApr: aprData?.stakingApr || 0, // Use 0 instead of random data
          combinedApr: 0,
          rewardTokensAddress: [],
          rewardsAddress: matchingPool.stakingRewardAddress,
          getHypotheticalWeeklyRewardRate: (stakedAmount, totalStakedAmount, totalRewardRatePerSecond) => {
            if (totalStakedAmount.equalTo('0')) return new MockTokenAmount(token0, BigNumber.from(0))
            const userShare = stakedAmount.raw.mul(BigNumber.from(10).pow(18)).div(totalStakedAmount.raw)
            const weeklyReward = totalRewardRatePerSecond.raw.mul(604800).mul(userShare).div(BigNumber.from(10).pow(18))
            return new MockTokenAmount(token0, weeklyReward)
          }
        }

        farmStakingInfo.combinedApr = (farmStakingInfo.swapFeeApr || 0) + (farmStakingInfo.stakingApr || 0)

        // Debug logging to check data
        farmingLogger.debug('🚜 useFarmManagement data:', {
          pairName: `${token0.symbol}-${token1.symbol}`,
          totalStakedAmount: contractData?.totalStakedAmount?.toString() || 'N/A',
          totalStakedInUsd: farmStakingInfo.totalStakedInUsd?.toFixed(6) || 'N/A',
          totalStakedSymbol: farmStakingInfo.totalStakedInUsd?.token.symbol || 'N/A',
          totalRewardRatePerWeek: farmStakingInfo.totalRewardRatePerWeek?.toFixed(6) || 'N/A',
          contractData: contractData
        })

        setStakingInfo(farmStakingInfo)

        // Get user's actual LP token balance
        if (address && lpToken) {
          try {
            // Use ethers to call the LP token contract balanceOf method
            const { ethers } = await import('ethers')
            const provider = new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
            const lpTokenContract = new ethers.Contract(
              lpToken.address,
              ['function balanceOf(address) view returns (uint256)'],
              provider
            )

            const balance = await lpTokenContract.balanceOf(address)
            const userUnstakedAmount = new MockTokenAmount(lpToken, balance)
            setUserLiquidityUnstaked(userUnstakedAmount)
          } catch (error) {
            farmingLogger.error('Error fetching LP token balance:', error)
            setUserLiquidityUnstaked(new MockTokenAmount(lpToken, BigNumber.from(0)))
          }
        } else {
          setUserLiquidityUnstaked(new MockTokenAmount(lpToken, BigNumber.from(0)))
        }

      } catch (err) {
        farmingLogger.error('Error fetching farm management data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch farm data')
      } finally {
        setIsLoading(false)
      }
    }

    if (token0Symbol && token1Symbol && version) {
      fetchFarmData()
    }
  }, [token0Symbol, token1Symbol, version, address, chainId]) // Removed function dependencies to prevent infinite re-renders

  return {
    stakingInfo,
    userLiquidityUnstaked,
    isLoading,
    error,
    refetch: () => {
      // Trigger refetch
      if (token0Symbol && token1Symbol && version) {
        setIsLoading(true)
        // The useEffect will handle the refetch
      }
    }
  }
}
