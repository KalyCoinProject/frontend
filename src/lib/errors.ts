/**
 * Centralized Error Handling for KalySwap
 *
 * This module provides a unified error handling strategy across the application.
 * All errors should be created/parsed through these utilities for consistency.
 */

import { priceLogger as logger } from './logger';

// ============================================================================
// Error Types & Enums
// ============================================================================

export enum ErrorCategory {
  /** Network/connectivity issues */
  NETWORK = 'NETWORK',
  /** Smart contract execution errors */
  CONTRACT = 'CONTRACT',
  /** User rejected transaction in wallet */
  USER_REJECTED = 'USER_REJECTED',
  /** Invalid input or validation failure */
  VALIDATION = 'VALIDATION',
  /** Authentication/authorization issues */
  AUTH = 'AUTH',
  /** Subgraph or API errors */
  API = 'API',
  /** Wallet connection issues */
  WALLET = 'WALLET',
  /** Unknown/unexpected errors */
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  /** User can easily recover (e.g., retry) */
  LOW = 'LOW',
  /** Requires user action but recoverable */
  MEDIUM = 'MEDIUM',
  /** Serious issue, may need support */
  HIGH = 'HIGH',
  /** Critical system failure */
  CRITICAL = 'CRITICAL',
}

// ============================================================================
// Error Interface
// ============================================================================

export interface AppError {
  /** Error category for routing/handling */
  category: ErrorCategory;
  /** Severity level for UI treatment */
  severity: ErrorSeverity;
  /** User-friendly title */
  title: string;
  /** User-friendly message */
  message: string;
  /** Actionable suggestion for user */
  suggestion?: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Original error for debugging */
  originalError?: unknown;
  /** Error code if available */
  code?: string | number;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Error Patterns for Detection
// ============================================================================

const NETWORK_PATTERNS = [
  'network', 'timeout', 'connection', 'fetch failed', 'econnrefused',
  'enotfound', 'etimedout', 'socket', 'abort', 'offline'
];

const USER_REJECTED_PATTERNS = [
  'user rejected', 'user denied', 'rejected by user', 'cancelled',
  'user canceled', 'denied transaction'
];

const WALLET_PATTERNS = [
  'wallet', 'metamask', 'no provider', 'not connected', 'chain mismatch',
  'wrong network', 'switch chain'
];

const CONTRACT_PATTERNS = [
  'execution reverted', 'revert', 'insufficient', 'exceeds balance',
  'transfer amount exceeds', 'allowance', 'expired', 'slippage',
  'k', 'invariant' // AMM specific
];

const AUTH_PATTERNS = [
  'unauthorized', 'authentication', 'token expired', 'invalid token',
  'session', 'login required'
];

// ============================================================================
// Error Parsing
// ============================================================================

/**
 * Parse any error into a standardized AppError
 */
export function parseError(error: unknown): AppError {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const lowerMessage = message.toLowerCase();

  // Detect category based on patterns
  let category = ErrorCategory.UNKNOWN;
  let severity = ErrorSeverity.MEDIUM;
  let title = 'Something went wrong';
  let suggestion: string | undefined;
  let retryable = false;

  // User rejection - lowest severity, always retryable
  if (code === 4001 || matchesPatterns(lowerMessage, USER_REJECTED_PATTERNS)) {
    category = ErrorCategory.USER_REJECTED;
    severity = ErrorSeverity.LOW;
    title = 'Transaction Cancelled';
    suggestion = 'Click the button again when you\'re ready to proceed.';
    retryable = true;
  }
  // Network errors - retryable
  else if (matchesPatterns(lowerMessage, NETWORK_PATTERNS)) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.MEDIUM;
    title = 'Connection Issue';
    suggestion = 'Check your internet connection and try again.';
    retryable = true;
  }
  // Wallet errors
  else if (matchesPatterns(lowerMessage, WALLET_PATTERNS)) {
    category = ErrorCategory.WALLET;
    severity = ErrorSeverity.MEDIUM;
    title = 'Wallet Issue';
    suggestion = 'Make sure your wallet is connected and on the correct network.';
    retryable = true;
  }
  // Contract errors - need specific handling
  else if (matchesPatterns(lowerMessage, CONTRACT_PATTERNS)) {
    category = ErrorCategory.CONTRACT;
    severity = ErrorSeverity.MEDIUM;
    title = 'Transaction Failed';
    suggestion = getContractSuggestion(lowerMessage);
    retryable = !lowerMessage.includes('insufficient');
  }
  // Auth errors
  else if (matchesPatterns(lowerMessage, AUTH_PATTERNS)) {
    category = ErrorCategory.AUTH;
    severity = ErrorSeverity.MEDIUM;
    title = 'Authentication Required';
    suggestion = 'Please log in again.';
    retryable = false;
  }
  // API/Subgraph errors
  else if (lowerMessage.includes('graphql') || lowerMessage.includes('subgraph') || lowerMessage.includes('api')) {
    category = ErrorCategory.API;
    severity = ErrorSeverity.LOW;
    title = 'Data Unavailable';
    suggestion = 'The data service is temporarily unavailable. Try again in a moment.';
    retryable = true;
  }

  return {
    category,
    severity,
    title,
    message: formatUserMessage(message),
    suggestion,
    retryable,
    originalError: error,
    code,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return (e.message || e.reason || e.error || JSON.stringify(error)) as string;
  }
  return 'An unknown error occurred';
}

function getErrorCode(error: unknown): string | number | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return (e.code as string | number) || undefined;
  }
  return undefined;
}

function matchesPatterns(message: string, patterns: string[]): boolean {
  return patterns.some(pattern => message.includes(pattern));
}

function formatUserMessage(message: string): string {
  // Remove technical details from user-facing message
  let clean = message
    .replace(/0x[a-fA-F0-9]+/g, '') // Remove hex addresses
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Capitalize first letter
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  // Ensure it ends with punctuation
  if (clean.length > 0 && !/[.!?]$/.test(clean)) {
    clean += '.';
  }

  return clean || 'An unexpected error occurred.';
}

function getContractSuggestion(message: string): string {
  if (message.includes('insufficient') || message.includes('exceeds balance')) {
    return 'You don\'t have enough tokens for this transaction.';
  }
  if (message.includes('allowance')) {
    return 'Please approve the token first.';
  }
  if (message.includes('slippage') || message.includes('k') || message.includes('invariant')) {
    return 'Try increasing your slippage tolerance or reducing the amount.';
  }
  if (message.includes('expired') || message.includes('deadline')) {
    return 'The transaction expired. Please try again.';
  }
  return 'The transaction could not be completed. Please try again.';
}

// ============================================================================
// Result Type (for explicit error handling without exceptions)
// ============================================================================

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Create a success result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Create an error result */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Wrap an async operation in error handling, returning a Result */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<Result<T>> {
  try {
    const value = await operation();
    return ok(value);
  } catch (error) {
    const appError = parseError(error);
    if (context) {
      logger.error(`[${context}] ${appError.title}:`, appError.message);
    }
    return err(appError);
  }
}

// ============================================================================
// Error Display Helpers
// ============================================================================

/** Get the appropriate toast type for an error */
export function getToastType(error: AppError): 'error' | 'info' {
  if (error.category === ErrorCategory.USER_REJECTED) {
    return 'info'; // User cancelled is not really an error
  }
  return 'error';
}

/** Get toast duration based on severity */
export function getToastDuration(error: AppError): number {
  switch (error.severity) {
    case ErrorSeverity.LOW: return 3000;
    case ErrorSeverity.MEDIUM: return 5000;
    case ErrorSeverity.HIGH: return 8000;
    case ErrorSeverity.CRITICAL: return 0; // Don't auto-dismiss
    default: return 5000;
  }
}

/** Format error for display in UI */
export function formatErrorForDisplay(error: AppError): {
  title: string;
  message: string;
  showRetry: boolean;
} {
  return {
    title: error.title,
    message: error.suggestion || error.message,
    showRetry: error.retryable,
  };
}

/** Log error with appropriate level based on severity */
export function logError(error: AppError, context?: string): void {
  const prefix = context ? `[${context}]` : '';

  switch (error.severity) {
    case ErrorSeverity.LOW:
      logger.debug(`${prefix} ${error.title}:`, error.message);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn(`${prefix} ${error.title}:`, error.message);
      break;
    case ErrorSeverity.HIGH:
    case ErrorSeverity.CRITICAL:
      logger.error(`${prefix} ${error.title}:`, error.message, error.originalError);
      break;
  }
}
