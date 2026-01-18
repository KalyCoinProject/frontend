/**
 * React Hook for Centralized Error Handling
 * 
 * Provides a consistent way to handle errors across components with
 * automatic toast notifications and error state management.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  AppError,
  ErrorCategory,
  parseError,
  getToastType,
  getToastDuration,
  formatErrorForDisplay,
  logError,
  tryCatch,
  Result,
} from '@/lib/errors';

export interface UseErrorHandlerOptions {
  /** Context name for logging */
  context?: string;
  /** Show toast notifications on error */
  showToast?: boolean;
  /** Auto-retry retryable errors */
  autoRetry?: boolean;
  /** Max retry attempts */
  maxRetries?: number;
  /** Callback when error occurs */
  onError?: (error: AppError) => void;
}

export interface ErrorState {
  error: AppError | null;
  isRetrying: boolean;
  retryCount: number;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const {
    context,
    showToast = true,
    autoRetry = false,
    maxRetries = 3,
    onError,
  } = options;

  const toast = useToast();
  const [state, setState] = useState<ErrorState>({
    error: null,
    isRetrying: false,
    retryCount: 0,
  });
  
  const lastOperationRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * Handle an error - parse it, log it, show toast, update state
   */
  const handleError = useCallback((error: unknown): AppError => {
    const appError = parseError(error);
    
    // Log the error
    logError(appError, context);
    
    // Show toast if enabled
    if (showToast && toast) {
      const display = formatErrorForDisplay(appError);
      const toastType = getToastType(appError);
      const duration = getToastDuration(appError);
      
      if (toastType === 'error') {
        toast.error(display.title, display.message, { duration });
      } else {
        toast.info(display.title, display.message, { duration });
      }
    }
    
    // Update state
    setState(prev => ({
      error: appError,
      isRetrying: false,
      retryCount: prev.retryCount,
    }));
    
    // Call callback
    onError?.(appError);
    
    return appError;
  }, [context, showToast, toast, onError]);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setState({
      error: null,
      isRetrying: false,
      retryCount: 0,
    });
  }, []);

  /**
   * Retry the last operation
   */
  const retry = useCallback(async () => {
    if (!lastOperationRef.current || !state.error?.retryable) {
      return;
    }
    
    if (state.retryCount >= maxRetries) {
      handleError(new Error('Maximum retry attempts reached'));
      return;
    }
    
    setState(prev => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1,
    }));
    
    try {
      await lastOperationRef.current();
      clearError();
    } catch (error) {
      handleError(error);
    }
  }, [state.error, state.retryCount, maxRetries, handleError, clearError]);

  /**
   * Execute an operation with automatic error handling
   */
  const execute = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<Result<T>> => {
    clearError();
    lastOperationRef.current = operation as () => Promise<void>;
    
    const result = await tryCatch(operation, context);
    
    if (!result.ok) {
      handleError(result.error.originalError || result.error);
    }
    
    return result;
  }, [context, clearError, handleError]);

  /**
   * Execute with throwing on error (for try/catch patterns)
   */
  const executeOrThrow = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    const result = await execute(operation);
    if (!result.ok) {
      throw result.error.originalError || new Error(result.error.message);
    }
    return result.value;
  }, [execute]);

  return {
    // State
    error: state.error,
    hasError: state.error !== null,
    isRetrying: state.isRetrying,
    retryCount: state.retryCount,
    canRetry: state.error?.retryable && state.retryCount < maxRetries,
    
    // Actions
    handleError,
    clearError,
    retry,
    execute,
    executeOrThrow,
  };
}

export type { AppError, ErrorCategory };

