'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatNumber, formatPercentage } from '@/lib/utils'
import { DoubleSideStakingInfo } from '@/types/farming'
import TokenPairDisplay from './TokenPairDisplay'
import RewardTokens from './RewardTokens'
import { farmingLogger } from '@/lib/logger'

interface FarmCardProps {
  stakingInfo: DoubleSideStakingInfo
  version: string
}

// Helper function to format values with N/A fallback
function formatValueOrNA(value: number | undefined, formatter: (val: number) => string): string {
  if (value === undefined || value === 0) return 'N/A'
  return formatter(value)
}

export default function FarmCard({ stakingInfo, version }: FarmCardProps) {
  const isStaking = stakingInfo.stakedAmount.greaterThan('0')
  const isPeriodFinished = stakingInfo.isPeriodFinished
  const isSuperFarm = stakingInfo.rewardTokensAddress && stakingInfo.rewardTokensAddress.length > 0

  // Format TVL - show real amount from contract with proper decimals for LP tokens
  const totalStakedAmount = stakingInfo.totalStakedInUsd?.toNumber() || 0
  const tvlSymbol = stakingInfo.totalStakedInUsd?.token.symbol || 'N/A'
  // Use 5 decimal places for LP tokens to show precise amounts like 0.00627 or 212.04587
  const formattedTvl = formatValueOrNA(totalStakedAmount, (val) => `${formatNumber(val, 5)} ${tvlSymbol}`)

  // Get currency symbols
  const token0Symbol = stakingInfo.tokens[0].symbol
  const token1Symbol = stakingInfo.tokens[1].symbol

  // Generate manage link
  const manageLink = `/farm/${token0Symbol.toLowerCase()}/${token1Symbol.toLowerCase()}/${version}`

  // Format pool rate (weekly rewards) - use total pool rewards, not user rewards
  const totalPoolRateNumber = stakingInfo.totalRewardRatePerWeek?.toNumber() || 0
  const poolRate = totalPoolRateNumber > 0
    ? stakingInfo.totalRewardRatePerWeek?.toSignificant(4, { groupSeparator: ',' }) || 'N/A'
    : 'N/A'

  // Format user's weekly rewards (for staking section)
  const userRateNumber = stakingInfo.rewardRatePerWeek?.toNumber() || 0
  const userRate = userRateNumber > 0
    ? stakingInfo.rewardRatePerWeek?.toSignificant(4, { groupSeparator: ',' }) || 'N/A'
    : 'N/A'

  // Format pool weight (multiplier) - show actual value, even if 0
  const poolWeight = stakingInfo.multiplier
    ? stakingInfo.multiplier.toString()
    : '0'

  // Debug logging
  const pairName = `${stakingInfo.tokens[0].symbol}-${stakingInfo.tokens[1].symbol}`
  farmingLogger.debug(`🃏 FarmCard ${pairName}:`, {
    isPeriodFinished,
    periodFinish: stakingInfo.periodFinish,
    periodFinishTimestamp: stakingInfo.periodFinish ? stakingInfo.periodFinish.getTime() / 1000 : 0,
    currentTimestamp: Math.floor(Date.now() / 1000),
    isStaking,
    stakedAmount: stakingInfo.stakedAmount.toFixed(5),
    totalStakedInUsd: stakingInfo.totalStakedInUsd?.toFixed(5) || 'N/A',
    totalRewardRatePerWeek: stakingInfo.totalRewardRatePerWeek?.toFixed(5) || 'N/A',
    userRewardRatePerWeek: stakingInfo.rewardRatePerWeek?.toFixed(5) || 'N/A',
    formattedTvl: formattedTvl,
    poolRate: poolRate,
    userRate: userRate,
    poolWeight: poolWeight,
    multiplier: stakingInfo.multiplier?.toString() || 'N/A'
  })

  return (
    <Card className={`
      farm-card relative overflow-hidden transition-all duration-300
      ${isStaking
        ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/5 to-transparent'
        : ''
      }
    `}>
      {/* Background Effects */}
      {isStaking && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-400" />
      )}

      <CardContent className="p-6">
        {/* Pool Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {/* Token Icons */}
            <div className="flex items-center -space-x-2">
              <TokenPairDisplay
                token0={stakingInfo.tokens[0]}
                token1={stakingInfo.tokens[1]}
                size={24}
              />
            </div>

            {/* Pool Name */}
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-lg text-white">
                  {pairName}
                </h3>
                {isSuperFarm && (
                  <Badge variant="secondary" className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    Super Farm
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-300">
                Liquidity Pool Farming
              </p>
            </div>
          </div>
        </div>

        {/* Pool Info Section */}
        <div className="pool-info-card p-3 mb-4">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Pool Info</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Total Deposited:</span>
              <span className="text-white font-medium">{formattedTvl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Pool Rate:</span>
              <span className="text-white font-medium">{poolRate} KSWAP / week</span>
            </div>

          </div>
        </div>

        {/* User Position (if user is staking) */}
        {isStaking && (
          <div className="pool-info-card p-3 mb-4">
            <div className="flex items-center space-x-2 mb-3">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Your Position</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Your Rate:</span>
                <span className="text-amber-400 font-semibold">{userRate} KSWAP / week</span>
              </div>

              {/* Extra Rewards for Super Farms */}
              {isSuperFarm && stakingInfo.rewardTokensAddress && stakingInfo.rewardTokensAddress.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-purple-300">Extra Rewards:</span>
                  <span className="text-purple-400">Available</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-4 pt-4 border-t border-gray-600">
          <div className="flex space-x-2">
            <Link href={manageLink} className="flex-1">
              <Button
                className="w-full continue-button"
                size="sm"
              >
                {isStaking ? 'Manage' : 'Deposit'}
              </Button>
            </Link>
            {isSuperFarm && stakingInfo.rewardTokensAddress && (
              <div className="flex items-center">
                <RewardTokens rewardTokensAddress={stakingInfo.rewardTokensAddress} size={20} />
              </div>
            )}
          </div>
        </div>


      </CardContent>
    </Card>
  )
}
