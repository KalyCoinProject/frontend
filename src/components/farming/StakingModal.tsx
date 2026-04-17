'use client'

import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { X, Plus, AlertCircle, CheckCircle } from 'lucide-react'
import { StakingModalProps } from '@/types/farming'
import { formatNumber, formatPercentage, formatTokenAmount } from '@/lib/utils'
import { useFarmingContracts } from '@/hooks/farming/useFarmingContracts'
import { usePublicClient } from 'wagmi'
import { BigNumber, ethers } from 'ethers'
import TokenPairDisplay from './TokenPairDisplay'
import { farmingLogger } from '@/lib/logger'

export default function StakingModal({
  isOpen,
  onDismiss,
  stakingInfo,
  userLiquidityUnstaked,
  version,
  onSuccess
}: StakingModalProps) {
  const [amount, setAmount] = useState('')
  const [isStaking, setIsStaking] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { stakeLPTokensWithPermit, stakeLPTokens, approveLPTokens } = useFarmingContracts()
  const toast = useToast()
  const publicClient = usePublicClient()

  const maxAmount = userLiquidityUnstaked?.toSignificant(6) || '0'
  const isMaxAmount = amount === maxAmount
  const pairName = `${stakingInfo.tokens[0].symbol}-${stakingInfo.tokens[1].symbol}`

  const handleAmountChange = useCallback((value: string) => {
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError(null)
    }
  }, [])

  const handleMaxClick = useCallback(() => {
    setAmount(maxAmount)
    setError(null)
  }, [maxAmount])

  const validateAmount = useCallback(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      return false
    }

    if (!userLiquidityUnstaked || parseFloat(amount) > parseFloat(maxAmount)) {
      setError('Insufficient balance')
      return false
    }

    return true
  }, [amount, maxAmount, userLiquidityUnstaked])

  const handleStake = useCallback(async () => {
    if (!validateAmount()) return

    try {
      setIsStaking(true)
      setError(null)

      // Close modal before starting transaction (same pattern as SwapInterface)
      onDismiss()

      // Convert amount to BigNumber (avoiding scientific notation for large numbers)
      const amountBN = ethers.utils.parseEther(amount)

      // Get LP token address and staking reward address
      const lpTokenAddress = stakingInfo.stakedAmount.token.address
      const stakingRewardAddress = stakingInfo.stakingRewardAddress

      farmingLogger.debug('🚀 Starting stake process:', {
        lpTokenAddress,
        stakingRewardAddress,
        amount: amountBN.toString()
      })

      // Always approve first to avoid "ds-math-sub-underflow" errors
      farmingLogger.debug('Step 1: Approving LP tokens...')
      const approvalHash = await approveLPTokens(lpTokenAddress, stakingRewardAddress, amountBN)

      if (!approvalHash) {
        toast.error('Approval failed', 'Unable to approve LP tokens. Please try again.')
        return
      }

      farmingLogger.debug('✅ Approval submitted:', approvalHash)

      // Wait for approval tx receipt before staking — prevents "ds-math-sub-underflow"
      // when the stake call reads allowance before the approval tx is mined.
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: approvalHash as `0x${string}` })
        farmingLogger.debug('✅ Approval confirmed on-chain:', approvalHash)
      }

      // Step 2: Stake LP tokens
      farmingLogger.debug('Step 2: Staking LP tokens...')
      const stakeHash = await stakeLPTokens(stakingRewardAddress, amountBN)

      if (stakeHash) {
        setTxHash(stakeHash)
        farmingLogger.debug('✅ Staking transaction submitted:', stakeHash)

        // Call onSuccess to refresh data since modal is already closed
        if (onSuccess) {
          onSuccess()
        }

        // Reset form after successful transaction
        setAmount('')
        setTxHash(null)
      } else {
        throw new Error('Staking failed. Please try again.')
      }
    } catch (err) {
      farmingLogger.error('Staking error:', err)
      const message = err instanceof Error ? err.message : 'Failed to stake tokens'
      toast.error('Staking failed', message)
    } finally {
      setIsStaking(false)
    }
  }, [amount, stakingInfo, stakeLPTokens, approveLPTokens, validateAmount, onDismiss, onSuccess, publicClient, toast])

  const handleClose = useCallback(() => {
    if (!isStaking) {
      setAmount('')
      setError(null)
      setTxHash(null)
      onDismiss()
    }
  }, [isStaking, onDismiss])

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!bg-stone-900 !border-amber-500/30 text-white max-w-md" style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Deposit LP Tokens</DialogTitle>
        </DialogHeader>

        {txHash ? (
          // Success State
          <div className="space-y-4 py-4">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Transaction Submitted!</h3>
              <p className="text-gray-400 text-sm mb-4">
                Your LP tokens are being staked. This modal will close automatically.
              </p>
              <div className="bg-stone-900/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Transaction Hash:</p>
                <p className="text-xs font-mono text-amber-400 break-all">{txHash}</p>
              </div>
            </div>
          </div>
        ) : (
          // Form State
          <div className="space-y-4">
            {/* Farm Info */}
            <Card className="bg-stone-800/80 border-amber-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <TokenPairDisplay
                    token0={stakingInfo.tokens[0]}
                    token1={stakingInfo.tokens[1]}
                    size={24}
                  />
                  <span className="font-semibold">{pairName} Farm</span>
                </div>
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Your Staked</p>
                    <p className="text-white font-semibold">
                      {stakingInfo.stakedAmount.toSignificant(4)} KSL
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>



            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="stake-amount" className="text-gray-300">
                Amount to Stake
              </Label>
              <div className="relative">
                <Input
                  id="stake-amount"
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.0"
                  className="bg-stone-800 border-amber-500/30 text-white pr-16"
                  disabled={isStaking}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={isStaking || !userLiquidityUnstaked}
                  className="absolute right-2 inset-y-0 my-auto text-amber-400 hover:text-amber-300 h-6 px-2 flex items-center"
                >
                  MAX
                </Button>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Available:</span>
                <span className="text-white">
                  {maxAmount} KSL {pairName}
                </span>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}



            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleClose}
                disabled={isStaking}
                className="flex-1 bg-stone-700 hover:bg-stone-600 text-white border-amber-500/30"
              >
                Cancel
              </Button>
              <Button
                onClick={handleStake}
                disabled={isStaking || !amount || parseFloat(amount) <= 0 || !!error}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
              >
                {isStaking ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Staking...
                  </div>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Stake LP Tokens
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
