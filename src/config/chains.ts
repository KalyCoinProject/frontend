/**
 * Centralized Chain Configuration
 *
 * This is the SINGLE SOURCE OF TRUTH for all chain-related configuration.
 * All other files should import chain config from here.
 *
 * Includes:
 * - Viem chain definitions
 * - RPC URLs (with environment variable overrides)
 * - Explorer URLs and API endpoints
 * - Chain metadata (logos, names, symbols)
 * - Chain IDs as constants
 */

import { defineChain, type Chain } from 'viem'
import { arbitrum, bsc } from 'viem/chains'

// ============================================================================
// CHAIN IDs - Use these constants throughout the app
// ============================================================================
export const CHAIN_IDS = {
  KALYCHAIN: 3888,
  KALYCHAIN_TESTNET: 3889,
  CLISHA: 3890,
  ARBITRUM: 42161,
  BSC: 56,
} as const;

export type ChainIdValue = typeof CHAIN_IDS[keyof typeof CHAIN_IDS];

// ============================================================================
// VIEM CHAIN DEFINITIONS
// ============================================================================

// KalyChain Mainnet Configuration
export const kalychain = defineChain({
  id: 3888,
  name: 'KalyChain',
  nativeCurrency: {
    decimals: 18,
    name: 'KalyChain',
    symbol: 'KLC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.kalychain.io/rpc'],
    },
    public: {
      http: ['https://rpc.kalychain.io/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'KalyChain Explorer',
      url: 'https://kalyscan.io',
    },
  },
  contracts: {
    // Add multicall contract if available
    // multicall3: {
    //   address: '0x...',
    //   blockCreated: 0,
    // },
  },
  // Add custom icon for Rainbow Kit
  iconUrl: '/tokens/klc.png',
})

// KalyChain Testnet Configuration (for future use)
export const kalychainTestnet = defineChain({
  id: 3889, // Assuming testnet chain ID
  name: 'KalyChain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'KalyChain',
    symbol: 'KLC',
  },
  rpcUrls: {
    default: {
      http: ['https://testnetrpc.kalychain.io/rpc'],
    },
    public: {
      http: ['https://testnetrpc.kalychain.io/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'KalyChain Testnet Explorer',
      url: 'https://testnet.kalyscan.io', // Update with actual testnet explorer
    },
  },
  testnet: true,
  // Add custom icon for Rainbow Kit
  iconUrl: '/tokens/klc.png',
})

// Clisha Mainnet Configuration
export const clisha = defineChain({
  id: 3890,
  name: 'Clisha',
  nativeCurrency: {
    decimals: 18,
    name: 'clisha',
    symbol: 'CLISHA',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.clishachain.com/rpc'],
    },
    public: {
      http: ['https://rpc.clishachain.com/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ClishaExplorer',
      url: 'https://clishascan.com',
    },
  },
  contracts: {
    // Add multicall contract if available
    // multicall3: {
    //   address: '0x...',
    //   blockCreated: 0,
    // },
  },
  // Add custom icon for Rainbow Kit
  iconUrl: '/icons/clisha.png',
})

// Bridge-supported chains - Required for bridge functionality
export const supportedChains = [
  kalychain,
  kalychainTestnet, // Enabled for V3 testing
  arbitrum,
  bsc,
  clisha,
] as const

// Helper function to get chain by ID
export function getChainById(chainId: number) {
  return supportedChains.find(chain => chain.id === chainId)
}

// Helper function to check if chain is supported
export function isSupportedChain(chainId: number): boolean {
  return supportedChains.some(chain => chain.id === chainId)
}

// Default chain for the application
export const DEFAULT_CHAIN = kalychain

// Chain-specific configuration
export const CHAIN_CONFIG = {
  [kalychain.id]: {
    name: 'KalyChain',
    shortName: 'KLC',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null, // Add bridge URL when available
  },
  [arbitrum.id]: {
    name: 'Arbitrum One',
    shortName: 'ARB',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
  [bsc.id]: {
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
  [clisha.id]: {
    name: 'Clisha',
    shortName: 'CLISHA',
    isTestnet: false,
    faucetUrl: null,
    bridgeUrl: null,
  },
  [kalychainTestnet.id]: {
    name: 'KalyChain Testnet',
    shortName: 'KLC-T',
    isTestnet: true,
    faucetUrl: 'https://faucet.kalychain.io', // Update with actual faucet URL
    bridgeUrl: null,
  },
} as const

// Export types for TypeScript
export type SupportedChain = typeof supportedChains[number]
export type ChainId = SupportedChain['id']

// ============================================================================
// RPC URLS - With environment variable overrides for paid/unlimited nodes
// ============================================================================
export const RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.KALYCHAIN]: process.env.NEXT_PUBLIC_KALYCHAIN_RPC_URL || 'https://rpc.kalychain.io/rpc',
  [CHAIN_IDS.KALYCHAIN_TESTNET]: process.env.NEXT_PUBLIC_KALYCHAIN_TESTNET_RPC_URL || 'https://testnetrpc.kalychain.io/rpc',
  [CHAIN_IDS.ARBITRUM]: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  [CHAIN_IDS.BSC]: process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  [CHAIN_IDS.CLISHA]: process.env.NEXT_PUBLIC_CLISHA_RPC_URL || 'https://rpc.clishachain.com/rpc',
};

// ============================================================================
// CHAIN METADATA - Extended info for UI display
// ============================================================================
export interface ChainMetadata {
  name: string;
  shortName: string;
  symbol: string;
  logo: string;
  explorer: string;
  explorerApi?: string;
  isTestnet: boolean;
  faucetUrl?: string;
  bridgeUrl?: string;
}

export const CHAIN_METADATA: Record<number, ChainMetadata> = {
  [CHAIN_IDS.KALYCHAIN]: {
    name: 'KalyChain',
    shortName: 'KLC',
    symbol: 'KLC',
    logo: '/tokens/klc.png',
    explorer: 'https://kalyscan.io',
    explorerApi: 'https://kalyscan.io/api',
    isTestnet: false,
  },
  [CHAIN_IDS.KALYCHAIN_TESTNET]: {
    name: 'KalyChain Testnet',
    shortName: 'KLC-T',
    symbol: 'KLC',
    logo: '/tokens/klc.png',
    explorer: 'https://testnet.kalyscan.io',
    isTestnet: true,
    faucetUrl: 'https://faucet.kalychain.io',
  },
  [CHAIN_IDS.ARBITRUM]: {
    name: 'Arbitrum One',
    shortName: 'ARB',
    symbol: 'ETH',
    logo: '/tokens/eth.png',
    explorer: 'https://arbiscan.io',
    explorerApi: 'https://api.arbiscan.io/api',
    isTestnet: false,
  },
  [CHAIN_IDS.BSC]: {
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    symbol: 'BNB',
    logo: '/tokens/bnb.png',
    explorer: 'https://bscscan.com',
    explorerApi: 'https://api.bscscan.com/api',
    isTestnet: false,
  },
  [CHAIN_IDS.CLISHA]: {
    name: 'Clisha',
    shortName: 'CLISHA',
    symbol: 'CLISHA',
    logo: '/icons/clisha.png',
    explorer: 'https://clishascan.com',
    isTestnet: false,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get RPC URL for a chain (with env override support) */
export function getRpcUrl(chainId: number): string {
  return RPC_URLS[chainId] || '';
}

/** Get chain metadata for UI display */
export function getChainMetadata(chainId: number): ChainMetadata | undefined {
  return CHAIN_METADATA[chainId];
}

/** Get explorer URL for a chain */
export function getExplorerUrl(chainId: number): string {
  return CHAIN_METADATA[chainId]?.explorer || '';
}

/** Get transaction URL on explorer */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const explorer = getExplorerUrl(chainId);
  return explorer ? `${explorer}/tx/${txHash}` : '';
}

/** Get address URL on explorer */
export function getExplorerAddressUrl(chainId: number, address: string): string {
  const explorer = getExplorerUrl(chainId);
  return explorer ? `${explorer}/address/${address}` : '';
}

/** Get chain logo path */
export function getChainLogo(chainId: number): string {
  return CHAIN_METADATA[chainId]?.logo || '/tokens/unknown.png';
}

/** Get native currency symbol for a chain */
export function getNativeSymbol(chainId: number): string {
  return CHAIN_METADATA[chainId]?.symbol || 'ETH';
}
