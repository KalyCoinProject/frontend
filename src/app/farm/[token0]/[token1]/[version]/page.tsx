'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Minus, Gift, Zap, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useWallet } from '@/hooks/useWallet'
import { useSingleFarmData } from '@/hooks/farming/useSingleFarmData'
import { BigNumber } from 'ethers'
import { formatNumber } from '@/lib/utils'
import TokenPairDisplay from '@/components/farming/TokenPairDisplay'
import { farmingLogger } from '@/lib/logger'
import StakingModal from '@/components/farming/StakingModal'
import UnstakingModal from '@/components/farming/UnstakingModal'
import ClaimRewardModal from '@/components/farming/ClaimRewardModal'
import '../../../farm.css'

export default function FarmManagePage() {
  const params = useParams()
  const router = useRouter()
  const { address, isConnected } = useWallet()
  
  const token0Symbol = params.token0 as string
  const token1Symbol = params.token1 as string
  const version = params.version as string

  // Modal states
  const [showStakingModal, setShowStakingModal] = useState(false)
  const [showUnstakingModal, setShowUnstakingModal] = useState(false)
  const [showClaimRewardModal, setShowClaimRewardModal] = useState(false)

  // Get single farm data for this specific farm
  const {
    stakingInfo,
    isLoading,
    error,
    refetch
  } = useSingleFarmData(token0Symbol, token1Symbol, version)

  // stakingInfo is now directly returned from useSingleFarmData hook

  // Debug logging
  farmingLogger.debug('🔍 Individual farm page debug:', {
    token0Symbol,
    token1Symbol,
    version,
    foundStakingInfo: !!stakingInfo,
    isLoading,
    error,
    stakingInfoData: stakingInfo ? {
      totalStakedInUsd: stakingInfo.totalStakedInUsd?.toFixed(6) || 'N/A',
      totalStakedSymbol: stakingInfo.totalStakedInUsd?.token.symbol || 'N/A',
      totalRewardRatePerWeek: stakingInfo.totalRewardRatePerWeek?.toFixed(6) || 'N/A'
    } : 'NOT FOUND'
  })

  // Get user's LP token balance
  const [userLiquidityUnstaked, setUserLiquidityUnstaked] = useState<any>(null)

  useEffect(() => {
    const fetchUserLPBalance = async () => {
      if (!stakingInfo || !address) {
        setUserLiquidityUnstaked(null)
        return
      }

      try {
        // Get the LP token address from the staking info
        const lpTokenAddress = stakingInfo.stakedAmount.token.address

        // Use ethers to call the LP token contract balanceOf method
        const { ethers } = await import('ethers')
        const provider = new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
        const lpTokenContract = new ethers.Contract(
          lpTokenAddress,
          ['function balanceOf(address) view returns (uint256)'],
          provider
        )

        const balance = await lpTokenContract.balanceOf(address)

        // Create a mock TokenAmount object similar to what useFarmManagement returned
        const mockTokenAmount = {
          token: stakingInfo.stakedAmount.token,
          raw: balance,
          toSignificant: (digits: number) => {
            const value = parseFloat(balance.toString()) / Math.pow(10, 18)
            return value.toFixed(Math.min(digits, 6))
          },
          toFixed: (digits: number) => {
            const value = parseFloat(balance.toString()) / Math.pow(10, 18)
            return value.toFixed(digits)
          },
          toNumber: () => {
            return parseFloat(balance.toString()) / Math.pow(10, 18)
          },
          equalTo: (other: string | number) => {
            const otherValue = typeof other === 'string' ? BigNumber.from(other) : BigNumber.from(other.toString())
            return balance.eq(otherValue)
          },
          greaterThan: (other: string | number) => {
            const otherValue = typeof other === 'string' ? BigNumber.from(other) : BigNumber.from(other.toString())
            return balance.gt(otherValue)
          }
        }

        setUserLiquidityUnstaked(mockTokenAmount)

        farmingLogger.debug('💰 User LP balance:', {
          lpTokenAddress,
          balance: balance.toString(),
          formatted: mockTokenAmount.toSignificant(6)
        })
      } catch (error) {
        farmingLogger.error('Error fetching user LP balance:', error)
        setUserLiquidityUnstaked(null)
      }
    }

    fetchUserLPBalance()
  }, [stakingInfo, address])

  const handleDepositClick = useCallback(() => {
    if (!isConnected) {
      // Show wallet connection modal
      return
    }
    setShowStakingModal(true)
  }, [isConnected])

  // Create refresh function to update data after successful transactions
  const handleRefreshData = useCallback(() => {
    farmingLogger.debug('🔄 Refreshing farm data after successful transaction...')
    // Background refresh without loading state - follows swaps page pattern
    refetch()

    // Force refresh of user LP balance by clearing it and letting useEffect refetch
    setUserLiquidityUnstaked(null)
  }, [refetch])

  if (isLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400"></div>
        </div>
      </MainLayout>
    )
  }

  if (error || !stakingInfo) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm max-w-md">
            <CardContent className="p-8 text-center">
              <p className="text-red-400 mb-4">Failed to load farm data</p>
              <Button onClick={() => router.back()} variant="outline">
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  const isStaking = stakingInfo.stakedAmount.greaterThan('0')
  const isSuperFarm = stakingInfo.rewardTokensAddress && stakingInfo.rewardTokensAddress.length > 0
  const showAddLiquidityButton = stakingInfo.stakedAmount.equalTo('0') && (!userLiquidityUnstaked || userLiquidityUnstaked.equalTo('0'))

  // Helper function to format values with N/A fallback (same as FarmCard)
  function formatValueOrNA(value: number | undefined, formatter: (val: number) => string): string {
    if (value === undefined || value === 0) return 'N/A'
    return formatter(value)
  }

  // Format values - use same logic as FarmCard
  const totalStakedAmount = stakingInfo.totalStakedInUsd?.toNumber() || 0
  const tvlSymbol = stakingInfo.totalStakedInUsd?.token.symbol || 'N/A'
  // Use 5 decimal places for LP tokens to show precise amounts like 0.00627 or 212.04587
  const formattedTvl = formatValueOrNA(totalStakedAmount, (val) => `${formatNumber(val, 5)} ${tvlSymbol}`)
  const pairName = `${token0Symbol.toUpperCase()}-${token1Symbol.toUpperCase()}`

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="hover:text-white"
            style={{ color: '#fef3c7' }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Farms
          </Button>
          
          <div className="flex items-center gap-3">
            <TokenPairDisplay 
              token0={stakingInfo.tokens[0]} 
              token1={stakingInfo.tokens[1]} 
              size={40}
            />
            <div>
              <h1 className="text-3xl font-bold text-white">{pairName} Farm</h1>
              <p style={{ color: '#fef3c7' }}>Liquidity Mining</p>
            </div>
          </div>

          {isSuperFarm && (
            <Badge variant="secondary" className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30">
              <Zap className="w-4 h-4 mr-1" />
              Super Farm
            </Badge>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Total Staked</h3>
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <p className="text-3xl font-bold text-white">{formattedTvl}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Pool Rate</h3>
                <Gift className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-bold text-white">
                  {stakingInfo.totalRewardRatePerWeek?.toFixed(0, { groupSeparator: ',' }) || '-'} KSWAP / week
                </p>
                {isSuperFarm && (
                  <p className="text-sm text-purple-400">+ Extra rewards available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Liquidity Prompt */}
        {showAddLiquidityButton && (
          <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20 backdrop-blur-sm mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Step 1: Add Liquidity</h3>
                  <p style={{ color: '#fef3c7' }}>
                    You need {pairName} LP tokens to participate in this farm
                  </p>
                </div>
                <Link href={stakingInfo ? `/pools?tokenA=${stakingInfo.tokens[0].address}&tokenB=${stakingInfo.tokens[1].address}&tokenASymbol=${stakingInfo.tokens[0].symbol}&tokenBSymbol=${stakingInfo.tokens[1].symbol}` : '/pools'}>
                  <Button className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Add {pairName} Liquidity
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Liquidity Position */}
          <Card className={`
            ${isStaking 
              ? 'bg-gradient-to-r from-amber-500/10 via-slate-800/80 to-slate-800/80 border-amber-500/40' 
              : 'bg-slate-800/60 border-slate-700/50'
            }
            backdrop-blur-sm
          `}>
            <CardHeader>
              <CardTitle className="text-white">Your Liquidity Deposits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold text-white">
                  {stakingInfo.stakedAmount.toSignificant(6) || '0'}
                </p>
                <p style={{ color: '#fef3c7' }}>KSL {pairName}</p>
              </div>
            </CardContent>
          </Card>

          {/* Rewards */}
          <Card className="bg-slate-800/60 border-slate-700/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Your Rewards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* KSWAP Rewards */}
              <div className="bg-slate-900/40 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p style={{ color: '#fef3c7' }}>KSWAP Earned</p>
                  <p className="text-amber-400 font-semibold">
                    {stakingInfo.earnedAmount.toSignificant(6) || '0'} KSWAP
                  </p>
                </div>
                <p className="text-sm" style={{ color: '#fef3c7' }}>
                  Weekly Rate: {stakingInfo.rewardRatePerWeek?.toSignificant(4, { groupSeparator: ',' }) || '0'} KSWAP
                </p>
              </div>

              {/* Extra Rewards for Super Farms */}
              {isSuperFarm && (
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-4 border border-purple-500/20">
                  <p className="text-purple-300 font-medium mb-2">Extra Rewards</p>
                  <p className="text-purple-400 text-sm">
                    Additional reward tokens available for this super farm
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        {!showAddLiquidityButton && (
          <div className="flex flex-wrap gap-4 justify-center mt-8">
            <Button
              onClick={handleDepositClick}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-8 py-3"
            >
              <Plus className="w-4 h-4 mr-2" />
              {isStaking ? 'Deposit More' : 'Deposit LP Tokens'}
            </Button>

            {isStaking && (
              <Button
                onClick={() => setShowUnstakingModal(true)}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-8 py-3"
              >
                <Minus className="w-4 h-4 mr-2" />
                Withdraw
              </Button>
            )}

            {/* Claim Rewards Button - Show when user has staked tokens, disable when no rewards */}
            {isStaking && (
              <Button
                onClick={() => setShowClaimRewardModal(true)}
                disabled={stakingInfo.earnedAmount.equalTo('0')}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Gift className="w-4 h-4 mr-2" />
                Claim Rewards
              </Button>
            )}
          </div>
        )}

        {/* Available LP Tokens */}
        {userLiquidityUnstaked && !userLiquidityUnstaked.equalTo('0') && (
          <div className="text-center mt-4">
            <p style={{ color: '#fef3c7' }}>
              {userLiquidityUnstaked.toSignificant(6)} KSL {pairName} available to stake
            </p>
          </div>
        )}

        {/* Modals */}
        {stakingInfo && (
          <>
            <StakingModal
              isOpen={showStakingModal}
              onDismiss={() => setShowStakingModal(false)}
              stakingInfo={stakingInfo}
              userLiquidityUnstaked={userLiquidityUnstaked || undefined}
              version={parseInt(version)}
              onSuccess={handleRefreshData}
            />
            <UnstakingModal
              isOpen={showUnstakingModal}
              onDismiss={() => setShowUnstakingModal(false)}
              stakingInfo={stakingInfo}
              version={parseInt(version)}
              onSuccess={handleRefreshData}
            />
            <ClaimRewardModal
              isOpen={showClaimRewardModal}
              onDismiss={() => setShowClaimRewardModal(false)}
              stakingInfo={stakingInfo}
              version={parseInt(version)}
              onSuccess={handleRefreshData}
            />
          </>
        )}
      </div>
    </MainLayout>
  )
}
