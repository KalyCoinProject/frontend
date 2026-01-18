'use client'

import { useState, useEffect, useCallback } from 'react'
import { BigNumber, ethers } from 'ethers'
import { DoubleSideStakingInfo, Token } from '@/types/farming'
import { useWallet } from '@/hooks/useWallet'
import liquidityPoolManagerV2ABI from '@/config/abis/dex/liqudityPoolManagerV2ABI.json'
import { createMulticallService } from '@/utils/multicall'
import { farmingLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

// Contract address for LiquidityPoolManagerV2
const LIQUIDITY_POOL_MANAGER_V2_ADDRESS = '0xe83e7ede1358FA87e5039CF8B1cffF383Bc2896A'

// Cache for weights (they don't change frequently)
const weightsCache = new Map<string, { weights: { [key: string]: string }, timestamp: number }>()
const WEIGHTS_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Mock TokenAmount implementation
class MockTokenAmount {
  constructor(public token: Token, public raw: BigNumber) {}

  toSignificant(digits: number): string {
    try {
      // Convert from wei to tokens
      const divisor = BigNumber.from('1000000000000000000') // 10^18
      const tokenAmount = this.raw.div(divisor)
      return tokenAmount.toString()
    } catch (error) {
      farmingLogger.error('Error in toSignificant:', error)
      return '0'
    }
  }

  toFixed(digits: number): string {
    try {
      // Convert from wei to tokens
      const divisor = BigNumber.from('1000000000000000000') // 10^18
      const tokenAmount = this.raw.div(divisor)
      const num = parseFloat(tokenAmount.toString())
      return num.toFixed(digits)
    } catch (error) {
      farmingLogger.error('Error in toFixed:', error)
      return '0'
    }
  }

  toNumber(): number {
    try {
      const divisor = BigNumber.from('1000000000000000000') // 10^18
      const tokenAmount = this.raw.div(divisor)
      return parseFloat(tokenAmount.toString())
    } catch (error) {
      return 0
    }
  }

  greaterThan(other: string | number): boolean {
    try {
      const otherBN = typeof other === 'string' ? BigNumber.from(other) : BigNumber.from(other.toString())
      return this.raw.gt(otherBN)
    } catch (error) {
      return false
    }
  }

  lessThan(other: MockTokenAmount): boolean {
    return this.raw.lt(other.raw)
  }

  equalTo(other: MockTokenAmount): boolean {
    return this.raw.eq(other.raw)
  }
}

export function useFarmingSubgraphSimple() {
  const [stakingInfos, setStakingInfos] = useState<DoubleSideStakingInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get user address from wallet
  const { address: userAddress, isConnected } = useWallet()

  // Cache for weights to avoid repeated contract calls
  const [weightsCache, setWeightsCache] = useState<{ [key: string]: string }>({})
  const [weightsCacheTime, setWeightsCacheTime] = useState<number>(0)
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  // Function to get weights directly from contract (with caching and parallel calls)
  const getPoolWeights = useCallback(async (pairAddresses: string[]) => {
    try {
      // Check if we have cached weights that are still valid
      const now = Date.now()
      if (weightsCacheTime > 0 && (now - weightsCacheTime) < CACHE_DURATION && Object.keys(weightsCache).length > 0) {
        farmingLogger.debug('🚀 Using cached weights')
        return weightsCache
      }

      farmingLogger.debug('🏋️ Fetching weights from contract in parallel...')
      const provider = new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
      const liquidityManagerContract = new ethers.Contract(
        LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
        liquidityPoolManagerV2ABI,
        provider
      )

      // Make all weight calls in parallel using Promise.all
      const weightPromises = pairAddresses.map(async (pairAddress) => {
        try {
          const weight = await liquidityManagerContract.weights(pairAddress)
          return { address: pairAddress.toLowerCase(), weight: weight.toString() }
        } catch (error) {
          farmingLogger.warn(`Failed to get weight for ${pairAddress}:`, error)
          return { address: pairAddress.toLowerCase(), weight: '0' }
        }
      })

      const weightResults = await Promise.all(weightPromises)

      // Convert to object format
      const weights: { [key: string]: string } = {}
      weightResults.forEach(({ address, weight }) => {
        weights[address] = weight
        farmingLogger.debug(`🏋️ Weight for ${address}: ${weight}`)
      })

      // Cache the results
      setWeightsCache(weights)
      setWeightsCacheTime(now)

      return weights
    } catch (error) {
      farmingLogger.error('Error fetching pool weights from contract:', error)
      return weightsCache // Return cached weights if available
    }
  }, [weightsCache, weightsCacheTime])

  const fetchFarmingData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      farmingLogger.debug('🚀 Fetching farming data from backend...')

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query($userAddress: String) {
              farmingData(userAddress: $userAddress) {
                farmingPools {
                  id
                  address
                  stakingToken
                  rewardsToken
                  totalStaked
                  rewardRate
                  periodFinish
                }
                whitelistedPools {
                  id
                  pair
                  weight
                }
                userFarms {
                  id
                  address
                  pool {
                    id
                    address
                  }
                  stakedAmount
                  rewards
                }
              }
            }
          `,
          variables: {
            userAddress: userAddress
          }
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      const { farmingPools, whitelistedPools, userFarms } = result.data.farmingData

      farmingLogger.debug(`✅ Fetched ${farmingPools.length} farming pools, ${userFarms?.length || 0} user farms for address: ${userAddress}`)
      if (userFarms && userFarms.length > 0) {
        farmingLogger.debug('🎯 User farms data:', userFarms)
      }

      // Get actual weights from contract
      const pairAddresses = farmingPools.map((pool: any) => pool.stakingToken)
      const contractWeights = await getPoolWeights(pairAddresses)

      // Convert to UI format
      const stakingInfos = farmingPools.map((pool: any) => {
        // Find weight
        const whitelistedPool = whitelistedPools.find((wp: any) =>
          wp.pair?.toLowerCase() === pool.stakingToken?.toLowerCase()
        )

        // Find user's farming data for this pool
        const userFarm = userFarms?.find((farm: any) =>
          farm.pool?.address?.toLowerCase() === pool.address?.toLowerCase()
        )

        // Token mapping
        let token0Symbol = 'UNKNOWN', token1Symbol = 'UNKNOWN'
        const pairAddress = pool.stakingToken.toLowerCase()

        if (pairAddress === '0x25fddaf836d12dc5e285823a644bb86e0b79c8e2') {
          token0Symbol = 'WKLC'; token1Symbol = 'USDT'
        } else if (pairAddress === '0x0e520779287bb711c8e603cc85d532daa7c55372') {
          token0Symbol = 'KSWAP'; token1Symbol = 'USDT'
        } else if (pairAddress === '0xf3e034650e1c2597a0af75012c1854247f271ee0') {
          token0Symbol = 'KSWAP'; token1Symbol = 'WKLC'
        } else if (pairAddress === '0x1a3d8b9fe0a77923a8330ffce485afd2b0b8be7e') {
          token0Symbol = 'WKLC'; token1Symbol = 'DAI'
        } else if (pairAddress === '0x558d7d1ef09ae32dbdfe25f5f9eea6767288b156') {
          token0Symbol = 'WKLC'; token1Symbol = 'POL'
        } else if (pairAddress === '0x5df408ae7a3a83b9889e8e661a6c91a00b723fde') {
          token0Symbol = 'WKLC'; token1Symbol = 'BNB'
        } else if (pairAddress === '0x82a20edd4a6c076f5c2f9d244c80c5906aa88268') {
          token0Symbol = 'WKLC'; token1Symbol = 'ETH'
        } else if (pairAddress === '0x4d7f05b00d6bf67c1062bccc26e1ca1fc24ac0f0') {
          token0Symbol = 'WKLC'; token1Symbol = 'USDC'
        } else if (pairAddress === '0x6548735742fc5cccb2cde021246feb333ef46211') {
          token0Symbol = 'WKLC'; token1Symbol = 'SNB'
        }

        // Create tokens
        const token0: Token = {
          address: '0x0000000000000000000000000000000000000000',
          symbol: token0Symbol,
          name: token0Symbol,
          decimals: 18,
          chainId: CHAIN_IDS.KALYCHAIN
        }

        const token1: Token = {
          address: '0x0000000000000000000000000000000000000001',
          symbol: token1Symbol,
          name: token1Symbol,
          decimals: 18,
          chainId: CHAIN_IDS.KALYCHAIN
        }

        const lpToken: Token = {
          address: pool.stakingToken,
          symbol: `${token0Symbol}-${token1Symbol}`,
          name: `${token0Symbol}-${token1Symbol} LP`,
          decimals: 18,
          chainId: CHAIN_IDS.KALYCHAIN
        }

        const rewardToken: Token = {
          address: '0x4C4b968232a8603e2D1e53AB26E9a0319fA33ED3',
          symbol: 'KSWAP',
          name: 'KalySwap',
          decimals: 18,
          chainId: CHAIN_IDS.KALYCHAIN
        }

        // Convert values
        const totalStaked = BigNumber.from(pool.totalStaked || '0')
        const rewardRate = BigNumber.from(pool.rewardRate || '0')
        const periodFinish = BigNumber.from(pool.periodFinish || '0')

        // Get user staking amounts
        const userStakedAmount = userFarm ? BigNumber.from(userFarm.stakedAmount || '0') : BigNumber.from('0')
        const userEarnedAmount = userFarm ? BigNumber.from(userFarm.rewards || '0') : BigNumber.from('0')

        // Calculate weekly reward rate (rewardRate is per second in wei)
        const secondsPerWeek = BigNumber.from(60 * 60 * 24 * 7)
        const rewardRatePerWeekWei = rewardRate.mul(secondsPerWeek)

        // Calculate user's reward rate per week if they have staked tokens
        let userRewardRatePerWeekWei = BigNumber.from('0')
        if (userStakedAmount.gt(0) && totalStaked.gt(0)) {
          userRewardRatePerWeekWei = rewardRatePerWeekWei.mul(userStakedAmount).div(totalStaked)
        }

        // Get weight from contract data (preferred) or subgraph fallback
        let poolWeight = contractWeights[pairAddress] || whitelistedPool?.weight || '0'

        farmingLogger.debug(`🏋️ Pool ${token0Symbol}-${token1Symbol}: contractWeight=${contractWeights[pairAddress]}, subgraphWeight=${whitelistedPool?.weight}, finalWeight=${poolWeight}`)

        farmingLogger.debug(`🔍 Pool ${token0Symbol}-${token1Symbol}: rewardRate=${rewardRate.toString()}, totalStaked=${totalStaked.toString()}, weight=${poolWeight}, userStaked=${userStakedAmount.toString()}`)

        return {
          stakingRewardAddress: pool.address,
          tokens: [token0, token1],
          stakedAmount: new MockTokenAmount(lpToken, userStakedAmount),
          earnedAmount: new MockTokenAmount(rewardToken, userEarnedAmount),
          totalStakedAmount: new MockTokenAmount(lpToken, totalStaked),
          totalStakedInWklc: new MockTokenAmount(lpToken, BigNumber.from('0')),
          totalStakedInUsd: new MockTokenAmount(lpToken, totalStaked),
          totalRewardRate: new MockTokenAmount(rewardToken, rewardRate),
          totalRewardRatePerSecond: new MockTokenAmount(rewardToken, rewardRate),
          totalRewardRatePerWeek: new MockTokenAmount(rewardToken, rewardRatePerWeekWei),
          rewardRatePerWeek: new MockTokenAmount(rewardToken, userRewardRatePerWeekWei),
          periodFinish: new Date(periodFinish.toNumber() * 1000),
          apr: '0',
          multiplier: BigNumber.from(poolWeight),
          isPeriodFinished: periodFinish.toNumber() * 1000 < Date.now(),
          pairAddress: pool.stakingToken,
          swapFeeApr: 0,
          stakingApr: 0,
          combinedApr: 0,
          getHypotheticalWeeklyRewardRate: (stakedAmount: any, totalStakedAmount: any, totalRewardRatePerSecond: any) => {
            if (totalStakedAmount.raw.isZero()) return new MockTokenAmount(totalRewardRatePerSecond.token, BigNumber.from(0))
            const weeklyRate = totalRewardRatePerSecond.raw.mul(604800)
            return new MockTokenAmount(totalRewardRatePerSecond.token, weeklyRate.mul(stakedAmount.raw).div(totalStakedAmount.raw))
          }
        } as DoubleSideStakingInfo
      })

      setStakingInfos(stakingInfos)
      setIsLoading(false)
      farmingLogger.debug(`✅ Loaded ${stakingInfos.length} farms from subgraph`)

    } catch (err) {
      farmingLogger.error('❌ Error fetching farming data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch farming data')
      setIsLoading(false)
    }
  }, [userAddress, getPoolWeights])

  useEffect(() => {
    fetchFarmingData()
  }, [fetchFarmingData])

  return {
    stakingInfos,
    isLoading,
    error,
    refetch: fetchFarmingData
  }
}
