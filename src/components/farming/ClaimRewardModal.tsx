'use client'

import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Gift, AlertCircle, CheckCircle, Zap } from 'lucide-react'
import { ClaimRewardModalProps } from '@/types/farming'
import { formatNumber } from '@/lib/utils'
import { useFarmingContracts } from '@/hooks/farming/useFarmingContracts'
import TokenPairDisplay from './TokenPairDisplay'
import { farmingLogger } from '@/lib/logger'

export default function ClaimRewardModal({
  isOpen,
  onDismiss,
  stakingInfo,
  version,
  extraRewardTokensAmount
}: ClaimRewardModalProps) {
  const [isClaiming, setIsClaiming] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { claimStakingRewards } = useFarmingContracts()

  const pairName = `${stakingInfo.tokens[0].symbol}-${stakingInfo.tokens[1].symbol}`
  const hasRewards = stakingInfo.earnedAmount.greaterThan('0')
  const hasExtraRewards = extraRewardTokensAmount && extraRewardTokensAmount.length > 0
  const isSuperFarm = stakingInfo.rewardTokensAddress && stakingInfo.rewardTokensAddress.length > 0

  const handleClaimRewards = useCallback(async () => {
    if (!hasRewards && !hasExtraRewards) {
      setError('No rewards to claim')
      return
    }

    try {
      setIsClaiming(true)
      setError(null)

      // Close modal before starting transaction (same pattern as SwapInterface)
      onDismiss()

      // Get the staking contract address from stakingInfo
      const stakingContractAddress = stakingInfo.stakingRewardAddress
      if (!stakingContractAddress) {
        throw new Error('Staking contract address not found')
      }

      const hash = await claimStakingRewards(stakingContractAddress)
      
      if (hash) {
        setTxHash(hash)
        farmingLogger.debug('✅ Claim rewards transaction submitted:', hash)

        // Call onSuccess to refresh data since modal is already closed
        // Note: ClaimRewardModal doesn't have onSuccess prop, but we should add it
        // For now, just reset the form
        setTxHash(null)
      } else {
        throw new Error('Transaction failed. Please try again.')
      }
    } catch (err) {
      farmingLogger.error('Claim rewards error:', err)
      // Since modal is closed, we can't show the error in the modal
      // Could be improved with toast notifications or other error handling
      alert(err instanceof Error ? err.message : 'Failed to claim rewards')
    } finally {
      setIsClaiming(false)
    }
  }, [hasRewards, hasExtraRewards, claimStakingRewards, stakingInfo.stakingRewardAddress, onDismiss])

  const handleClose = useCallback(() => {
    if (!isClaiming) {
      setError(null)
      setTxHash(null)
      onDismiss()
    }
  }, [isClaiming, onDismiss])

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!bg-stone-900 !border-amber-500/30 text-white max-w-md" style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              Claim Rewards
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              disabled={isClaiming}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {txHash ? (
          // Success State
          <div className="space-y-4 py-4">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Rewards Claimed!</h3>
              <p className="text-slate-400 text-sm mb-4">
                Your rewards have been claimed successfully. This modal will close automatically.
              </p>
              <div className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Transaction Hash:</p>
                <p className="text-xs font-mono text-amber-400 break-all">{txHash}</p>
              </div>
            </div>
          </div>
        ) : (
          // Claim State
          <div className="space-y-4">
            {/* Farm Info */}
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <TokenPairDisplay 
                    token0={stakingInfo.tokens[0]} 
                    token1={stakingInfo.tokens[1]} 
                    size={24}
                  />
                  <div>
                    <span className="font-semibold">{pairName} Farm</span>
                    {isSuperFarm && (
                      <div className="flex items-center gap-1 mt-1">
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span className="text-xs text-purple-400">Super Farm</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KSWAP Rewards */}
            <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-amber-300 font-medium flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    KSWAP Rewards
                  </h4>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-400">
                      {stakingInfo.earnedAmount.toSignificant(6)}
                    </p>
                    <p className="text-amber-300 text-sm">KSWAP</p>
                  </div>
                </div>
                
                <div className="bg-amber-500/10 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-200">Weekly Rate:</span>
                    <span className="text-amber-300">
                      {stakingInfo.rewardRatePerWeek?.toSignificant(4, { groupSeparator: ',' }) || '0'} KSWAP
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Extra Rewards for Super Farms */}
            {hasExtraRewards && extraRewardTokensAmount && (
              <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
                <CardContent className="p-4">
                  <h4 className="text-purple-300 font-medium flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4" />
                    Extra Rewards
                  </h4>
                  
                  <div className="space-y-2">
                    {extraRewardTokensAmount.map((reward, index) => (
                      <div key={index} className="bg-purple-500/10 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-purple-200">{reward.token.symbol}</span>
                          <div className="text-right">
                            <p className="text-purple-300 font-semibold">
                              {reward.toSignificant(6)}
                            </p>
                            <p className="text-purple-400 text-xs">{reward.token.symbol}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Rewards Message */}
            {!hasRewards && !hasExtraRewards && (
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-6 text-center">
                  <Gift className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400">No rewards available to claim</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Keep staking to earn rewards!
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Gas Fee Notice */}
            {(hasRewards || hasExtraRewards) && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-blue-400 font-medium mb-1">Gas Fee Required</p>
                    <p className="text-blue-300">
                      You'll need to pay a small gas fee to claim your rewards.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isClaiming}
                className="flex-1 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"
              >
                Cancel
              </Button>
              <Button
                onClick={handleClaimRewards}
                disabled={isClaiming || (!hasRewards && !hasExtraRewards)}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                {isClaiming ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Claiming...
                  </div>
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    Claim All Rewards
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
