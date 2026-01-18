// DEX Services - Main export file
// This provides a clean interface for importing DEX services

// Main service exports
export { DexService as default } from './DexService';
export { DexService } from './DexService';

// Individual service exports
export { KalySwapService } from './KalySwapService';
export { PancakeSwapService } from './PancakeSwapService';
export { UniswapV2Service } from './UniswapV2Service';

// Base service and interface exports
export { BaseDexService } from './BaseDexService';
export type { IDexService } from './IDexService';
export {
  DexError,
  InsufficientLiquidityError,
  PairNotFoundError,
  UnsupportedTokenError,
  SwapFailedError
} from './IDexService';

// Re-export types from config
export type {
  Token,
  QuoteResult,
  SwapParams,
  PairInfo,
  DexConfig,
  DexProtocol,
  SupportedDexChainId,
  AddLiquidityParams,
  RemoveLiquidityParams,
  LiquidityPosition
} from '@/config/dex/types';

// Convenience functions
export {
  getDexConfig,
  getDexName,
  getRouterAddress,
  getFactoryAddress,
  getWethAddress,
  getSubgraphUrl,
  getTokenList,
  getRouterABI,
  getFactoryABI,
  getNativeToken,
  findTokenByAddress,
  findTokenBySymbol,
  isChainSupported,
  getSupportedChainIds,
  getDefaultTokenPair
} from '@/config/dex';

// Usage examples and documentation
/**
 * Usage Examples:
 * 
 * // Get a quote for swapping tokens
 * const quote = await DexService.getQuote(chainId, tokenIn, tokenOut, amountIn);
 * 
 * // Execute a swap
 * const txHash = await DexService.executeSwap(chainId, {
 *   tokenIn,
 *   tokenOut,
 *   amountIn,
 *   amountOutMin,
 *   to: userAddress,
 *   deadline: 20,
 *   slippageTolerance: 0.5
 * });
 * 
 * // Get supported tokens for a chain
 * const tokens = await DexService.getTokenList(chainId);
 * 
 * // Check if tokens can be swapped directly
 * const canSwap = await DexService.canSwapDirectly(chainId, tokenA, tokenB);
 * 
 * // Get the best swap route
 * const route = await DexService.getSwapRoute(chainId, tokenIn, tokenOut);
 * 
 * // Calculate price impact
 * const impact = await DexService.calculatePriceImpact(chainId, tokenIn, tokenOut, amountIn);
 */
