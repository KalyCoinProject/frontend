/**
 * Centralized exports for custom hooks.
 * Import from '@/hooks' for all hook needs.
 */

// Price and chart data hooks (TanStack Query powered)
export { useChartData, type PricePoint } from './useChartData';
export { useDexStats, type DexMarketStats } from './useDexStats';
export { useTokenPrice, formatTokenPrice, formatPriceChange } from './useTokenPrice';

// Legacy hooks - maintained for backward compatibility
// These will be deprecated in favor of the new TanStack Query hooks
export {
  usePriceData,
  useTokenPrice as useTokenPriceLegacy,
  useHistoricalPriceData,
  useDexMarketStats,
  formatTokenPrice as formatTokenPriceLegacy,
  formatPriceChange as formatPriceChangeLegacy,
  type PricePoint as LegacyPricePoint,
  type TokenPair,
} from './usePriceData';

// Token hooks
export { useTokenBalance } from './useTokenBalance';
export { useTokenLists } from './useTokenLists';

// Swap hooks
export { useSwap } from './useSwap';           // Unified V2/V3 swap hook (recommended)
export { useV3Swap } from './useV3Swap';       // V3-specific swap hook
export { useDexSwap } from './useDexSwap';     // V2 swap hook

// Other hooks
export { usePairMarketStats } from './usePairMarketStats';

// Error handling
export { useErrorHandler, type AppError, type ErrorCategory } from './useErrorHandler';

// V3 Hooks
export { useV3Pools, useUserV3Positions, type V3Pool, type V3Position } from './v3/useV3Subgraph';
