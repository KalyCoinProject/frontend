'use client'

import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { X, Minus, AlertCircle, CheckCircle } from 'lucide-react'
import { UnstakingModalProps } from '@/types/farming'
import { formatTokenAmount } from '@/lib/utils'
import { useFarmingContracts } from '@/hooks/farming/useFarmingContracts'
import { BigNumber, ethers } from 'ethers'
import TokenPairDisplay from './TokenPairDisplay'
import { farmingLogger } from '@/lib/logger'

export default function UnstakingModal({
  isOpen,
  onDismiss,
  stakingInfo,
  version,
  onSuccess
}: UnstakingModalProps) {
  const [amount, setAmount] = useState('')
  const [isUnstaking, setIsUnstaking] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { unstakeLPTokens } = useFarmingContracts()

  const maxAmount = stakingInfo.stakedAmount.toSignificant(6)
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

    if (parseFloat(amount) > parseFloat(maxAmount)) {
      setError('Insufficient staked balance')
      return false
    }

    return true
  }, [amount, maxAmount])

  const handleUnstake = useCallback(async () => {
    if (!validateAmount()) return

    try {
      setIsUnstaking(true)
      setError(null)

      // Close modal before starting transaction (same pattern as SwapInterface)
      onDismiss()

      // Convert amount to BigNumber (avoiding scientific notation for large numbers)
      const amountBN = ethers.utils.parseEther(amount)

      // Use the staking reward contract address to unstake LP tokens
      const stakingRewardAddress = stakingInfo.stakingRewardAddress
      const hash = await unstakeLPTokens(stakingRewardAddress, amountBN, version)
      
      if (hash) {
        setTxHash(hash)
        farmingLogger.debug('✅ Unstaking transaction submitted:', hash)

        // Call onSuccess to refresh data since modal is already closed
        if (onSuccess) {
          onSuccess()
        }

        // Reset form after successful transaction
        setAmount('')
        setTxHash(null)
      } else {
        throw new Error('Transaction failed. Please try again.')
      }
    } catch (err) {
      farmingLogger.error('Unstaking error:', err)
      // Since modal is closed, we can't show the error in the modal
      // Could be improved with toast notifications or other error handling
      alert(err instanceof Error ? err.message : 'Failed to unstake tokens')
    } finally {
      setIsUnstaking(false)
    }
  }, [amount, stakingInfo.stakingRewardAddress, unstakeLPTokens, validateAmount, onDismiss, onSuccess, version])

  const handleClose = useCallback(() => {
    if (!isUnstaking) {
      setAmount('')
      setError(null)
      setTxHash(null)
      onDismiss()
    }
  }, [isUnstaking, onDismiss])

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!bg-stone-900 !border-amber-500/30 text-white max-w-md" style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Withdraw LP Tokens</DialogTitle>
        </DialogHeader>

        {txHash ? (
          // Success State
          <div className="space-y-4 py-4">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Transaction Submitted!</h3>
              <p className="text-gray-400 text-sm mb-4">
                Your LP tokens are being withdrawn. This modal will close automatically.
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Your Staked</p>
                    <p className="text-white font-semibold">
                      {stakingInfo.stakedAmount.toSignificant(6)} KSL
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Earned Rewards</p>
                    <p className="text-amber-400 font-semibold">
                      {stakingInfo.earnedAmount.toSignificant(4)} KSWAP
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Amount Input */}
            <div className="space-y-2">
              <label htmlFor="unstake-amount" className="text-gray-300 text-sm font-medium">
                Amount to Withdraw
              </label>
              <div className="relative">
                <Input
                  id="unstake-amount"
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.0"
                  className="bg-stone-800 border-amber-500/30 text-white pr-16"
                  disabled={isUnstaking}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={isUnstaking || stakingInfo.stakedAmount.equalTo('0')}
                  className="absolute right-2 inset-y-0 my-auto text-amber-400 hover:text-amber-300 h-6 px-2 flex items-center"
                >
                  MAX
                </Button>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Staked Balance:</span>
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

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-yellow-400 font-medium mb-1">Important Notice</p>
                  <p className="text-yellow-300">
                    Withdrawing LP tokens will stop earning rewards. Consider claiming your rewards first.
                  </p>
                </div>
              </div>
            </div>

            {/* Lost Rewards Estimate */}
            {amount && parseFloat(amount) > 0 && !error && (
              <Card className="bg-red-500/10 border-red-500/20">
                <CardContent className="p-4">
                  <h4 className="text-red-300 font-medium mb-2">Lost Weekly Rewards</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">KSWAP Rewards:</span>
                      <span className="text-red-400">
                        -{formatTokenAmount(parseFloat(amount) * 0.1, 4)} KSWAP
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Trading Fees:</span>
                      <span className="text-red-400">
                        -{formatTokenAmount(parseFloat(amount) * 0.05, 4)} {pairName}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleClose}
                disabled={isUnstaking}
                className="flex-1 bg-stone-700 hover:bg-stone-600 text-white border-amber-500/30"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUnstake}
                disabled={isUnstaking || !amount || parseFloat(amount) <= 0 || !!error}
                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
              >
                {isUnstaking ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Withdrawing...
                  </div>
                ) : (
                  <>
                    <Minus className="w-4 h-4 mr-2" />
                    Withdraw LP Tokens
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
