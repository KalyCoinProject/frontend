import { CHAIN_IDS } from '@/config/chains';
import { DoubleSideStaking, SingleSideStaking, FarmingConfig, Token } from '@/types/farming'

// KalyChain token addresses
const KALYCHAIN_TOKENS = {
  WKLC: {
    address: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
    symbol: 'WKLC',
    name: 'Wrapped KLC',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  KSWAP: {
    address: '0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a',
    symbol: 'KSWAP',
    name: 'KalySwap Token',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  USDT: {
    address: '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  USDC: {
    address: '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  WBTC: {
    address: '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  ETH: {
    address: '0xfdbB253753dDE60b11211B169dC872AaE672879b',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  DAI: {
    address: '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  POL: {
    address: '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac',
    symbol: 'POL',
    name: 'Polygon',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token,
  BNB: {
    address: '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb',
    symbol: 'BNB',
    name: 'Binance Coin',
    decimals: 18,
    chainId: CHAIN_IDS.KALYCHAIN
  } as Token
}

// MiniChef V2 contract addresses
const MINICHEF_ADDRESS: { [chainId: number]: string } = {
  [CHAIN_IDS.KALYCHAIN]: '0x1f806f7C8dED893fd3caE279191ad7Aa3798E928' // KalyChain MiniChef V2
}

// LiquidityPoolManagerV2 contract address
const LIQUIDITY_POOL_MANAGER_V2_ADDRESS = '0xe83e7ede1358FA87e5039CF8B1cffF383Bc2896A'
const TREASURY_VESTER_ADDRESS = '0x4C4b968232a8603e2D1e53AB26E9a0319fA33ED3'

// LP Farming pools with discovered pair addresses and staking contracts
const LP_FARMING_POOLS: { [key: string]: DoubleSideStaking } = {
  WKLC_DAI: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.DAI],
    stakingRewardAddress: '0x2bD4B7f303C1f372689d52A55ec202E0cf831a26', // Real staking contract
    version: 2,
    pairAddress: '0x1a3d8b9Fe0a77923a8330FfCe485Afd2b0B8BE7e' // Discovered pair address
  },
  WKLC_USDT: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.USDT],
    stakingRewardAddress: '0xD9238e463dc69c976C5452e8159100DfA1a5A157', // Real staking contract
    version: 2,
    pairAddress: '0x25FDDaF836d12dC5e285823a644bb86E0b79c8e2' // Known WKLC/USDT pair
  },
  WKLC_USDC: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.USDC],
    stakingRewardAddress: '0x9FC553A1b7241A24Aef20894375c6da706205734', // Real staking contract
    version: 2,
    pairAddress: '0x4D7f05b00D6BF67C1062BCcc26E1CA1FC24Ac0f0' // Discovered pair address
  },
  WKLC_ETH: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.ETH],
    stakingRewardAddress: '0x85723D1c8c4d1944992EB02532de53037C98A667', // Real staking contract
    version: 2,
    pairAddress: '0x82a20edD4A6c076F5c2f9d244C80c5906aa88268' // Discovered pair address
  },
  WKLC_POL: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.POL],
    stakingRewardAddress: '0xE2912ecBd06185A6DBA68d49b700AD06e98055E4', // Real staking contract
    version: 2,
    pairAddress: '0x558d7D1EF09ae32DbdFe25f5F9eEa6767288B156' // Discovered pair address
  },
  WKLC_BNB: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.BNB],
    stakingRewardAddress: '0xA3eB9877968DBe481B8D72797035D39CC9656733', // Real staking contract
    version: 2,
    pairAddress: '0x5df408ae7A3a83b9889E8e661a6C91a00B723FDe' // Discovered pair address
  },
  WKLC_WBTC: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.WBTC],
    stakingRewardAddress: '0x3B7c8132B3253b9EBBdF08Eb849254eFFe22664b', // Real staking contract
    version: 2,
    pairAddress: '0x6548735742Fc5cccb2Cde021246FEB333eF46211' // Discovered pair address
  },
  KSWAP_WKLC: {
    tokens: [KALYCHAIN_TOKENS.KSWAP, KALYCHAIN_TOKENS.WKLC],
    stakingRewardAddress: '0xA9f1eB89452f825Bbc59007FAe13233953910582', // Real staking contract
    version: 2,
    pairAddress: '0xf3E034650E1c2597A0af75012C1854247f271ee0' // Discovered pair address
  },
  KSWAP_USDT: {
    tokens: [KALYCHAIN_TOKENS.KSWAP, KALYCHAIN_TOKENS.USDT],
    stakingRewardAddress: '0x13545afF650C1A1982F70B8e20BB689A1Da4A302', // Real staking contract
    version: 2,
    pairAddress: '0x0e520779287bb711c8E603cc85D532dAa7C55372' // Discovered pair address
  }
}

// Legacy configurations for backward compatibility
const DOUBLE_SIDE_STAKING: { [key: string]: DoubleSideStaking } = {
  ...LP_FARMING_POOLS,
  // Legacy MiniChef pools (if any still exist)
  WKLC_KSWAP_V1: {
    tokens: [KALYCHAIN_TOKENS.WKLC, KALYCHAIN_TOKENS.KSWAP],
    stakingRewardAddress: '0xaeE3B717Fb33D9fdDb4FBd0A6906Bc34Da5a67ab',
    version: 1,
    multiplier: 0
  }
}

// Group by version
const DOUBLE_SIDE_STAKING_V0: DoubleSideStaking[] = Object.values(DOUBLE_SIDE_STAKING).filter(
  staking => staking.version === 0
)

const DOUBLE_SIDE_STAKING_V1: DoubleSideStaking[] = Object.values(DOUBLE_SIDE_STAKING).filter(
  staking => staking.version === 1
)

const DOUBLE_SIDE_STAKING_V2: DoubleSideStaking[] = Object.values(DOUBLE_SIDE_STAKING).filter(
  staking => staking.version === 2
)

// Single-side staking configurations
const SINGLE_SIDE_STAKING: { [key: string]: SingleSideStaking } = {
  KSWAP_V0: {
    rewardToken: KALYCHAIN_TOKENS.KSWAP,
    conversionRouteHops: [KALYCHAIN_TOKENS.WKLC],
    stakingRewardAddress: '0xA42EbDA6371358643AD4973F1fb3DA75d32af98A',
    version: 0
  }
}

const SINGLE_SIDE_STAKING_V0: SingleSideStaking[] = Object.values(SINGLE_SIDE_STAKING).filter(
  staking => staking.version === 0
)

// Main farming configuration
export const FARMING_CONFIG: FarmingConfig = {
  MINICHEF_ADDRESS,
  LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
  TREASURY_VESTER_ADDRESS,
  DOUBLE_SIDE_STAKING_REWARDS_INFO: {
    [CHAIN_IDS.KALYCHAIN]: [DOUBLE_SIDE_STAKING_V0, DOUBLE_SIDE_STAKING_V1, DOUBLE_SIDE_STAKING_V2] // KalyChain
  },
  SINGLE_SIDE_STAKING_REWARDS_INFO: {
    [CHAIN_IDS.KALYCHAIN]: [SINGLE_SIDE_STAKING_V0] // KalyChain
  }
}

// Export individual configurations for direct access
export {
  MINICHEF_ADDRESS,
  LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
  TREASURY_VESTER_ADDRESS,
  KALYCHAIN_TOKENS,
  LP_FARMING_POOLS,
  DOUBLE_SIDE_STAKING,
  SINGLE_SIDE_STAKING,
  DOUBLE_SIDE_STAKING_V0,
  DOUBLE_SIDE_STAKING_V1,
  DOUBLE_SIDE_STAKING_V2,
  SINGLE_SIDE_STAKING_V0
}

// Helper functions
export function getMinichefAddress(chainId: number): string {
  return MINICHEF_ADDRESS[chainId] || ''
}

export function getDoubleSideStakingInfo(chainId: number, version?: number): DoubleSideStaking[] {
  const chainInfo = FARMING_CONFIG.DOUBLE_SIDE_STAKING_REWARDS_INFO[chainId]
  if (!chainInfo) return []
  
  if (version !== undefined) {
    return chainInfo[version] || []
  }
  
  return chainInfo.flat()
}

export function getSingleSideStakingInfo(chainId: number, version?: number): SingleSideStaking[] {
  const chainInfo = FARMING_CONFIG.SINGLE_SIDE_STAKING_REWARDS_INFO[chainId]
  if (!chainInfo) return []
  
  if (version !== undefined) {
    return chainInfo[version] || []
  }
  
  return chainInfo.flat()
}

// Token utilities
export function getTokenByAddress(address: string): Token | undefined {
  return Object.values(KALYCHAIN_TOKENS).find(token => 
    token.address.toLowerCase() === address.toLowerCase()
  )
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  return Object.values(KALYCHAIN_TOKENS).find(token => 
    token.symbol.toLowerCase() === symbol.toLowerCase()
  )
}
