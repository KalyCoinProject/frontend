/**
 * Thirdweb-to-Wagmi Bridge
 *
 * When a user connects via Thirdweb's ConnectButton (especially in-app wallets),
 * Wagmi doesn't know about it. This bridge watches Thirdweb's active wallet and
 * creates a Wagmi connector from its EIP1193 provider, so all existing Wagmi hooks
 * (useAccount, useSendTransaction, useWalletClient) work transparently.
 *
 * Also handles chain switching — when the user switches chains in Thirdweb's UI,
 * the bridge recreates the Wagmi connector with a new EIP1193 provider for that chain.
 */

'use client'

import { useEffect, useRef } from 'react'
import { useActiveWallet, useActiveAccount, useActiveWalletChain } from 'thirdweb/react'
import { useConnect, useDisconnect, useAccount, createConnector } from 'wagmi'
import { EIP1193 } from 'thirdweb/wallets'
import { thirdwebClient, twKalychain, thirdwebChains } from '@/config/thirdweb'
import { supportedChains } from '@/config/chains'
import { walletLogger } from '@/lib/logger'
import type { EIP1193Provider } from 'viem'
import type { Chain as ThirdwebChain } from 'thirdweb'

/**
 * Creates a Wagmi connector wrapping a Thirdweb EIP1193 provider.
 * The provider handles transaction signing, chain RPCs, etc.
 */
function createThirdwebWagmiConnector(
  getProvider: () => EIP1193Provider,
) {
  return createConnector(() => ({
    id: 'thirdweb-inapp',
    name: 'KalySwap Wallet',
    type: 'thirdweb',

    async connect(_params?: any) {
      const provider = getProvider()
      const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
      const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string
      const chainId = parseInt(chainIdHex, 16)
      return { accounts: accounts as `0x${string}`[], chainId } as any
    },

    async disconnect() {},

    async getAccounts() {
      const accounts = await getProvider().request({ method: 'eth_accounts' }) as string[]
      return accounts as `0x${string}`[]
    },

    async getChainId() {
      const chainIdHex = await getProvider().request({ method: 'eth_chainId' }) as string
      return parseInt(chainIdHex, 16)
    },

    async getProvider() {
      return getProvider()
    },

    async isAuthorized() {
      const accounts = await getProvider().request({ method: 'eth_accounts' }) as string[]
      return accounts.length > 0
    },

    async switchChain({ chainId }: { chainId: number }) {
      // Thirdweb's EIP1193 provider handles the actual chain switch
      await getProvider().request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      })
      const chain = supportedChains.find(c => c.id === chainId) || supportedChains[0]
      return chain
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onConnect() {},
    onDisconnect() {},
    onMessage() {},
  }))
}

/**
 * Hook that bridges Thirdweb wallet state into Wagmi.
 * Must be rendered inside both ThirdwebProvider and WagmiProvider.
 */
export function useThirdwebWagmiBridge() {
  const thirdwebWallet = useActiveWallet()
  const thirdwebAccount = useActiveAccount()
  const thirdwebChain = useActiveWalletChain()
  const { connect } = useConnect()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const { address: wagmiAddress, isConnected: wagmiConnected, connector: wagmiConnector } = useAccount()
  const lastSyncedAddress = useRef<string | null>(null)
  const lastSyncedChainId = useRef<number | null>(null)
  const isSyncing = useRef(false)
  // Keep a mutable ref to the current provider so the connector always uses the latest
  const providerRef = useRef<EIP1193Provider | null>(null)

  // Helper to create/update the EIP1193 provider for the current chain
  function updateProvider(wallet: any, chain: ThirdwebChain) {
    providerRef.current = EIP1193.toProvider({
      wallet,
      chain,
      client: thirdwebClient,
    }) as EIP1193Provider
  }

  useEffect(() => {
    if (isSyncing.current) return

    // Case 1: Thirdweb wallet connected — sync to Wagmi
    if (thirdwebWallet && thirdwebAccount?.address) {
      const twAddress = thirdwebAccount.address.toLowerCase()
      const twChainId = thirdwebChain?.id || twKalychain.id

      // Check if we need to sync (new address or chain changed)
      const addressChanged = lastSyncedAddress.current !== twAddress
      const chainChanged = lastSyncedChainId.current !== null && lastSyncedChainId.current !== twChainId

      // Skip if already synced with same address and chain
      if (!addressChanged && !chainChanged) return

      // If Wagmi already has this exact address+chain (e.g. MetaMask direct)
      if (wagmiConnected && wagmiAddress?.toLowerCase() === twAddress && !chainChanged && wagmiConnector?.id !== 'thirdweb-inapp') {
        lastSyncedAddress.current = twAddress
        lastSyncedChainId.current = twChainId
        return
      }

      isSyncing.current = true

      // Find the thirdweb chain definition for the target chain
      const targetChain = thirdwebChains.find(c => c.id === twChainId) || twKalychain

      // Create/update the EIP1193 provider
      updateProvider(thirdwebWallet, targetChain)

      // Create connector with a getter that always returns the latest provider
      const connector = createThirdwebWagmiConnector(() => providerRef.current!)

      connect(
        { connector },
        {
          onSuccess: () => {
            lastSyncedAddress.current = twAddress
            lastSyncedChainId.current = twChainId
            isSyncing.current = false
            walletLogger.debug('Thirdweb wallet synced to Wagmi:', twAddress, 'chain:', twChainId)
          },
          onError: (error) => {
            isSyncing.current = false
            walletLogger.debug('Thirdweb-Wagmi bridge failed:', error)
          },
        }
      )
    }

    // Case 2: Thirdweb disconnected — unsync from Wagmi
    if (!thirdwebAccount && lastSyncedAddress.current) {
      if (wagmiConnected && wagmiConnector?.id === 'thirdweb-inapp') {
        wagmiDisconnect()
        lastSyncedAddress.current = null
        lastSyncedChainId.current = null
        providerRef.current = null
      }
    }
  }, [
    thirdwebWallet,
    thirdwebAccount?.address,
    thirdwebChain?.id,
    wagmiAddress,
    wagmiConnected,
    wagmiConnector?.id,
    connect,
    wagmiDisconnect,
  ])
}
