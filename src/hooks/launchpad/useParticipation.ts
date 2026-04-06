import { launchpadLogger } from '@/lib/logger';
import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { PRESALE_ABI, FAIRLAUNCH_ABI, PRESALE_V3_ABI, FAIRLAUNCH_V3_ABI, ERC20_ABI } from '@/config/abis'
import { isNativeToken } from '@/config/contracts'

interface ParticipationParams {
  contractAddress: string
  projectType: 'presale' | 'fairlaunch'
  amount: string
  baseToken: string
  dexVersion?: 'v2' | 'v3'
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
  claimTokens: (contractAddress: string, projectType: string, dexVersion?: string) => Promise<void>
  claimRefund: (contractAddress: string, projectType: string, dexVersion?: string) => Promise<void>
  fetchUserContribution: (contractAddress: string, projectType: string, isProjectFinalized?: boolean, dexVersion?: string) => Promise<void>
  
  // Validation
  canParticipate: (amount: string, contractAddress: string) => Promise<{ canParticipate: boolean; reason?: string }>
  getContributionLimits: (contractAddress: string, projectType: string, dexVersion?: string) => Promise<{ min: string; max: string }>
}

export function useParticipation(): UseParticipationReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [userContribution, setUserContribution] = useState<UserContribution | null>(null)

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Get appropriate ABI based on project type and dex version
  const getContractABI = (projectType: string, dexVersion?: string) => {
    if (dexVersion === 'v3') {
      return projectType === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI
    }
    return projectType === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI
  }

  // Execute contract call via standard Wagmi writeContract
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
  }, [isConnected, address, walletClient])

  // Participate in presale/fairlaunch
  const participate = useCallback(async (params: ParticipationParams) => {
    setIsLoading(true)
    setError(null)
    setTransactionHash(null)

    try {
      const { contractAddress, projectType, amount, baseToken, dexVersion } = params
      const abi = getContractABI(projectType, dexVersion)
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
  const claimTokens = useCallback(async (contractAddress: string, projectType: string, dexVersion?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType, dexVersion)
      
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
  const claimRefund = useCallback(async (contractAddress: string, projectType: string, dexVersion?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType, dexVersion)
      
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
  const fetchUserContribution = useCallback(async (contractAddress: string, projectType: string, isProjectFinalized: boolean = false, dexVersion?: string) => {
    if (!address || !publicClient) return

    try {
      const abi = getContractABI(projectType, dexVersion)

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
  const getContributionLimits = useCallback(async (contractAddress: string, projectType: string, dexVersion?: string): Promise<{ min: string; max: string }> => {
    if (!publicClient) {
      return { min: '0.1', max: '10' } // Default limits
    }

    try {
      const abi = getContractABI(projectType, dexVersion)

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
