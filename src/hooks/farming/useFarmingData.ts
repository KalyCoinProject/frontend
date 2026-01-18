'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { DoubleSideStaking, DoubleSideStakingInfo, TokenAmount, Token } from '@/types/farming'
import { BigNumber } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import { useFarmingContracts } from './useFarmingContracts'
import { usePairAddresses } from './usePairAddresses'
import { LP_FARMING_POOLS, DOUBLE_SIDE_STAKING } from '@/config/farming'
import { batchFarmingCalls } from '@/utils/multicall'
import { contractCache, CacheKeys, withCache } from '@/utils/contractCache'
import { farmingLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

// Mock TokenAmount implementation with proper BigNumber handling
class MockTokenAmount implements TokenAmount {
  constructor(public token: Token, public raw: BigNumber) {}

  toSignificant(digits: number, options?: { groupSeparator?: string }): string {
    try {
      const formatted = formatUnits(this.raw, this.token.decimals)
      const value = parseFloat(formatted)
      return value.toFixed(Math.min(digits, 6))
    } catch (error) {
      farmingLogger.error('Error in toSignificant:', error)
      return '0'
    }
  }

  toFixed(digits: number, options?: { groupSeparator?: string }): string {
    try {
      const formatted = formatUnits(this.raw, this.token.decimals)
      const value = parseFloat(formatted)
      return value.toFixed(digits)
    } catch (error) {
      farmingLogger.error('Error in toFixed:', error)
      return '0'
    }
  }

  toNumber(): number {
    try {
      const formatted = formatUnits(this.raw, this.token.decimals)
      return parseFloat(formatted)
    } catch (error) {
      farmingLogger.error('Error in toNumber:', error)
      return 0
    }
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

// Helper function to create N/A staking info when data can't be fetched
function createNAStakingInfo(
  pool: DoubleSideStaking,
  token0: Token,
  token1: Token,
  pairAddress: string
): DoubleSideStakingInfo {
  const lpToken: Token = {
    address: pairAddress || 'N/A',
    symbol: `${token0.symbol}-${token1.symbol}`,
    name: `${token0.name}-${token1.name} LP`,
    decimals: 18,
    chainId: token0.chainId
  }

  // Use zero values to indicate no data available
  const stakedAmount = new MockTokenAmount(lpToken, BigNumber.from('0'))
  const earnedAmount = new MockTokenAmount(token0, BigNumber.from('0'))
  const totalStakedAmount = new MockTokenAmount(lpToken, BigNumber.from('0'))
  const totalRewardRatePerSecond = new MockTokenAmount(token0, BigNumber.from('0'))
  const totalRewardRatePerWeek = new MockTokenAmount(token0, BigNumber.from('0'))
  const rewardRatePerWeek = new MockTokenAmount(token0, BigNumber.from('0'))

  const totalStakedInUsd = new MockTokenAmount(
    { ...lpToken, symbol: 'USD', decimals: 2 },
    BigNumber.from('0')
  )

  const totalStakedInWklc = new MockTokenAmount(token0, BigNumber.from('0'))

  return {
    stakingRewardAddress: pool.stakingRewardAddress,
    tokens: [token0, token1],
    multiplier: BigNumber.from(0), // Use 0 for N/A cases instead of config multiplier
    stakedAmount,
    earnedAmount,
    totalStakedAmount,
    totalStakedInWklc,
    totalStakedInUsd,
    totalRewardRatePerSecond,
    totalRewardRatePerWeek,
    rewardRatePerWeek,
    periodFinish: new Date(0), // Epoch time to indicate no data
    isPeriodFinished: false, // Don't assume period is finished
    swapFeeApr: 0, // 0 to indicate N/A
    stakingApr: 0, // 0 to indicate N/A
    combinedApr: 0,
    rewardTokensAddress: [],
    rewardsAddress: pool.stakingRewardAddress,
    getHypotheticalWeeklyRewardRate: () => new MockTokenAmount(token0, BigNumber.from(0))
  }
}

export function useFarmingData(pools?: DoubleSideStaking[]) {
  const { address, chainId } = useWallet()
  const [stakingInfos, setStakingInfos] = useState<DoubleSideStakingInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false) // Prevent multiple simultaneous fetches
  const [refreshTrigger, setRefreshTrigger] = useState(0) // Trigger for manual refresh

  const { getStakingInfo, getPoolAPR, getWhitelistedPools } = useFarmingContracts()
  const { pairAddresses, loading: pairAddressesLoading } = usePairAddresses()

  // Use LP_FARMING_POOLS if no pools provided, fallback to DOUBLE_SIDE_STAKING
  // Memoize to prevent array recreation on every render
  const farmingPools = useMemo(() => {
    if (pools) return pools
    return Object.values(LP_FARMING_POOLS).length > 0
      ? Object.values(LP_FARMING_POOLS)
      : Object.values(DOUBLE_SIDE_STAKING)
  }, [pools])



  useEffect(() => {
    const fetchStakingData = async () => {
      if (!farmingPools.length) {
        setStakingInfos([])
        setIsLoading(false)
        return
      }

      // Prevent multiple simultaneous fetches
      if (isFetching) {
        return
      }

      // Don't wait for pair addresses loading - use fallback data
      try {
        setIsFetching(true)
        // Only set loading on initial load, not on refresh (follows swaps pattern)
        if (stakingInfos.length === 0) {
          setIsLoading(true)
        }
        setError(null)

        // Get whitelisted pools from contract
        const whitelistedPools = await getWhitelistedPools()

        const stakingInfoPromises = farmingPools.map(async (pool) => {
          // Create mock tokens for now (outside try block so they're available in catch)
          const token0: Token = {
            address: pool.tokens[0].address,
            symbol: pool.tokens[0].symbol,
            name: pool.tokens[0].name,
            decimals: pool.tokens[0].decimals,
            chainId: chainId || CHAIN_IDS.KALYCHAIN
          }

          const token1: Token = {
            address: pool.tokens[1].address,
            symbol: pool.tokens[1].symbol,
            name: pool.tokens[1].name,
            decimals: pool.tokens[1].decimals,
            chainId: chainId || CHAIN_IDS.KALYCHAIN
          }

          // Get pair address (use fetched address or fallback to config)
          const poolKey = `${token0.symbol}_${token1.symbol}`
          const pairAddress = pairAddresses[poolKey] || pool.pairAddress

          try {



            if (!pairAddress) {
              farmingLogger.warn(`No pair address found for ${poolKey} - showing N/A data`)
              // Return N/A data when pair address is not available
              return createNAStakingInfo(pool, token0, token1, 'N/A')
            }

            // LP token using the actual pair address
            const lpToken: Token = {
              address: pairAddress,
              symbol: `${token0.symbol}-${token1.symbol}`,
              name: `${token0.name}-${token1.name} LP`,
              decimals: 18,
              chainId: chainId || CHAIN_IDS.KALYCHAIN
            }

            // Get staking info from contract using pair address
            const contractData = await getStakingInfo(pairAddress, address)
            const aprData = await getPoolAPR(pairAddress)

            if (!contractData) {
              farmingLogger.warn(`No contract data available for ${poolKey}`)
              return createNAStakingInfo(pool, token0, token1, pairAddress)
            }

            // Create TokenAmounts with real contract data from individual staking contract
            const stakedAmount = new MockTokenAmount(lpToken, contractData.stakedAmount)
            const earnedAmount = new MockTokenAmount(token0, contractData.earnedAmount)
            const totalStakedAmount = new MockTokenAmount(lpToken, contractData.totalStakedAmount) // Real LP tokens staked
            const totalRewardRatePerSecond = new MockTokenAmount(token0, contractData.rewardRate)
            const totalRewardRatePerWeek = new MockTokenAmount(token0, totalRewardRatePerSecond.raw.mul(604800))

            // Calculate user's weekly reward rate based on their share
            const userShareOfPool = contractData.totalStakedAmount.gt(0)
              ? contractData.stakedAmount.mul(BigNumber.from(10).pow(18)).div(contractData.totalStakedAmount)
              : BigNumber.from(0)
            const userWeeklyRewards = totalRewardRatePerWeek.raw.mul(userShareOfPool).div(BigNumber.from(10).pow(18))
            const rewardRatePerWeek = new MockTokenAmount(token0, userWeeklyRewards)

            // Use the KLC liquidity for reference (this is the pool's total KLC value)
            // For non-WKLC pairs (like KSWAP/USDT), klcLiquidity will be 0
            const totalStakedInWklc = new MockTokenAmount(token0, contractData.klcLiquidity)

            // Always show the actual staked LP tokens, not the total pair liquidity
            // This represents what's actually deposited in the farming contract
            const totalStakedInUsd = new MockTokenAmount(
              { ...lpToken, symbol: `${token0.symbol}-${token1.symbol} LP`, decimals: 18 },
              contractData.totalStakedAmount // Real staked LP tokens from staking contract
            )

            const stakingInfo: DoubleSideStakingInfo = {
              stakingRewardAddress: contractData.stakingContractAddress, // Use the real staking contract address
              tokens: [token0, token1],
              multiplier: contractData.poolWeight, // Use the real pool weight from contract instead of config
              stakedAmount,
              earnedAmount,
              totalStakedAmount,
              totalStakedInWklc,
              totalStakedInUsd,
              totalRewardRatePerSecond,
              totalRewardRatePerWeek,
              rewardRatePerWeek,
              periodFinish: new Date(contractData.periodFinish * 1000), // Convert from timestamp
              isPeriodFinished: contractData.periodFinish < Math.floor(Date.now() / 1000),
              swapFeeApr: aprData?.swapFeeApr || 0, // 0 indicates N/A
              stakingApr: aprData?.stakingApr || 0, // 0 indicates N/A
              combinedApr: 0, // Will be calculated
              rewardTokensAddress: [], // Super farm tokens
              rewardsAddress: pool.stakingRewardAddress,
              getHypotheticalWeeklyRewardRate: (stakedAmount, totalStakedAmount, totalRewardRatePerSecond) => {
                if (totalStakedAmount.equalTo('0')) return new MockTokenAmount(token0, BigNumber.from(0))
                const userShare = stakedAmount.raw.mul(BigNumber.from(10).pow(18)).div(totalStakedAmount.raw)
                const weeklyReward = totalRewardRatePerSecond.raw.mul(604800).mul(userShare).div(BigNumber.from(10).pow(18))
                return new MockTokenAmount(token0, weeklyReward)
              }
            }

            // Calculate combined APR only if both values are available
            stakingInfo.combinedApr = (stakingInfo.swapFeeApr || 0) + (stakingInfo.stakingApr || 0)

            return stakingInfo
          } catch (poolError) {
            farmingLogger.error(`Error fetching data for pool ${pool.stakingRewardAddress}:`, poolError)
            // Return N/A data if contract calls fail
            return createNAStakingInfo(pool, token0, token1, pairAddress || 'N/A')
          }
        })

        const results = await Promise.all(stakingInfoPromises)
        const validResults = results.filter((result): result is DoubleSideStakingInfo => result !== null)

        farmingLogger.debug('Final staking infos to display:', validResults.length)
        validResults.forEach((info, index) => {
          farmingLogger.debug(`Farm ${index + 1}: ${info.tokens[0].symbol}-${info.tokens[1].symbol}`, {
            totalStakedInUsd: info.totalStakedInUsd?.toFixed(6) || 'N/A',
            totalStakedSymbol: info.totalStakedInUsd?.token.symbol || 'N/A',
            totalRewardRatePerWeek: info.totalRewardRatePerWeek?.toFixed(6) || 'N/A',
            isPeriodFinished: info.isPeriodFinished,
            stakingRewardAddress: info.stakingRewardAddress
          })
        })

        setStakingInfos(validResults)
      } catch (err) {
        farmingLogger.error('Error fetching staking data:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch staking data')
      } finally {
        setIsLoading(false)
        setIsFetching(false)
      }
    }

    fetchStakingData()
  }, [farmingPools, address, chainId, pairAddresses, refreshTrigger]) // Added refreshTrigger for manual refresh

  const refetch = useCallback(() => {
    farmingLogger.debug('Refetching farm data...')
    setError(null)
    // Trigger refresh without setting loading state - follows swaps page pattern
    setRefreshTrigger(prev => prev + 1)
  }, [])

  return {
    stakingInfos,
    isLoading,
    error,
    refetch
  }
}
