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

// [instrumentation — temporary; remove once form jank is resolved]
// Module-level counters so we can observe whether the bridge effect is
// cycling (and specifically whether the self-heal branch is firing on every
// render) without adding state that itself causes re-renders.
const __bridgeDebug = {
  effectRuns: 0,
  selfHealFires: 0,
  lastLog: 0,
}
function __bridgeThrottledLog(payload: Record<string, unknown>) {
  const now = Date.now()
  if (now - __bridgeDebug.lastLog < 1000) return
  __bridgeDebug.lastLog = now
  walletLogger.debug('[bridge-debug]', {
    effectRuns: __bridgeDebug.effectRuns,
    selfHealFires: __bridgeDebug.selfHealFires,
    ...payload,
  })
}

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
  // Pending retry timer for transient connect() failures (Thirdweb RPC hiccup,
  // rpc.kalychain.io drop, etc). Without this, a single fetch failure at mount
  // would leave wagmi permanently disconnected for the page until full reload.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryAttemptRef = useRef(0)

  // Helper to create/update the EIP1193 provider for the current chain
  function updateProvider(wallet: any, chain: ThirdwebChain) {
    providerRef.current = EIP1193.toProvider({
      wallet,
      chain,
      client: thirdwebClient,
    }) as EIP1193Provider
  }

  useEffect(() => {
    __bridgeDebug.effectRuns += 1
    __bridgeThrottledLog({
      wagmiConnected,
      wagmiAddress,
      isSyncing: isSyncing.current,
      lastSyncedAddress: lastSyncedAddress.current,
    })

    if (isSyncing.current) return

    // Case 1: Thirdweb wallet connected — sync to Wagmi
    if (thirdwebWallet && thirdwebAccount?.address) {
      const twAddress = thirdwebAccount.address.toLowerCase()
      const twChainId = thirdwebChain?.id || twKalychain.id

      // Check if we need to sync (new address or chain changed)
      const addressChanged = lastSyncedAddress.current !== twAddress
      const chainChanged = lastSyncedChainId.current !== null && lastSyncedChainId.current !== twChainId

      // Self-heal: detect when we previously synced but wagmi has since dropped
      // its connection entirely (HMR, strict-mode remount, internal wagmi reset,
      // provider glitch) while Thirdweb stayed connected. Without this, the
      // early return below would keep the bridge idle forever and the UI would
      // show "Connect Wallet" despite Thirdweb still being connected.
      //
      // Important: ONLY trigger on `!wagmiConnected`. Do NOT trigger on
      // `wagmiAddress !== twAddress` — during wagmi's multi-phase state update
      // right after connect() succeeds, `wagmiConnected` briefly flips true
      // before `wagmiAddress` populates, which would cause a false-positive
      // re-sync loop and mount-unmount the entire form.
      const wagmiDesynced =
        lastSyncedAddress.current !== null && !wagmiConnected

      // Skip if already synced with same address and chain AND wagmi agrees
      if (!addressChanged && !chainChanged && !wagmiDesynced) return

      // Re-sync path: clear refs so downstream logic treats this as a fresh sync
      if (wagmiDesynced) {
        __bridgeDebug.selfHealFires += 1
        walletLogger.debug('Thirdweb-Wagmi bridge: wagmi desync detected, re-syncing', {
          lastSynced: lastSyncedAddress.current,
          wagmiConnected,
          wagmiAddress,
          selfHealFires: __bridgeDebug.selfHealFires,
        })
        lastSyncedAddress.current = null
        lastSyncedChainId.current = null
      }

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

      const attemptConnect = () => {
        connect(
          { connector },
          {
            onSuccess: () => {
              lastSyncedAddress.current = twAddress
              lastSyncedChainId.current = twChainId
              isSyncing.current = false
              retryAttemptRef.current = 0
              if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current)
                retryTimerRef.current = null
              }
              walletLogger.debug('Thirdweb wallet synced to Wagmi:', twAddress, 'chain:', twChainId)
            },
            onError: (error) => {
              isSyncing.current = false
              const attempt = retryAttemptRef.current
              // Retry with backoff up to 5 times (1s, 2s, 4s, 8s, 16s).
              // Transient "Failed to fetch" on the Thirdweb / KalyChain RPC at
              // mount would otherwise leave every wagmi-gated UI stuck on
              // "Wallet Not Connected" for this page load.
              if (attempt < 5) {
                const delay = 1000 * Math.pow(2, attempt)
                retryAttemptRef.current = attempt + 1
                walletLogger.debug(
                  `Thirdweb-Wagmi bridge failed (attempt ${attempt + 1}/5), retrying in ${delay}ms:`,
                  error,
                )
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
                retryTimerRef.current = setTimeout(() => {
                  // Only retry if Thirdweb is still connected and we still
                  // have no wagmi session for this address+chain.
                  if (
                    thirdwebWallet &&
                    thirdwebAccount?.address?.toLowerCase() === twAddress &&
                    lastSyncedAddress.current !== twAddress &&
                    !isSyncing.current
                  ) {
                    isSyncing.current = true
                    updateProvider(thirdwebWallet, targetChain)
                    attemptConnect()
                  }
                }, delay)
              } else {
                retryAttemptRef.current = 0
                walletLogger.error('Thirdweb-Wagmi bridge failed after 5 retries:', error)
              }
            },
          },
        )
      }

      attemptConnect()
    }

    // Case 2: Thirdweb disconnected — unsync from Wagmi
    if (!thirdwebAccount && lastSyncedAddress.current) {
      if (wagmiConnected && wagmiConnector?.id === 'thirdweb-inapp') {
        wagmiDisconnect()
        lastSyncedAddress.current = null
        lastSyncedChainId.current = null
        providerRef.current = null
      }
      // If Thirdweb disconnects mid-retry, drop any pending sync timer.
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
        retryAttemptRef.current = 0
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

  // Unmount cleanup: cancel any in-flight retry timer.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [])
}
