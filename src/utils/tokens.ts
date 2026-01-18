import { CHAIN_IDS } from '@/config/chains';
/**
 * Token utility functions for KalySwap
 * 
 * Centralizes token-related logic like symbol matching, address normalization,
 * and wrapped/native token handling.
 */

import { Token } from '@/config/dex/types';
import { getContractAddress } from '@/config/contracts';

// Chain-specific wrapped native token mappings
const WRAPPED_NATIVE_TOKENS: Record<number, { symbol: string; wrappedSymbol: string; wrappedAddress: string }> = {
  [CHAIN_IDS.KALYCHAIN]: { symbol: 'KLC', wrappedSymbol: 'WKLC', wrappedAddress: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3' },
  56: { symbol: 'BNB', wrappedSymbol: 'WBNB', wrappedAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
  42161: { symbol: 'ETH', wrappedSymbol: 'WETH', wrappedAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  1: { symbol: 'ETH', wrappedSymbol: 'WETH', wrappedAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
};

// Native token address (zero address)
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Normalize a token symbol by removing the 'W' prefix (for wrapped tokens)
 * and converting to uppercase.
 * 
 * Examples:
 *   normalizeSymbol('WKLC') => 'KLC'
 *   normalizeSymbol('wKLC') => 'KLC'
 *   normalizeSymbol('KLC')  => 'KLC'
 *   normalizeSymbol('USDT') => 'USDT'
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return '';
  const upper = symbol.toUpperCase();
  // Handle wrapped native tokens (WKLC -> KLC, WETH -> ETH, WBNB -> BNB)
  if (upper.startsWith('W') && upper.length > 1) {
    const unwrapped = upper.slice(1);
    // Check if this is actually a wrapped native token pattern
    if (['KLC', 'ETH', 'BNB', 'MATIC', 'AVAX', 'FTM'].includes(unwrapped)) {
      return unwrapped;
    }
  }
  return upper;
}

/**
 * Check if two token symbols match, accounting for wrapped/native variants.
 * 
 * Examples:
 *   symbolsMatch('KLC', 'WKLC')   => true
 *   symbolsMatch('wKLC', 'KLC')   => true
 *   symbolsMatch('USDT', 'USDC')  => false
 *   symbolsMatch('ETH', 'WETH')   => true
 */
export function symbolsMatch(symbolA: string, symbolB: string): boolean {
  if (!symbolA || !symbolB) return false;
  return normalizeSymbol(symbolA) === normalizeSymbol(symbolB);
}

/**
 * Check if a token is the native token (has zero address or isNative flag)
 */
export function isNativeToken(token: Token): boolean {
  return token.isNative === true || 
    token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Check if a token is a wrapped native token
 */
export function isWrappedNativeToken(token: Token): boolean {
  const chainConfig = WRAPPED_NATIVE_TOKENS[token.chainId];
  if (!chainConfig) return false;
  return token.address.toLowerCase() === chainConfig.wrappedAddress.toLowerCase() ||
    token.symbol.toUpperCase() === chainConfig.wrappedSymbol;
}

/**
 * Get the effective address for a token (wrapped address for native tokens)
 * This is needed when interacting with DEX contracts which use wrapped tokens.
 * 
 * Example:
 *   getEffectiveAddress(nativeKLC) => '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3'
 *   getEffectiveAddress(USDT)      => '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A'
 */
export function getEffectiveAddress(token: Token): string {
  if (isNativeToken(token)) {
    const chainConfig = WRAPPED_NATIVE_TOKENS[token.chainId];
    if (chainConfig) {
      return chainConfig.wrappedAddress;
    }
    // Fallback to contracts config
    try {
      return getContractAddress('WKLC', token.chainId);
    } catch {
      return token.address;
    }
  }
  return token.address;
}

/**
 * Get the wrapped token address for a chain
 */
export function getWrappedNativeAddress(chainId: number): string {
  const chainConfig = WRAPPED_NATIVE_TOKENS[chainId];
  if (chainConfig) {
    return chainConfig.wrappedAddress;
  }
  // Fallback to contracts config for KalyChain
  try {
    return getContractAddress('WKLC', chainId);
  } catch {
    throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

/**
 * Compare two addresses case-insensitively
 */
export function addressesEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if two tokens are the same (by address or native equivalence)
 */
export function tokensEqual(tokenA: Token, tokenB: Token): boolean {
  if (tokenA.chainId !== tokenB.chainId) return false;
  
  // Both native
  if (isNativeToken(tokenA) && isNativeToken(tokenB)) return true;
  
  // Check effective addresses (handles native/wrapped equivalence)
  return addressesEqual(getEffectiveAddress(tokenA), getEffectiveAddress(tokenB));
}

/**
 * Format a token address for display (0x1234...5678)
 */
export function formatTokenAddress(address: string, chars: number = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get display symbol for a token (handles native vs wrapped display)
 */
export function getDisplaySymbol(token: Token, preferNative: boolean = true): string {
  if (preferNative && isWrappedNativeToken(token)) {
    return normalizeSymbol(token.symbol);
  }
  return token.symbol;
}

