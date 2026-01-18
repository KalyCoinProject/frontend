import { launchpadLogger } from '@/lib/logger';
import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEther, formatEther, encodeFunctionData } from 'viem'
import { PRESALE_ABI, FAIRLAUNCH_ABI, ERC20_ABI } from '@/config/abis'
import { isNativeToken } from '@/config/contracts'
import { internalWalletUtils } from '@/connectors/internalWallet'

interface ParticipationParams {
  contractAddress: string
  projectType: 'presale' | 'fairlaunch'
  amount: string
  baseToken: string
}

interface UserContribution {
  amount: string
  claimableTokens: string
  hasContributed: boolean
  canClaim: boolean
  canRefund: boolean
  hasClaimed: boolean
}

interface UseParticipationReturn {
  // State
  isLoading: boolean
  error: string | null
  transactionHash: string | null
  userContribution: UserContribution | null
  
  // Actions
  participate: (params: ParticipationParams) => Promise<void>
  claimTokens: (contractAddress: string, projectType: string) => Promise<void>
  claimRefund: (contractAddress: string, projectType: string) => Promise<void>
  fetchUserContribution: (contractAddress: string, projectType: string) => Promise<void>
  
  // Validation
  canParticipate: (amount: string, contractAddress: string) => Promise<{ canParticipate: boolean; reason?: string }>
  getContributionLimits: (contractAddress: string, projectType: string) => Promise<{ min: string; max: string }>
}

// Helper function to check if using internal wallet
function isUsingInternalWallet(connector: any): boolean {
  return connector?.id === 'internalWallet'
}

// Helper function to prompt for password
async function promptForPassword(): Promise<string | null> {
  return new Promise((resolve) => {
    const password = window.prompt('Enter your wallet password to confirm the transaction:')
    resolve(password)
  })
}

export function useParticipation(): UseParticipationReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [userContribution, setUserContribution] = useState<UserContribution | null>(null)

  const { address, isConnected, connector } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Get appropriate ABI based on project type
  const getContractABI = (projectType: string) => {
    return projectType === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI
  }

  // Execute contract call with support for both wallet types
  const executeContractCall = useCallback(async (
    contractAddress: string,
    abi: any,
    functionName: string,
    args: any[],
    value: string = '0'
  ): Promise<string> => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected')
    }

    if (isUsingInternalWallet(connector)) {
      // Internal wallet flow
      const internalWalletState = internalWalletUtils.getState()
      if (!internalWalletState.activeWallet) {
        throw new Error('No internal wallet connected')
      }

      const password = await promptForPassword()
      if (!password) {
        throw new Error('Password required for transaction')
      }

      const functionData = encodeFunctionData({
        abi,
        functionName,
        args,
      })

      const token = localStorage.getItem('auth_token')
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
              value,
              data: functionData,
              password: password,
              chainId: internalWalletState.activeWallet.chainId,
              gasLimit: '300000'
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
        value: value ? BigInt(value) : undefined,
        gas: BigInt(300000),
      })

      return hash
    }
  }, [isConnected, address, connector, walletClient])

  // Participate in presale/fairlaunch
  const participate = useCallback(async (params: ParticipationParams) => {
    setIsLoading(true)
    setError(null)
    setTransactionHash(null)

    try {
      const { contractAddress, projectType, amount, baseToken } = params
      const abi = getContractABI(projectType)
      const isNative = isNativeToken(baseToken)
      
      let value = '0'
      let args: any[] = []

      if (isNative) {
        // Native KLC contribution
        value = parseEther(amount).toString()
        args = [parseEther(amount)]
      } else {
        // ERC20 token contribution
        // First need to approve the token spending
        // TODO: Implement ERC20 approval flow
        args = [parseEther(amount)]
      }

      const hash = await executeContractCall(
        contractAddress,
        abi,
        'participate',
        args,
        value
      )

      setTransactionHash(hash)
      
      // Refresh user contribution data
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Participation failed:', err)
      setError(err instanceof Error ? err.message : 'Participation failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall])

  // Claim tokens after successful presale
  const claimTokens = useCallback(async (contractAddress: string, projectType: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType)
      
      const hash = await executeContractCall(
        contractAddress,
        abi,
        'claimTokens',
        []
      )

      setTransactionHash(hash)
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Claim failed:', err)
      setError(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall])

  // Claim refund for failed presale
  const claimRefund = useCallback(async (contractAddress: string, projectType: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType)
      
      const hash = await executeContractCall(
        contractAddress,
        abi,
        'claimRefund',
        []
      )

      setTransactionHash(hash)
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Refund failed:', err)
      setError(err instanceof Error ? err.message : 'Refund failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall])

  // Fetch user's contribution data
  const fetchUserContribution = useCallback(async (contractAddress: string, projectType: string, isProjectFinalized: boolean = false) => {
    if (!address || !publicClient) return

    try {
      const abi = getContractABI(projectType)

      // Read user's contribution amount using the correct function name
      let contributionAmount: bigint = 0n
      let tokenAllocation: bigint = 0n
      let hasClaimed: boolean = false

      if (projectType === 'presale') {
        // Presale contract returns struct: [baseContribution, tokenAllocation, claimed]
        const buyerInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'buyers',
          args: [address]
        }) as [bigint, bigint, boolean]

        contributionAmount = buyerInfo[0]
        tokenAllocation = buyerInfo[1]
        hasClaimed = buyerInfo[2]
      } else {
        // Fairlaunch contract returns struct: [baseContribution, tokenAllocation, claimed]
        const participantInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'participants',
          args: [address]
        }) as [bigint, bigint, boolean]

        contributionAmount = participantInfo[0]
        hasClaimed = participantInfo[2]

        // For fairlaunch, calculate token allocation using the contract's calculateTokenAmount function
        if (contributionAmount > 0n) {
          tokenAllocation = await publicClient.readContract({
            address: contractAddress as `0x${string}`,
            abi,
            functionName: 'calculateTokenAmount',
            args: [contributionAmount]
          }) as bigint
        } else {
          tokenAllocation = 0n
        }
      }

      // Use the token allocation we already retrieved as claimable tokens
      const claimableTokens = tokenAllocation > 0n ? formatEther(tokenAllocation) : '0'

      setUserContribution({
        amount: formatEther(contributionAmount),
        claimableTokens,
        hasContributed: contributionAmount > 0n,
        canClaim: parseFloat(claimableTokens) > 0 && !hasClaimed && isProjectFinalized,
        canRefund: false, // TODO: Implement refund eligibility check
        hasClaimed: hasClaimed
      })

    } catch (err) {
      launchpadLogger.error('Failed to fetch user contribution:', err)
    }
  }, [address, publicClient])

  // Validate if user can participate with given amount
  const canParticipate = useCallback(async (amount: string, contractAddress: string): Promise<{ canParticipate: boolean; reason?: string }> => {
    if (!address || !publicClient) {
      return { canParticipate: false, reason: 'Wallet not connected' }
    }

    try {
      // This would call the contract's canParticipate function if it exists
      // For now, return basic validation
      const numAmount = parseFloat(amount)
      if (numAmount <= 0) {
        return { canParticipate: false, reason: 'Amount must be greater than 0' }
      }

      return { canParticipate: true }
    } catch (err) {
      return { canParticipate: false, reason: 'Validation failed' }
    }
  }, [address, publicClient])

  // Get contribution limits from contract
  const getContributionLimits = useCallback(async (contractAddress: string, projectType: string): Promise<{ min: string; max: string }> => {
    if (!publicClient) {
      return { min: '0.1', max: '10' } // Default limits
    }

    try {
      const abi = getContractABI(projectType)

      if (projectType === 'presale') {
        // For presale contracts, use presaleInfo() function which returns a struct
        // Index 4 = raiseMin (minContribution), Index 5 = raiseMax (maxContribution)
        const presaleInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'presaleInfo',
          args: []
        }) as any[]

        const minContribution = presaleInfo[4] as bigint // raiseMin
        const maxContribution = presaleInfo[5] as bigint // raiseMax

        return {
          min: formatEther(minContribution),
          max: formatEther(maxContribution)
        }
      } else {
        // For fairlaunch contracts, use fairlaunchInfo() function
        const fairlaunchInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'fairlaunchInfo',
          args: []
        }) as any[]

        // Fairlaunch might not have explicit min/max limits, use reasonable defaults
        return { min: '0.1', max: '1000' }
      }
    } catch (err) {
      launchpadLogger.error('Failed to get contribution limits:', err)
      return { min: '0.1', max: '10' } // Fallback limits
    }
  }, [publicClient])

  return {
    isLoading,
    error,
    transactionHash,
    userContribution,
    participate,
    claimTokens,
    claimRefund,
    fetchUserContribution,
    canParticipate,
    getContributionLimits
  }
}
