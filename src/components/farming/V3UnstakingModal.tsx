'use client'

import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Zap, ArrowDownCircle } from 'lucide-react'
import { useV3Staking } from '@/hooks/v3/useV3Staking'
import type { V3Incentive } from '@/services/dex/v3-staking-types'

interface V3UnstakingModalProps {
    isOpen: boolean;
    onClose: () => void;
    incentive: V3Incentive;
    tokenId: bigint;
    onUnstakeComplete: () => void;
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

export default function V3UnstakingModal({
    isOpen,
    onClose,
    incentive,
    tokenId,
    onUnstakeComplete,
}: V3UnstakingModalProps) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [txStatus, setTxStatus] = useState<'idle' | 'unstaking' | 'withdrawing' | 'success' | 'error'>('idle')
    const [txHashes, setTxHashes] = useState<{ unstakeHash?: string; withdrawHash?: string }>({})
    const [error, setError] = useState<string | null>(null)
    const [pendingReward, setPendingReward] = useState<bigint | null>(null)
    const [manualTokenIdInput, setManualTokenIdInput] = useState('')

    const { unstakeAndWithdraw, getPositionReward } = useV3Staking()

    const token0Symbol = incentive.poolToken0Symbol || 'Token0'
    const token1Symbol = incentive.poolToken1Symbol || 'Token1'
    const rewardSymbol = incentive.rewardTokenSymbol || 'KSWAP'
    const rewardDecimals = incentive.rewardTokenDecimals || 18
    const pairName = `${token0Symbol}/${token1Symbol}`

    // Determine the effective tokenId: use prop if set, otherwise use manual input
    const hasKnownTokenId = tokenId > 0n
    const effectiveTokenId = hasKnownTokenId
        ? tokenId
        : (manualTokenIdInput && manualTokenIdInput !== '0' ? BigInt(manualTokenIdInput) : 0n)

    // Fetch pending reward when modal opens and we have a valid tokenId
    React.useEffect(() => {
        if (isOpen && effectiveTokenId > 0n) {
            getPositionReward(incentive.key, effectiveTokenId)
                .then(({ reward }) => setPendingReward(reward))
                .catch(() => setPendingReward(null))
        } else {
            setPendingReward(null)
        }
    }, [isOpen, effectiveTokenId, incentive.key, getPositionReward])

    const handleManualTokenIdChange = useCallback((value: string) => {
        if (value === '' || /^\d+$/.test(value)) {
            setManualTokenIdInput(value)
            setError(null)
        }
    }, [])

    const handleUnstake = useCallback(async () => {
        if (effectiveTokenId === 0n) {
            setError('Please enter a valid token ID')
            return
        }

        try {
            setIsProcessing(true)
            setError(null)
            setTxStatus('unstaking')

            const result = await unstakeAndWithdraw(incentive.key, effectiveTokenId)

            setTxHashes({ unstakeHash: result.unstakeHash, withdrawHash: result.withdrawHash })
            setTxStatus('success')
            onUnstakeComplete()
        } catch (err) {
            setTxStatus('error')
            setError(err instanceof Error ? err.message : 'Failed to unstake position')
        } finally {
            setIsProcessing(false)
        }
    }, [incentive.key, effectiveTokenId, unstakeAndWithdraw, onUnstakeComplete])

    const handleClose = useCallback(() => {
        if (!isProcessing) {
            setError(null)
            setTxStatus('idle')
            setTxHashes({})
            setPendingReward(null)
            setManualTokenIdInput('')
            onClose()
        }
    }, [isProcessing, onClose])

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                className="!bg-stone-900 !border-amber-500/30 text-white max-w-md"
                style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Unstake V3 Position</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Unstake your position and withdraw the NFT back to your wallet.
                    </DialogDescription>
                </DialogHeader>

                {txStatus === 'success' ? (
                    /* Success State */
                    <div className="space-y-4 py-4">
                        <div className="text-center">
                            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">Position Unstaked!</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Your V3 position has been unstaked and withdrawn to your wallet.
                                Accumulated rewards are now available to claim.
                            </p>
                            {txHashes.unstakeHash && (
                                <div className="bg-stone-800/50 rounded-lg p-3 mb-2">
                                    <p className="text-xs text-gray-400 mb-1">Unstake Tx:</p>
                                    <p className="text-xs font-mono text-amber-400 break-all">{txHashes.unstakeHash}</p>
                                </div>
                            )}
                            {txHashes.withdrawHash && (
                                <div className="bg-stone-800/50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 mb-1">Withdraw Tx:</p>
                                    <p className="text-xs font-mono text-amber-400 break-all">{txHashes.withdrawHash}</p>
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={handleClose}
                            className="w-full continue-button"
                        >
                            Close
                        </Button>
                    </div>
                ) : (
                    /* Confirmation State */
                    <div className="space-y-4">
                        {/* Position Info */}
                        <Card className="bg-stone-800/80 border-amber-500/30">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <Zap className="w-5 h-5 text-purple-400" />
                                    <span className="font-semibold text-white">{pairName} Farm</span>
                                </div>
                                <div className="space-y-2 text-sm">
                                    {hasKnownTokenId ? (
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Position Token ID:</span>
                                            <span className="text-white font-mono">#{tokenId.toString()}</span>
                                        </div>
                                    ) : null}
                                    {pendingReward !== null && effectiveTokenId > 0n && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Pending Rewards:</span>
                                            <span className="text-amber-400 font-semibold">
                                                {formatRewardAmount(pendingReward, rewardDecimals)} {rewardSymbol}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Manual token ID input when tokenId is not known */}
                        {!hasKnownTokenId && (
                            <div className="space-y-2">
                                <Label htmlFor="unstake-token-id" className="text-gray-300">
                                    Staked Position Token ID
                                </Label>
                                <Input
                                    id="unstake-token-id"
                                    type="text"
                                    value={manualTokenIdInput}
                                    onChange={(e) => handleManualTokenIdChange(e.target.value)}
                                    placeholder="Enter your staked position token ID"
                                    className="bg-stone-800 border-amber-500/30 text-white"
                                    disabled={isProcessing}
                                />
                                <p className="text-xs text-gray-500">
                                    Enter the token ID of the position you staked in this incentive.
                                </p>
                            </div>
                        )}

                        {/* Info notice */}
                        <div className="flex items-start gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                            <ArrowDownCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                            <p className="text-purple-300 text-sm">
                                Unstaking will stop reward accumulation. Accumulated rewards will be available to claim separately.
                            </p>
                        </div>

                        {/* Error Display */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {txStatus === 'unstaking' && (
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                <p className="text-amber-400 text-sm">Unstaking position from incentive...</p>
                            </div>
                        )}
                        {txStatus === 'withdrawing' && (
                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                <p className="text-amber-400 text-sm">Withdrawing NFT to your wallet...</p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-2">
                            <Button
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="flex-1 bg-stone-700 hover:bg-stone-600 text-white border-amber-500/30"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleUnstake}
                                disabled={isProcessing || effectiveTokenId === 0n}
                                className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Processing...
                                    </div>
                                ) : (
                                    'Unstake & Withdraw'
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
