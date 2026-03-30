'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, TrendingUp, Clock, Users } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { V3Incentive } from '@/services/dex/v3-staking-types'

interface V3FarmCardProps {
    incentive: V3Incentive;
    pendingReward: bigint;
    onStake: () => void;
    onManage: () => void;
}

/**
 * Format time remaining into a human-readable string
 */
function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return 'Ended'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    if (days > 0) return `${days}d ${hours}h left`
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m left`
    return `${minutes}m left`
}

/**
 * Determine incentive status based on timing
 */
function getIncentiveStatus(incentive: V3Incentive): { label: string; className: string } {
    const now = Math.floor(Date.now() / 1000)
    const startTime = Number(incentive.key.startTime)
    const endTime = Number(incentive.key.endTime)

    if (now < startTime) {
        return { label: 'Upcoming', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    }
    if (now >= endTime) {
        return { label: 'Ended', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }
    return { label: 'Active', className: 'bg-green-500/20 text-green-400 border-green-500/30' }
}

/**
 * Format a bigint reward amount with decimals
 */
function formatRewardAmount(amount: bigint, decimals: number = 18): string {
    if (amount === 0n) return '0'
    const divisor = 10n ** BigInt(decimals)
    const whole = amount / divisor
    const fraction = amount % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
    if (fractionStr) return `${whole.toString()}.${fractionStr}`
    return whole.toString()
}

/**
 * Format fee tier for display (e.g., 3000 -> 0.3%)
 */
function formatFeeTier(fee: number | undefined): string {
    if (!fee) return ''
    return `${(fee / 10000).toFixed(2)}%`
}

export default function V3FarmCard({ incentive, pendingReward, onStake, onManage }: V3FarmCardProps) {
    const status = getIncentiveStatus(incentive)
    const token0Symbol = incentive.poolToken0Symbol || 'Token0'
    const token1Symbol = incentive.poolToken1Symbol || 'Token1'
    const rewardSymbol = incentive.rewardTokenSymbol || 'KSWAP'
    const rewardDecimals = incentive.rewardTokenDecimals || 18
    const pairName = `${token0Symbol}/${token1Symbol}`
    const hasPendingReward = pendingReward > 0n
    const isEnded = !incentive.isActive && incentive.timeRemaining === 0

    return (
        <Card className={`
            farm-card relative overflow-hidden transition-all duration-300
            ${hasPendingReward
                ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/5 to-transparent'
                : ''
            }
        `}>
            {/* Top accent bar for active incentives */}
            {incentive.isActive && (
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-amber-400" />
            )}

            <CardContent className="p-6">
                {/* Header: Pool pair + status */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        {/* V3 Icon */}
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30">
                            <Zap className="w-5 h-5 text-purple-400" />
                        </div>

                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="font-semibold text-lg text-white">{pairName}</h3>
                                {incentive.poolFee && (
                                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                                        {formatFeeTier(incentive.poolFee)}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-gray-400">V3 Concentrated Liquidity</p>
                        </div>
                    </div>

                    <Badge className={`${status.className} text-xs`}>
                        {status.label}
                    </Badge>
                </div>

                {/* Incentive Info */}
                <div className="pool-info-card p-3 mb-4">
                    <div className="flex items-center space-x-2 mb-3">
                        <TrendingUp className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-medium text-white">Incentive Info</span>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-300">Reward Token:</span>
                            <span className="text-white font-medium">{rewardSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-300">Unclaimed Rewards:</span>
                            <span className="text-white font-medium">
                                {formatRewardAmount(incentive.totalRewardUnclaimed, rewardDecimals)} {rewardSymbol}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Time Remaining:
                            </span>
                            <span className={`font-medium ${isEnded ? 'text-red-400' : 'text-amber-400'}`}>
                                {formatTimeRemaining(incentive.timeRemaining)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Staked Positions:
                            </span>
                            <span className="text-white font-medium">{incentive.numberOfStakes}</span>
                        </div>
                    </div>
                </div>

                {/* Pending Rewards (if any) */}
                {hasPendingReward && (
                    <div className="pool-info-card p-3 mb-4 border-amber-500/30">
                        <div className="flex items-center space-x-2 mb-2">
                            <Zap className="h-4 w-4 text-amber-400" />
                            <span className="text-sm font-medium text-white">Your Pending Rewards</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-300">Claimable:</span>
                            <span className="text-amber-400 font-semibold">
                                {formatRewardAmount(pendingReward, rewardDecimals)} {rewardSymbol}
                            </span>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-600">
                    <div className="flex space-x-2">
                        {!isEnded && (
                            <Button
                                onClick={onStake}
                                className="flex-1 continue-button"
                                size="sm"
                            >
                                Stake
                            </Button>
                        )}
                        <Button
                            onClick={onManage}
                            variant="outline"
                            className="flex-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            size="sm"
                        >
                            Manage
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
