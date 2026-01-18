'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  CheckCircle,
  XCircle,
  DollarSign,
  Lock,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useWallet } from '@/hooks/useWallet'
import { useAccount, useWalletClient } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { PRESALE_ABI, FAIRLAUNCH_ABI } from '@/config/abis'
import { internalWalletUtils } from '@/connectors/internalWallet'
import { launchpadLogger } from '@/lib/logger'

interface ProjectOwnerControlsProps {
  projectData: ProjectData
  onRefresh: () => void
}

export default function ProjectOwnerControls({ 
  projectData, 
  onRefresh 
}: ProjectOwnerControlsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const { isConnected, address } = useWallet()
  const { address: wagmiAddress, connector } = useAccount()
  const { data: walletClient } = useWalletClient()

  // Check if connected wallet is the project owner
  const isOwner = isConnected && address && projectData.owner &&
    address.toLowerCase() === projectData.owner.toLowerCase()

  // Don't render if user is not the owner
  if (!isOwner) {
    return null
  }

  // Execute contract call with support for both wallet types
  const executeContractCall = useCallback(async (
    contractAddress: string,
    abi: any,
    functionName: string,
    args: any[] = []
  ): Promise<string> => {
    if (!isConnected || !wagmiAddress) {
      throw new Error('Wallet not connected')
    }

    // Check if using internal wallet
    if (connector?.id === 'internal') {
      // Internal wallet flow
      const internalWalletState = internalWalletUtils.getState()
      if (!internalWalletState.activeWallet) {
        throw new Error('No active internal wallet')
      }

      const password = prompt('Enter your wallet password to finalize the project:')
      if (!password) {
        throw new Error('Password required for transaction')
      }

      const functionData = encodeFunctionData({
        abi,
        functionName,
        args
      })

      const token = localStorage.getItem('authToken')
      if (!token) {
        throw new Error('Authentication required')
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation SendContractTransaction($input: SendContractTransactionInput!) {
              sendContractTransaction(input: $input) {
                id
                hash
                status
              }
            }
          `,
          variables: {
            input: {
              walletId: internalWalletState.activeWallet.id,
              toAddress: contractAddress,
              value: '0',
              data: functionData,
              password: password,
              chainId: internalWalletState.activeWallet.chainId,
              gasLimit: '5000000' // 5M gas limit like the working test script
            }
          }
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      return result.data.sendContractTransaction.hash
    } else {
      // External wallet flow
      if (!walletClient) {
        throw new Error('Wallet client not available')
      }

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi,
        functionName,
        args,
        gas: BigInt(5000000), // 5M gas limit like the working test script
        maxFeePerGas: BigInt(30000000000), // 30 gwei
        maxPriorityFeePerGas: BigInt(3000000000), // 3 gwei
      })

      return hash
    }
  }, [isConnected, wagmiAddress, connector, walletClient])

  const handleFinalize = async () => {
    setIsLoading(true)
    setLoadingAction('finalize')
    try {
      if (!projectData.contractAddress) {
        throw new Error('Contract address not available')
      }

      const abi = projectData.type === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI

      const hash = await executeContractCall(
        projectData.contractAddress,
        abi,
        'finalize',
        []
      )

      launchpadLogger.debug('Finalize transaction hash:', hash)

      // Wait a moment for transaction to be mined, then refresh
      setTimeout(() => {
        onRefresh()
      }, 3000)

    } catch (error) {
      launchpadLogger.error('Finalize failed:', error)
      alert(`Finalize failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
      setLoadingAction(null)
    }
  }

  const handleCancel = async () => {
    setIsLoading(true)
    setLoadingAction('cancel')
    try {
      // TODO: Implement cancel contract call
      launchpadLogger.debug('Cancelling project:', projectData.contractAddress)
      // Placeholder for actual implementation
      await new Promise(resolve => setTimeout(resolve, 2000))
      onRefresh()
    } catch (error) {
      launchpadLogger.error('Cancel failed:', error)
    } finally {
      setIsLoading(false)
      setLoadingAction(null)
    }
  }

  const handleWithdrawFunds = async () => {
    setIsLoading(true)
    setLoadingAction('withdraw')
    try {
      if (!projectData.contractAddress) {
        throw new Error('Contract address not available')
      }

      const abi = projectData.type === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI

      const functionName = projectData.type === 'presale' ? 'withdrawRemainingFunds' : 'withdrawRemainingTokens'

      const hash = await executeContractCall(
        projectData.contractAddress,
        abi,
        functionName,
        []
      )

      launchpadLogger.debug('Withdraw funds transaction hash:', hash)

      // Wait a moment for transaction to be mined, then refresh
      setTimeout(() => {
        onRefresh()
      }, 3000)

    } catch (error) {
      launchpadLogger.error('Withdraw failed:', error)
      alert(`Withdraw failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
      setLoadingAction(null)
    }
  }

  const handleWithdrawLP = async () => {
    setIsLoading(true)
    setLoadingAction('withdrawLP')
    try {
      if (!projectData.contractAddress) {
        throw new Error('Contract address not available')
      }

      const abi = projectData.type === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI

      const hash = await executeContractCall(
        projectData.contractAddress,
        abi,
        'withdrawLPTokens',
        []
      )

      launchpadLogger.debug('Withdraw LP tokens transaction hash:', hash)

      // Wait a moment for transaction to be mined, then refresh
      setTimeout(() => {
        onRefresh()
      }, 3000)

    } catch (error) {
      launchpadLogger.error('Withdraw LP failed:', error)
      alert(`Withdraw LP failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
      setLoadingAction(null)
    }
  }

  // Determine available actions based on project status
  const canFinalize = projectData.status === 'Successful' && !projectData.finalized
  const canCancel = (projectData.status === 'Active' || projectData.status === 'Pending') && !projectData.cancelled
  const canWithdrawFunds = projectData.finalized && projectData.status === 'Successful'
  const canWithdrawLP = projectData.type === 'presale' && projectData.finalized && !projectData.lpTokensWithdrawn

  return (
    <Card className="bg-stone-900/50 border-red-500/30">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Project Owner Controls
          </span>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            OWNER ONLY
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          
          {/* Project Status Info */}
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <h4 className="font-medium text-white mb-2">Current Status</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <Badge className={
                  projectData.status === 'Active' ? 'bg-green-500/20 text-green-400' :
                  projectData.status === 'Successful' ? 'bg-blue-500/20 text-blue-400' :
                  projectData.status === 'Failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }>
                  {projectData.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Finalized:</span>
                <span className={projectData.finalized ? 'text-green-400' : 'text-red-400'}>
                  {projectData.finalized ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cancelled:</span>
                <span className={projectData.cancelled ? 'text-red-400' : 'text-green-400'}>
                  {projectData.cancelled ? 'Yes' : 'No'}
                </span>
              </div>
              {projectData.type === 'presale' && (
                <div className="flex justify-between">
                  <span className="text-gray-400">LP Withdrawn:</span>
                  <span className={projectData.lpTokensWithdrawn ? 'text-green-400' : 'text-red-400'}>
                    {projectData.lpTokensWithdrawn ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Finalize Button */}
            {canFinalize && (
              <Button
                onClick={handleFinalize}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {loadingAction === 'finalize' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finalizing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Finalize Project
                  </>
                )}
              </Button>
            )}

            {/* Cancel Button */}
            {canCancel && (
              <Button
                onClick={handleCancel}
                disabled={isLoading}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                {loadingAction === 'cancel' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Project
                  </>
                )}
              </Button>
            )}

            {/* Withdraw Funds Button */}
            {canWithdrawFunds && (
              <Button
                onClick={handleWithdrawFunds}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loadingAction === 'withdraw' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Withdrawing...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Withdraw Funds
                  </>
                )}
              </Button>
            )}

            {/* Withdraw LP Tokens Button */}
            {canWithdrawLP && (
              <Button
                onClick={handleWithdrawLP}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {loadingAction === 'withdrawLP' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Withdrawing...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Withdraw LP Tokens
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Warning Messages */}
          {!canFinalize && !canCancel && !canWithdrawFunds && !canWithdrawLP && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
              <div className="flex items-center text-yellow-400">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span className="text-sm">No actions available at this time.</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
