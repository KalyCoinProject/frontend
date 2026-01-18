import { CHAIN_IDS } from '@/config/chains';
import { DexConfig } from './types';
import { KALYCHAIN_TOKENS } from './tokens/kalychain';
import { ROUTER_ABI, FACTORY_ABI } from '../abis';

export const KALYSWAP_CONFIG: DexConfig = {
  name: 'KalySwap',
  factory: '0xD42Af909d323D88e0E933B6c50D3e91c279004ca',
  router: '0x183F288BF7EEBe1A3f318F4681dF4a70ef32B2f3',
  subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL || 'https://localhost:8000/subgraphs/name/kalyswap/dex-subgraph', 
  tokens: KALYCHAIN_TOKENS,
  routerABI: ROUTER_ABI,
  factoryABI: FACTORY_ABI,
  wethAddress: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', // wKLC
  nativeToken: {
    symbol: 'KLC',
    name: 'KalyCoin',
    decimals: 18,
  },
};

// KalySwap specific constants
export const KALYSWAP_CONSTANTS = {
  CHAIN_ID: CHAIN_IDS.KALYCHAIN,
  INIT_CODE_HASH: '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f', // KalySwap init code hash
  MINIMUM_LIQUIDITY: 1000,
  FEE_DENOMINATOR: 10000,
  FEE_NUMERATOR: 30, // 0.3% fee
} as const;

// Helper functions for KalySwap
export function getKalySwapPairAddress(tokenA: string, tokenB: string): string {
  // Calculate pair address using CREATE2 - same as Uniswap V2
  const { getCreate2Address } = require('viem');

  // Sort tokens (same as Uniswap V2)
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  // Encode packed for salt
  const salt = require('viem').keccak256(
    require('viem').encodePacked(['address', 'address'], [token0 as `0x${string}`, token1 as `0x${string}`])
  );

  return getCreate2Address({
    from: KALYSWAP_CONFIG.factory as `0x${string}`,
    salt,
    bytecodeHash: KALYSWAP_CONSTANTS.INIT_CODE_HASH as `0x${string}`,
  });
}

export function isKalySwapToken(address: string): boolean {
  return KALYCHAIN_TOKENS.some(token => 
    token.address.toLowerCase() === address.toLowerCase()
  );
}
