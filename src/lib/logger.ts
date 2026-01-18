/**
 * Centralized logging utility for KalySwap
 * 
 * Replaces scattered console.log statements with environment-aware logging.
 * In production, debug logs are suppressed to keep the console clean.
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   
 *   logger.debug('Fetching price data', { pair, timeframe });
 *   logger.info('Swap completed', { txHash });
 *   logger.warn('Slippage tolerance is high', { slippage });
 *   logger.error('Transaction failed', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enableDebug: boolean;
  enableInfo: boolean;
  prefix: string;
}

const isDevelopment = process.env.NODE_ENV === 'development';

const defaultConfig: LoggerConfig = {
  enableDebug: isDevelopment,
  enableInfo: true,
  prefix: '[KalySwap]',
};

let config = { ...defaultConfig };

/**
 * Format log arguments for consistent output
 */
function formatArgs(level: LogLevel, args: unknown[]): unknown[] {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const levelEmoji = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };
  
  return [`${levelEmoji[level]} ${config.prefix} [${timestamp}]`, ...args];
}

/**
 * Main logger object
 */
export const logger = {
  /**
   * Debug logs - only shown in development
   * Use for: detailed debugging info, state changes, data fetching
   */
  debug: (...args: unknown[]): void => {
    if (config.enableDebug) {
      console.log(...formatArgs('debug', args));
    }
  },

  /**
   * Info logs - shown in all environments
   * Use for: important events, successful operations
   */
  info: (...args: unknown[]): void => {
    if (config.enableInfo) {
      console.log(...formatArgs('info', args));
    }
  },

  /**
   * Warning logs - always shown
   * Use for: potential issues, deprecated usage, high slippage
   */
  warn: (...args: unknown[]): void => {
    console.warn(...formatArgs('warn', args));
  },

  /**
   * Error logs - always shown
   * Use for: errors, failures, exceptions
   */
  error: (...args: unknown[]): void => {
    console.error(...formatArgs('error', args));
  },

  /**
   * Group related logs together (dev only)
   */
  group: (label: string): void => {
    if (config.enableDebug) {
      console.group(`${config.prefix} ${label}`);
    }
  },

  /**
   * End a log group
   */
  groupEnd: (): void => {
    if (config.enableDebug) {
      console.groupEnd();
    }
  },

  /**
   * Configure logger settings
   */
  configure: (newConfig: Partial<LoggerConfig>): void => {
    config = { ...config, ...newConfig };
  },

  /**
   * Reset to default configuration
   */
  reset: (): void => {
    config = { ...defaultConfig };
  },

  /**
   * Create a scoped logger with a custom prefix
   */
  scope: (scopeName: string) => ({
    debug: (...args: unknown[]) => logger.debug(`[${scopeName}]`, ...args),
    info: (...args: unknown[]) => logger.info(`[${scopeName}]`, ...args),
    warn: (...args: unknown[]) => logger.warn(`[${scopeName}]`, ...args),
    error: (...args: unknown[]) => logger.error(`[${scopeName}]`, ...args),
  }),
};

// Pre-configured scoped loggers for common modules
export const priceLogger = logger.scope('Price');
export const swapLogger = logger.scope('Swap');
export const poolLogger = logger.scope('Pool');
export const walletLogger = logger.scope('Wallet');
export const chartLogger = logger.scope('Chart');
export const subgraphLogger = logger.scope('Subgraph');
export const bridgeLogger = logger.scope('Bridge');
export const farmingLogger = logger.scope('Farming');
export const stakingLogger = logger.scope('Staking');
export const launchpadLogger = logger.scope('Launchpad');
export const authLogger = logger.scope('Auth');
export const tokenLogger = logger.scope('Token');
export const dexLogger = logger.scope('DEX');
export const contractLogger = logger.scope('Contract');
export const multicallLogger = logger.scope('Multicall');
export const explorerLogger = logger.scope('Explorer');

export default logger;

