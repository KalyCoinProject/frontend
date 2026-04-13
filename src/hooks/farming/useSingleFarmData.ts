'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { DoubleSideStakingInfo, Token } from '@/types/farming'
import { BigNumber } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import { useFarmingContracts } from './useFarmingContracts'
import { usePairAddresses } from './usePairAddresses'
import { LP_FARMING_POOLS } from '@/config/farming'
import { createMulticallService } from '@/utils/multicall'
import { contractCache, CacheKeys } from '@/utils/contractCache'
import { ethers } from 'ethers'
import stakingRewardsABI from '@/config/abis/dex/stakingRewardsABI.json'
import { farmingLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

// Mock TokenAmount implementation (same as original)
class MockTokenAmount {
  constructor(public token: Token, public raw: BigNumber) {}

  toSignificant(digits: number): string {
    try {
      const formatted = formatUnits(this.raw, this.token.decimals)
      const value = parseFloat(formatted)
      return value.toFixed(Math.min(digits, 6))
    } catch (error) {
      farmingLogger.error('Error in toSignificant:', error)
      return '0'
    }
  }

  toFixed(digits: number): string {
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

  greaterThan(other: any): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.gt(otherValue)
  }

  lessThan(other: any): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.lt(otherValue)
  }

  equalTo(other: any): boolean {
    const otherValue = typeof other === 'string' ? BigNumber.from(other) : other.raw
    return this.raw.eq(otherValue)
  }
}

/**
 * Optimized hook for fetching single farm data
 * Only fetches data for the specific farm instead of all farms
 */
export function useSingleFarmData(token0Symbol: string, token1Symbol: string, version: string) {
  const { address, chainId } = useWallet()
  const { pairAddresses } = usePairAddresses()
  const {
    getPoolAPR,
    getLiquidityPoolManagerContract,
    getStakingInfo
  } = useFarmingContracts()

  const [stakingInfo, setStakingInfo] = useState<DoubleSideStakingInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const farmingPools = Object.values(LP_FARMING_POOLS) || []

  // Find the specific pool configuration
  const poolConfig = farmingPools.find(pool => {
    const poolToken0 = pool.tokens[0].symbol.toLowerCase()
    const poolToken1 = pool.tokens[1].symbol.toLowerCase()
    const targetToken0 = token0Symbol.toLowerCase()
    const targetToken1 = token1Symbol.toLowerCase()
    
    return (poolToken0 === targetToken0 && poolToken1 === targetToken1) ||
           (poolToken0 === targetToken1 && poolToken1 === targetToken0)
  })

  // Create N/A staking info for failed pools
  const createNAStakingInfo = useCallback((pool: any, token0: Token, token1: Token, pairAddress: string): DoubleSideStakingInfo => {
    const lpToken: Token = {
      address: pairAddress,
      symbol: `${token0.symbol}-${token1.symbol}`,
      name: `${token0.name}-${token1.name} LP`,
      decimals: 18,
      chainId: chainId || CHAIN_IDS.KALYCHAIN
    }

    return {
      stakingRewardAddress: pool.stakingRewardAddress,
      tokens: [token0, token1],
      multiplier: BigNumber.from(0),
      stakedAmount: new MockTokenAmount(lpToken, BigNumber.from(0)),
      earnedAmount: new MockTokenAmount(token0, BigNumber.from(0)),
      totalStakedAmount: new MockTokenAmount(lpToken, BigNumber.from(0)),
      totalStakedInWklc: new MockTokenAmount(token0, BigNumber.from(0)),
      totalStakedInUsd: new MockTokenAmount(lpToken, BigNumber.from(0)),
      totalRewardRatePerSecond: new MockTokenAmount(token0, BigNumber.from(0)),
      totalRewardRatePerWeek: new MockTokenAmount(token0, BigNumber.from(0)),
      rewardRatePerWeek: new MockTokenAmount(token0, BigNumber.from(0)),
      periodFinish: new Date(),
      isPeriodFinished: true,
      swapFeeApr: 0,
      stakingApr: 0,
      combinedApr: 0,
      rewardTokensAddress: [],
      rewardsAddress: pool.stakingRewardAddress,
      getHypotheticalWeeklyRewardRate: () => new MockTokenAmount(token0, BigNumber.from(0))
    }
  }, [chainId])

  // Optimized single farm data fetching
  const fetchSingleFarmData = useCallback(async () => {
    if (!poolConfig) {
      setError(`Farm not found: ${token0Symbol}/${token1Symbol}`)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      farmingLogger.debug(`🚀 Fetching single farm data: ${token0Symbol}/${token1Symbol}`)

      // Check cache first
      const poolKey = `${token0Symbol}_${token1Symbol}`
      const pairAddress = pairAddresses[poolKey] || poolConfig.pairAddress
      
      if (!pairAddress) {
        throw new Error(`No pair address found for ${poolKey}`)
      }

      const cacheKey = CacheKeys.singleFarmData(chainId || CHAIN_IDS.KALYCHAIN, pairAddress, address)
      const cachedData = contractCache.get<DoubleSideStakingInfo>(cacheKey)
      
      if (cachedData) {
        farmingLogger.debug('📦 Using cached single farm data')
        setStakingInfo(cachedData)
        setIsLoading(false)
        return
      }

      // Create tokens
      const token0: Token = {
        address: poolConfig.tokens[0].address,
        symbol: poolConfig.tokens[0].symbol,
        name: poolConfig.tokens[0].name,
        decimals: poolConfig.tokens[0].decimals,
        chainId: chainId || CHAIN_IDS.KALYCHAIN
      }

      const token1: Token = {
        address: poolConfig.tokens[1].address,
        symbol: poolConfig.tokens[1].symbol,
        name: poolConfig.tokens[1].name,
        decimals: poolConfig.tokens[1].decimals,
        chainId: chainId || CHAIN_IDS.KALYCHAIN
      }

      // Create provider and get contracts
      const provider = new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
      const liquidityPoolManagerContract = getLiquidityPoolManagerContract()
      const stakingContract = new ethers.Contract(poolConfig.stakingRewardAddress, stakingRewardsABI, provider)

      if (!provider || !liquidityPoolManagerContract || !stakingContract) {
        throw new Error('Contracts not available')
      }

      // Farm data is always read from KalyChain mainnet (provider is hardcoded to mainnet RPC above),
      // so the Multicall address must also resolve on mainnet — not whatever chain the wallet happens
      // to be on. Passing the wallet's chainId here caused reverts when the wallet was on testnet.
      const multicall = createMulticallService(provider, CHAIN_IDS.KALYCHAIN)

      farmingLogger.debug('📡 Executing multicall for single farm...')

      // Batch LiquidityPoolManager calls
      const liquidityManagerCalls = [
        { functionName: 'isWhitelisted', params: [pairAddress] },
        { functionName: 'weights', params: [pairAddress] },
        { functionName: 'getKlcLiquidity', params: [pairAddress] },
        { functionName: 'stakes', params: [pairAddress] }
      ]

      const liquidityManagerResults = await multicall.batchSameContract(
        liquidityPoolManagerContract,
        liquidityManagerCalls
      )

      // Batch StakingRewards calls
      const stakingCalls = [
        { functionName: 'totalSupply', params: [] },
        { functionName: 'rewardRate', params: [] },
        { functionName: 'periodFinish', params: [] },
        { functionName: 'balanceOf', params: address ? [address] : ['0x0000000000000000000000000000000000000000'] },
        { functionName: 'earned', params: address ? [address] : ['0x0000000000000000000000000000000000000000'] }
      ]

      const stakingResults = await multicall.batchSameContract(stakingContract, stakingCalls)

      farmingLogger.debug('✅ Single farm multicall completed')

      // Extract results
      const [isWhitelisted, weights, klcLiquidity, stakes] = liquidityManagerResults
      const [totalSupply, rewardRate, periodFinish, balanceOf, earned] = stakingResults

      // Get APR data
      const aprData = await getPoolAPR(pairAddress)

      // Create LP token
      const lpToken: Token = {
        address: pairAddress,
        symbol: `${token0.symbol}-${token1.symbol}`,
        name: `${token0.name}-${token1.name} LP`,
        decimals: 18,
        chainId: chainId || CHAIN_IDS.KALYCHAIN
      }

      // Create TokenAmounts
      const stakedAmount = new MockTokenAmount(lpToken, balanceOf || BigNumber.from(0))
      const earnedAmount = new MockTokenAmount(token0, earned || BigNumber.from(0))
      const totalStakedAmount = new MockTokenAmount(lpToken, totalSupply || BigNumber.from(0))
      const totalRewardRatePerSecond = new MockTokenAmount(token0, rewardRate || BigNumber.from(0))
      const totalRewardRatePerWeek = new MockTokenAmount(token0, (rewardRate || BigNumber.from(0)).mul(604800))

      // Calculate user's weekly reward rate
      const userShareOfPool = totalSupply && totalSupply.gt(0) && balanceOf
        ? balanceOf.mul(BigNumber.from(10).pow(18)).div(totalSupply)
        : BigNumber.from(0)
      const userWeeklyRewards = totalRewardRatePerWeek.raw.mul(userShareOfPool).div(BigNumber.from(10).pow(18))
      const rewardRatePerWeek = new MockTokenAmount(token0, userWeeklyRewards)

      const totalStakedInWklc = new MockTokenAmount(token0, klcLiquidity || BigNumber.from(0))
      const totalStakedInUsd = new MockTokenAmount(lpToken, totalSupply || BigNumber.from(0))

      const stakingInfo: DoubleSideStakingInfo = {
        stakingRewardAddress: poolConfig.stakingRewardAddress,
        tokens: [token0, token1],
        multiplier: weights ? weights.toNumber() : 0,
        stakedAmount,
        earnedAmount,
        totalStakedAmount,
        totalStakedInWklc,
        totalStakedInUsd,
        totalRewardRatePerSecond,
        totalRewardRatePerWeek,
        rewardRatePerWeek,
        periodFinish: new Date((periodFinish || 0) * 1000),
        isPeriodFinished: (periodFinish || 0) < Math.floor(Date.now() / 1000),
        swapFeeApr: aprData?.swapFeeApr || 0,
        stakingApr: aprData?.stakingApr || 0,
        combinedApr: (aprData?.swapFeeApr || 0) + (aprData?.stakingApr || 0),
        rewardTokensAddress: [],
        rewardsAddress: poolConfig.stakingRewardAddress,
        getHypotheticalWeeklyRewardRate: (stakedAmount, totalStakedAmount, totalRewardRatePerSecond) => {
          if (totalStakedAmount.equalTo('0')) return new MockTokenAmount(token0, BigNumber.from(0))
          const userShare = stakedAmount.raw.mul(BigNumber.from(10).pow(18)).div(totalStakedAmount.raw)
          const weeklyReward = totalRewardRatePerSecond.raw.mul(604800).mul(userShare).div(BigNumber.from(10).pow(18))
          return new MockTokenAmount(token0, weeklyReward)
        }
      }

      // Cache the result
      contractCache.set(cacheKey, stakingInfo, { ttl: 45 * 1000 }) // 45 second cache

      setStakingInfo(stakingInfo)
      farmingLogger.debug(`✅ Single farm data loaded: ${token0Symbol}/${token1Symbol}`)

    } catch (err) {
      farmingLogger.error(`❌ Error fetching single farm data for ${token0Symbol}/${token1Symbol}:`, err)
      setError(err instanceof Error ? err.message : 'Failed to fetch farm data')
      
      // Set N/A data on error
      if (poolConfig) {
        const token0: Token = { address: poolConfig.tokens[0].address, symbol: poolConfig.tokens[0].symbol, name: poolConfig.tokens[0].name, decimals: poolConfig.tokens[0].decimals, chainId: chainId || CHAIN_IDS.KALYCHAIN }
        const token1: Token = { address: poolConfig.tokens[1].address, symbol: poolConfig.tokens[1].symbol, name: poolConfig.tokens[1].name, decimals: poolConfig.tokens[1].decimals, chainId: chainId || CHAIN_IDS.KALYCHAIN }
        const poolKey = `${token0.symbol}_${token1.symbol}`
        const pairAddress = pairAddresses[poolKey] || poolConfig.pairAddress || 'N/A'
        setStakingInfo(createNAStakingInfo(poolConfig, token0, token1, pairAddress))
      }
    } finally {
      setIsLoading(false)
    }
  }, [poolConfig, token0Symbol, token1Symbol, address, chainId, pairAddresses, refreshTrigger, getLiquidityPoolManagerContract, getStakingInfo, getPoolAPR, createNAStakingInfo])

  useEffect(() => {
    fetchSingleFarmData()
  }, [fetchSingleFarmData])

  const refetch = useCallback(() => {
    farmingLogger.debug(`🔄 Refetching single farm data: ${token0Symbol}/${token1Symbol}`)
    // Clear cache and trigger refresh
    const poolKey = `${token0Symbol}_${token1Symbol}`
    const pairAddress = pairAddresses[poolKey] || poolConfig?.pairAddress
    if (pairAddress) {
      const cacheKey = CacheKeys.singleFarmData(chainId || CHAIN_IDS.KALYCHAIN, pairAddress, address)
      contractCache.delete(cacheKey)
    }
    setError(null)
    setRefreshTrigger(prev => prev + 1)
  }, [token0Symbol, token1Symbol, chainId, address, pairAddresses, poolConfig])

  return {
    stakingInfo,
    isLoading,
    error,
    refetch
  }
}
