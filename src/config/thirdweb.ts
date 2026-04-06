/**
 * Thirdweb SDK Configuration
 *
 * Configures Thirdweb client, custom chain definitions for KalyChain,
 * and in-app wallet with supported auth methods.
 */

import { createThirdwebClient, defineChain } from 'thirdweb'
import { inAppWallet, createWallet } from 'thirdweb/wallets'
import { CHAIN_IDS, RPC_URLS } from './chains'

// ============================================================================
// THIRDWEB CLIENT
// ============================================================================

export const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
})

// ============================================================================
// THIRDWEB CHAIN DEFINITIONS (separate from Viem chain definitions in chains.ts)
// ============================================================================

export const twKalychain = defineChain({
  id: CHAIN_IDS.KALYCHAIN,
  rpc: RPC_URLS[CHAIN_IDS.KALYCHAIN],
})

export const twKalychainTestnet = defineChain({
  id: CHAIN_IDS.KALYCHAIN_TESTNET,
  rpc: RPC_URLS[CHAIN_IDS.KALYCHAIN_TESTNET],
})

export const twArbitrum = defineChain({
  id: CHAIN_IDS.ARBITRUM,
  rpc: RPC_URLS[CHAIN_IDS.ARBITRUM],
})

export const twBsc = defineChain({
  id: CHAIN_IDS.BSC,
  rpc: RPC_URLS[CHAIN_IDS.BSC],
})

export const twClisha = defineChain({
  id: CHAIN_IDS.CLISHA,
  rpc: RPC_URLS[CHAIN_IDS.CLISHA],
})

export const thirdwebChains = [
  twKalychain,
  twKalychainTestnet,
  twArbitrum,
  twBsc,
  twClisha,
]

// ============================================================================
// WALLET CONFIGURATION
// ============================================================================

/** Thirdweb in-app wallet with all supported auth methods */
export const kalyswapInAppWallet = inAppWallet({
  auth: {
    options: [
      'email',
      'google',
      'apple',
      'passkey',
      'phone',
      'discord',
      'facebook',
    ],
    mode: 'popup',
  },
})

/** External wallets supported via Thirdweb */
export const externalWallets = [
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('io.rabby'),
  createWallet('app.phantom'),
]

/** All wallets: in-app first, then external */
export const allWallets = [
  kalyswapInAppWallet,
  ...externalWallets,
  createWallet('walletConnect'),
]
