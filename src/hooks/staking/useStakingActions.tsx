import { stakingLogger } from '@/lib/logger';
/**
 * Staking Action Hooks
 * 
 * Write hooks for executing staking contract transactions
 * Integrated with KalySwap v3 wallet system and toast notifications
 */

import { useState, useCallback } from 'react'
import { parseEther } from 'viem'
import { useWallet } from '@/hooks/useWallet'
import { useAccount } from 'wagmi'
import { STAKING_CONTRACT, STAKING_FUNCTIONS } from '@/config/contracts/staking'
import { parseKLCAmount, validateStakeAmount } from '@/utils/staking/mathHelpers'
import {
  encodeStakeCall,
  encodeWithdrawCall,
  encodeClaimRewardCall,
  encodeExitCall,
  createStakingTransaction
} from '@/utils/staking/contractHelpers'
import { useToast } from '@/components/ui/toast'
import { internalWalletUtils } from '@/connectors/internalWallet'

// Helper function to check if using internal wallet
const isUsingInternalWallet = (connector: any) => {
  return connector?.id === 'kalyswap-internal';
};

// Helper function to prompt for password (same as swaps page)
const promptForPassword = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
        <p class="text-sm text-gray-600 mb-4">Enter your internal wallet password to authorize this staking transaction.</p>
        <input
          type="password"
          placeholder="Enter your wallet password"
          class="w-full p-3 border rounded-lg mb-4 password-input"
          autofocus
        />
        <div class="flex gap-2">
          <button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg confirm-btn">Confirm</button>
          <button class="flex-1 px-4 py-2 bg-gray-200 rounded-lg cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    const passwordInput = modal.querySelector('.password-input') as HTMLInputElement;
    const confirmBtn = modal.querySelector('.confirm-btn') as HTMLButtonElement;
    const cancelBtn = modal.querySelector('.cancel-btn') as HTMLButtonElement;

    const handleConfirm = () => {
      const password = passwordInput.value;
      document.body.removeChild(modal);
      resolve(password || null);
    };

    const handleCancel = () => {
      document.body.removeChild(modal);
      resolve(null);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleConfirm();
    });

    document.body.appendChild(modal);
  });
};

/**
 * Hook for staking KLC tokens
 */
export function useStakeKLC() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const { connector } = useAccount()
  const toast = useToast()

  const stakeKLC = useCallback(async (amount: string) => {
    if (!address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Validate amount
      const amountWei = parseKLCAmount(amount)
      if (amountWei === BigInt(0)) {
        throw new Error('Invalid stake amount')
      }

      stakingLogger.debug('🥩 Staking KLC:', {
        amount,
        amountWei: amountWei.toString(),
        isInternal: isUsingInternalWallet(connector),
        contractAddress: STAKING_CONTRACT.address
      })

      let txHash: string;

      if (isUsingInternalWallet(connector)) {
        // For internal wallets, use direct GraphQL call (same as swaps page)
        const internalWalletState = internalWalletUtils.getState();
        if (!internalWalletState.activeWallet) {
          throw new Error('No internal wallet connected');
        }

        // Get password from user
        const password = await promptForPassword();
        if (!password) {
          throw new Error('Password required for staking transaction');
        }

        // Encode the stake function call
        const functionData = encodeStakeCall();

        // Make GraphQL call to backend
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('Authentication required');
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
                toAddress: STAKING_CONTRACT.address,
                value: amountWei.toString(),
                data: functionData,
                password: password,
                chainId: internalWalletState.activeWallet.chainId,
                gasLimit: '300000'
              }
            }
          }),
        });

        const result = await response.json();
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        txHash = result.data.sendContractTransaction.hash;
      } else {
        // For external wallets, use the existing signTransaction method
        if (!signTransaction) {
          throw new Error('External wallet not available for transaction signing');
        }

        const functionData = encodeStakeCall()
        const transaction = createStakingTransaction(functionData, amountWei)
        txHash = await signTransaction(transaction)
      }

      toast.success('Stake Transaction Sent', `Staking ${amount} KLC tokens...`)

      stakingLogger.debug('✅ Stake transaction sent:', txHash)
      return txHash

    } catch (err) {
      stakingLogger.error('❌ Stake failed - Full error:', err)
      stakingLogger.error('❌ Error type:', typeof err)
      stakingLogger.error('❌ Error message:', err instanceof Error ? err.message : 'Unknown error')
      stakingLogger.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack trace')

      const errorMessage = err instanceof Error ? err.message : 'Failed to stake KLC'
      setError(errorMessage)

      // More specific error messages based on common issues
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
        toast.error('Insufficient Funds', 'You do not have enough KLC for this transaction')
      } else if (errorMessage.includes('user rejected') || errorMessage.includes('denied')) {
        toast.error('Transaction Cancelled', 'You cancelled the transaction')
      } else if (errorMessage.includes('Wallet not connected')) {
        toast.error('Wallet Error', 'Please reconnect your wallet and try again')
      } else if (errorMessage.includes('gas')) {
        toast.error('Gas Error', 'Transaction failed due to gas issues. Please try again.')
      } else {
        toast.error('Stake Failed', errorMessage)
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address, connector])

  return {
    stakeKLC,
    isLoading,
    error,
  }
}

/**
 * Hook for withdrawing staked KLC tokens
 */
export function useWithdrawKLC() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const withdrawKLC = useCallback(async (amount: string) => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Validate amount
      const amountWei = parseKLCAmount(amount)
      if (amountWei === BigInt(0)) {
        throw new Error('Invalid withdrawal amount')
      }

      // Create withdraw transaction
      const functionData = encodeWithdrawCall(amountWei)
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('💰 Withdrawing KLC:', { amount, amountWei: amountWei.toString() })

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Withdrawal Transaction Sent', `Withdrawing ${amount} KLC tokens...`)

      stakingLogger.debug('✅ Withdrawal transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to withdraw KLC'
      setError(errorMessage)
      
      toast.error('Withdrawal Failed', errorMessage)
      
      stakingLogger.error('❌ Withdrawal failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    withdrawKLC,
    isLoading,
    error,
  }
}

/**
 * Hook for claiming earned rewards
 */
export function useClaimRewards() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const claimRewards = useCallback(async () => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Create claim rewards transaction
      const functionData = encodeClaimRewardCall()
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('🎁 Claiming rewards...')

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Claim Transaction Sent', 'Claiming your staking rewards...')

      stakingLogger.debug('✅ Claim transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim rewards'
      setError(errorMessage)
      
      toast.error('Claim Failed', errorMessage)
      
      stakingLogger.error('❌ Claim failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    claimRewards,
    isLoading,
    error,
  }
}

/**
 * Hook for emergency exit (withdraw all + claim rewards)
 */
export function useExitStaking() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const exitStaking = useCallback(async () => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Create exit transaction
      const functionData = encodeExitCall()
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('🚪 Exiting staking (withdraw all + claim)...')

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Exit Transaction Sent', 'Withdrawing all staked KLC and claiming rewards...')

      stakingLogger.debug('✅ Exit transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exit staking'
      setError(errorMessage)
      
      toast.error('Exit Failed', errorMessage)
      
      stakingLogger.error('❌ Exit failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    exitStaking,
    isLoading,
    error,
  }
}

/**
 * Comprehensive staking actions hook
 * Combines all staking actions with validation
 */
export function useStakingActions() {
  const { stakeKLC, isLoading: stakeLoading, error: stakeError } = useStakeKLC()
  const { withdrawKLC, isLoading: withdrawLoading, error: withdrawError } = useWithdrawKLC()
  const { claimRewards, isLoading: claimLoading, error: claimError } = useClaimRewards()
  const { exitStaking, isLoading: exitLoading, error: exitError } = useExitStaking()

  const isLoading = stakeLoading || withdrawLoading || claimLoading || exitLoading
  const error = stakeError || withdrawError || claimError || exitError

  return {
    // Actions
    stakeKLC,
    withdrawKLC,
    claimRewards,
    exitStaking,
    
    // States
    isLoading,
    error,
    
    // Individual loading states
    stakeLoading,
    withdrawLoading,
    claimLoading,
    exitLoading,
  }
}
