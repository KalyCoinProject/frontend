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

// Other hooks
export { usePairMarketStats } from './usePairMarketStats';

// Error handling
export { useErrorHandler, type AppError, type ErrorCategory } from './useErrorHandler';
