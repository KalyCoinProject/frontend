// Contract addresses and configuration for KalySwap Launchpad
// Based on deployed contracts from backend/src/blockchain/contracts/launchpad/README.md

import { CHAIN_IDS, RPC_URLS as CENTRAL_RPC_URLS, CHAIN_METADATA } from './chains';

/**
 * @deprecated Use CHAIN_IDS from '@/config/chains' instead
 */
export const CHAIN_ID = {
  KALYCHAIN_MAINNET: CHAIN_IDS.KALYCHAIN,
  KALYCHAIN_TESTNET: CHAIN_IDS.KALYCHAIN_TESTNET,
} as const;

/**
 * @deprecated Use RPC_URLS from '@/config/chains' instead
 */
export const RPC_URLS = {
  [CHAIN_ID.KALYCHAIN_MAINNET]: CENTRAL_RPC_URLS[CHAIN_IDS.KALYCHAIN],
  [CHAIN_ID.KALYCHAIN_TESTNET]: CENTRAL_RPC_URLS[CHAIN_IDS.KALYCHAIN_TESTNET],
} as const;

// Contract addresses for KalyChain Mainnet (Chain ID: 3888)
export const MAINNET_CONTRACTS = {
  // Core Infrastructure
  TOKEN_FACTORY_MANAGER: '0xd8C7417F6Da77D534586715Cb1187935043C5A8F',
  MULTICALL: '0xD7a3C1253E8ddE3d61B0B6d469b241df307D399D',

  // Token Factories
  STANDARD_TOKEN_FACTORY: '0xB9228A684822D557ABd419814bC6b536Fa34E3BD',
  LIQUIDITY_GENERATOR_TOKEN_FACTORY: '0xa13567796eeB7357f48caC8d83b4c1b885B66762',

  // Launchpad Contracts
  PRESALE_FACTORY: '0x42CA326c90868e034293C679BD61F5B0e6c88149',
  FAIRLAUNCH_FACTORY: '0xcf2A1325b32c3818B24171513cc9F71ae74592B9',

  // DEX Integration
  FACTORY: '0xD42Af909d323D88e0E933B6c50D3e91c279004ca',
  ROUTER: '0x183F288BF7EEBe1A3f318F4681dF4a70ef32B2f3',
  WKLC: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',

  // Base Tokens
  USDT: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
  USDC: '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9',
  DAI: '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6',
  WBTC: '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455',
  ETH: '0xfdbB253753dDE60b11211B169dC872AaE672879b',
  BNB: '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb',
  POL: '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac',
  KSWAP: '0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a',
} as const;

/**
 * Known stablecoin addresses on KalyChain mainnet.
 * IMPORTANT: Always use addresses, not symbols, to identify tokens.
 * Symbols are not unique - anyone can create a token with any symbol.
 */
export const STABLECOIN_ADDRESSES = [
  MAINNET_CONTRACTS.USDT.toLowerCase(),
  MAINNET_CONTRACTS.USDC.toLowerCase(),
  MAINNET_CONTRACTS.DAI.toLowerCase(),
] as const;

/**
 * Check if an address is a known stablecoin.
 * Uses address comparison, NOT symbol matching.
 */
export function isStablecoinAddress(address: string): boolean {
  return STABLECOIN_ADDRESSES.includes(address.toLowerCase() as typeof STABLECOIN_ADDRESSES[number]);
}

/**
 * Known WKLC/USDT pair address on KalyChain mainnet.
 * This is the canonical pair for KLC price discovery.
 */
export const WKLC_USDT_PAIR = '0x25fddaf836dc5e285823a644bb86e0b79c8e2'.toLowerCase();

// Contract addresses for KalyChain Testnet (Chain ID: 3889)
export const TESTNET_CONTRACTS = {
  // Core Infrastructure
  TOKEN_FACTORY_MANAGER: '0x312f9eD881cf492b9345413C5d482CEEF1B30c51',
  
  // Token Factories
  STANDARD_TOKEN_FACTORY: '0x90bb7c432527C3D9D1278de3B5a2781B503a940C',
  LIQUIDITY_GENERATOR_TOKEN_FACTORY: '0x7eb64f6264fa120ffDE29531702bf60B17eCed8c',
  
  // Launchpad Contracts
  PRESALE_FACTORY: '0xd20889cbF4d22A21228d775BB55c09c3FB21Ec31',
  FAIRLAUNCH_FACTORY: '0x16D0dD2ab80c872A3cF7752ED2B5900DC9961443',
  
  // DEX Integration
  ROUTER: '0x7fD3173Eef473F64AD4553169D6d334d42Df1d95',
  WKLC: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
} as const;

// Get contracts for current network
export function getContracts(chainId: number) {
  switch (chainId) {
    case CHAIN_ID.KALYCHAIN_MAINNET:
      return MAINNET_CONTRACTS;
    case CHAIN_ID.KALYCHAIN_TESTNET:
      return TESTNET_CONTRACTS;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

// Contract function signatures for easy reference
export const CONTRACT_FUNCTIONS = {
  // StandardTokenFactory
  STANDARD_TOKEN_CREATE: 'create(string,string,uint8,uint256)',
  
  // LiquidityGeneratorTokenFactory  
  LIQUIDITY_GENERATOR_CREATE: 'create(string,string,uint256,address,address,uint16,uint16,uint16)',
  
  // PresaleFactory
  PRESALE_CREATE: 'create(address,address,uint256[2],uint256[2],uint256,uint256,uint256,uint256,uint256)',
  
  // FairlaunchFactory
  FAIRLAUNCH_CREATE: 'createFairlaunch(address,address,bool,uint256,bool,uint256,uint256,uint256,uint256,uint256,address)',
} as const;

// Base token options for dropdowns
export const BASE_TOKENS = [
  {
    symbol: 'KLC',
    name: 'KalyCoin',
    address: '0x0000000000000000000000000000000000000000', // Native token
    decimals: 18,
    isNative: true,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: MAINNET_CONTRACTS.USDT,
    decimals: 18, // Binance-Peg USDT has 18 decimals on KalyChain
    isNative: false,
  },
] as const;

/**
 * Network configuration
 * @deprecated Use CHAIN_METADATA from '@/config/chains' for most use cases
 */
export const NETWORK_CONFIG = {
  [CHAIN_ID.KALYCHAIN_MAINNET]: {
    name: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.name || 'KalyChain Mainnet',
    shortName: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.shortName || 'KalyChain',
    chainId: CHAIN_ID.KALYCHAIN_MAINNET,
    rpcUrl: RPC_URLS[CHAIN_ID.KALYCHAIN_MAINNET],
    blockExplorer: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.explorer || 'https://kalyscan.io',
    nativeCurrency: {
      name: 'KalyCoin',
      symbol: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN]?.symbol || 'KLC',
      decimals: 18,
    },
  },
  [CHAIN_ID.KALYCHAIN_TESTNET]: {
    name: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN_TESTNET]?.name || 'KalyChain Testnet',
    shortName: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN_TESTNET]?.shortName || 'KalyChain Testnet',
    chainId: CHAIN_ID.KALYCHAIN_TESTNET,
    rpcUrl: RPC_URLS[CHAIN_ID.KALYCHAIN_TESTNET],
    blockExplorer: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN_TESTNET]?.explorer || 'https://testnet.kalyscan.io',
    nativeCurrency: {
      name: 'KalyCoin',
      symbol: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN_TESTNET]?.symbol || 'KLC',
      decimals: 18,
    },
  },
} as const;

// Default to mainnet
export const DEFAULT_CHAIN_ID = CHAIN_ID.KALYCHAIN_MAINNET;
export const DEFAULT_CONTRACTS = MAINNET_CONTRACTS;

// Helper function to get contract address by name
export function getContractAddress(contractName: keyof typeof MAINNET_CONTRACTS, chainId: number = DEFAULT_CHAIN_ID): string {
  const contracts = getContracts(chainId);
  return contracts[contractName as keyof typeof contracts];
}

// Helper function to check if address is native token
export function isNativeToken(address: string): boolean {
  return address === '0x0000000000000000000000000000000000000000' || address.toLowerCase() === 'native';
}

// Helper function to format address for display
export function formatAddress(address: string): string {
  if (isNativeToken(address)) return 'Native KLC';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Contract creation fees (in KLC)
export const CONTRACT_FEES = {
  STANDARD_TOKEN: '3.0',
  LIQUIDITY_GENERATOR_TOKEN: '3.0',
  PRESALE: '200000.0',
  FAIRLAUNCH: '200000.0',  // Fixed: Updated from 5.0 to 200000.0 KLC
} as const;
