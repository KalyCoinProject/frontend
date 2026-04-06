import { useState, useCallback, useEffect } from 'react'
import { walletLogger } from '@/lib/logger'

export type MigrationStep = 'idle' | 'linking' | 'reviewing' | 'password' | 'transferring' | 'complete' | 'error'

interface OldWallet {
  id: string
  address: string
  chainId: number
}

export interface WalletTokenBalance {
  symbol: string
  balance: string
  address: string
  formattedBalance: string
  decimals: number
  name: string
}

export interface WalletBalanceInfo {
  native: { symbol: string; balance: string; formattedBalance: string }
  tokens: WalletTokenBalance[]
}

interface MigrationState {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'OPTED_OUT'
  thirdwebWalletAddress: string | null
  oldWallets: OldWallet[]
  currentStep: MigrationStep
  error: string | null
  transferProgress: {
    nativeTransferred: boolean
    tokensTransferred: boolean
    txHashes: string[]
  }
}

async function graphqlRequest(query: string, variables?: Record<string, any>) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (!token) throw new Error('Not authenticated')

  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  const result = await response.json()
  if (result.errors) {
    throw new Error(result.errors[0].message)
  }
  return result.data
}

export function useMigration() {
  const [state, setState] = useState<MigrationState>({
    status: 'NOT_STARTED',
    thirdwebWalletAddress: null,
    oldWallets: [],
    currentStep: 'idle',
    error: null,
    transferProgress: {
      nativeTransferred: false,
      tokensTransferred: false,
      txHashes: [],
    },
  })

  const fetchMigrationStatus = useCallback(async () => {
    try {
      const data = await graphqlRequest(`
        query {
          walletMigrationStatus {
            thirdwebWalletAddress
            walletMigrationStatus
            walletMigratedAt
            wallets { id address chainId }
            walletMigrations {
              id oldWalletAddress newWalletAddress
              fundsTransferred tokensTransferred completedAt
            }
          }
        }
      `)

      if (data.walletMigrationStatus) {
        const ms = data.walletMigrationStatus
        setState(prev => ({
          ...prev,
          status: ms.walletMigrationStatus,
          thirdwebWalletAddress: ms.thirdwebWalletAddress,
          oldWallets: ms.wallets || [],
          transferProgress: {
            nativeTransferred: ms.walletMigrations?.some((m: any) => m.fundsTransferred) || false,
            tokensTransferred: ms.walletMigrations?.some((m: any) => m.tokensTransferred) || false,
            txHashes: prev.transferProgress.txHashes,
          },
        }))
      }
    } catch (error) {
      // User might not be logged in — silently ignore
      walletLogger.debug('Migration status fetch skipped:', error)
    }
  }, [])

  // Fetch migration status on mount
  useEffect(() => {
    fetchMigrationStatus()
  }, [fetchMigrationStatus])

  // Fetch balance for an old wallet
  const fetchWalletBalance = useCallback(async (address: string, chainId: number): Promise<WalletBalanceInfo | null> => {
    try {
      const data = await graphqlRequest(`
        query WalletBalance($address: String!, $chainId: Int!) {
          walletBalance(address: $address, chainId: $chainId) {
            native { symbol balance formattedBalance }
            tokens { symbol balance address formattedBalance decimals name }
          }
        }
      `, { address, chainId })
      return data.walletBalance
    } catch (error) {
      walletLogger.debug('Failed to fetch wallet balance:', error)
      return null
    }
  }, [])

  // Link a Thirdweb in-app wallet address to the user account
  const linkThirdwebWallet = useCallback(async (thirdwebAddress: string) => {
    setState(prev => ({ ...prev, currentStep: 'linking', error: null }))
    try {
      await graphqlRequest(
        `mutation LinkThirdwebWallet($thirdwebAddress: String!) {
          linkThirdwebWallet(thirdwebAddress: $thirdwebAddress) { success }
        }`,
        { thirdwebAddress }
      )
      setState(prev => ({
        ...prev,
        status: 'IN_PROGRESS',
        thirdwebWalletAddress: thirdwebAddress,
        currentStep: 'reviewing',
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Failed to link wallet',
      }))
    }
  }, [])

  // Start migration for a specific old wallet
  const startMigration = useCallback(async (oldWalletId: string, newWalletAddress: string) => {
    try {
      await graphqlRequest(
        `mutation StartMigration($oldWalletId: ID!, $newWalletAddress: String!) {
          startWalletMigration(oldWalletId: $oldWalletId, newWalletAddress: $newWalletAddress) {
            id oldWalletAddress newWalletAddress
          }
        }`,
        { oldWalletId, newWalletAddress }
      )
      setState(prev => ({ ...prev, currentStep: 'password' }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Failed to start migration',
      }))
    }
  }, [])

  // Transfer native tokens (reserves gas for pending ERC-20 transfers)
  const migrateNativeTokens = useCallback(async (password: string, toAddress: string, chainId?: number, reserveForTokenTransfers?: number) => {
    setState(prev => ({ ...prev, currentStep: 'transferring', error: null }))
    try {
      const data = await graphqlRequest(
        `mutation MigrateNative($password: String!, $toAddress: String!, $chainId: Int, $reserveForTokenTransfers: Int) {
          migrateNativeTokens(password: $password, toAddress: $toAddress, chainId: $chainId, reserveForTokenTransfers: $reserveForTokenTransfers) { txHash }
        }`,
        { password, toAddress, chainId, reserveForTokenTransfers }
      )
      setState(prev => ({
        ...prev,
        transferProgress: {
          ...prev.transferProgress,
          nativeTransferred: true,
          txHashes: [...prev.transferProgress.txHashes, data.migrateNativeTokens.txHash],
        },
      }))
      return data.migrateNativeTokens.txHash
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Failed to transfer native tokens',
      }))
      throw error
    }
  }, [])

  // Transfer ERC-20 tokens
  const migrateTokens = useCallback(async (
    password: string,
    toAddress: string,
    tokenAddresses: string[],
    chainId?: number
  ) => {
    try {
      const data = await graphqlRequest(
        `mutation MigrateTokens($password: String!, $toAddress: String!, $tokenAddresses: [String!]!, $chainId: Int) {
          migrateTokens(password: $password, toAddress: $toAddress, tokenAddresses: $tokenAddresses, chainId: $chainId) { txHashes }
        }`,
        { password, toAddress, tokenAddresses, chainId }
      )
      setState(prev => ({
        ...prev,
        transferProgress: {
          ...prev.transferProgress,
          tokensTransferred: true,
          txHashes: [...prev.transferProgress.txHashes, ...data.migrateTokens.txHashes],
        },
      }))
      return data.migrateTokens.txHashes
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Failed to transfer tokens',
      }))
      throw error
    }
  }, [])

  // Complete migration
  const completeMigration = useCallback(async () => {
    try {
      await graphqlRequest(`mutation { completeWalletMigration { success } }`)
      setState(prev => ({
        ...prev,
        status: 'COMPLETED',
        currentStep: 'complete',
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Failed to complete migration',
      }))
    }
  }, [])

  // Opt out of migration
  const optOut = useCallback(async () => {
    try {
      await graphqlRequest(`mutation { optOutWalletMigration { success } }`)
      setState(prev => ({ ...prev, status: 'OPTED_OUT', currentStep: 'idle' }))
    } catch (error) {
      walletLogger.error('Failed to opt out:', error)
    }
  }, [])

  const resetError = useCallback(() => {
    setState(prev => ({ ...prev, error: null, currentStep: 'reviewing' }))
  }, [])

  return {
    ...state,
    fetchMigrationStatus,
    fetchWalletBalance,
    linkThirdwebWallet,
    startMigration,
    migrateNativeTokens,
    migrateTokens,
    completeMigration,
    optOut,
    resetError,
    needsMigration: state.status === 'NOT_STARTED' && state.oldWallets.length > 0,
  }
}
