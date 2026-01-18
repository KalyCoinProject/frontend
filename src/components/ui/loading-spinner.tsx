'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Custom className */
  className?: string;
  /** Accessible label for screen readers */
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

/**
 * Loading spinner using Lucide Loader2 icon
 * Consistent styling across the app
 */
export function LoadingSpinner({
  size = 'md',
  className,
  label = 'Loading...',
}: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
      aria-label={label}
      role="status"
    />
  );
}

interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  isLoading: boolean;
  /** Optional loading message */
  message?: string;
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Additional className for the overlay */
  className?: string;
  /** Children to render behind the overlay */
  children?: React.ReactNode;
}

/**
 * Full container loading overlay
 * Covers parent container with semi-transparent backdrop and spinner
 */
export function LoadingOverlay({
  isLoading,
  message,
  size = 'lg',
  className,
  children,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-50">
          <LoadingSpinner size={size} />
          {message && (
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface LoadingButtonContentProps {
  /** Whether loading */
  isLoading: boolean;
  /** Text to show when not loading */
  children: React.ReactNode;
  /** Text to show when loading (optional, defaults to children) */
  loadingText?: string;
  /** Spinner size */
  spinnerSize?: SpinnerSize;
}

/**
 * Helper for button content with loading state
 * Replaces button text with spinner + optional text
 */
export function LoadingButtonContent({
  isLoading,
  children,
  loadingText,
  spinnerSize = 'sm',
}: LoadingButtonContentProps) {
  if (isLoading) {
    return (
      <span className="flex items-center gap-2">
        <LoadingSpinner size={spinnerSize} />
        <span>{loadingText || children}</span>
      </span>
    );
  }
  return <>{children}</>;
}

interface FullPageLoaderProps {
  /** Loading message */
  message?: string;
  /** Size of the spinner */
  size?: SpinnerSize;
}

/**
 * Full page loading state
 * Centered spinner that fills the viewport
 */
export function FullPageLoader({
  message = 'Loading...',
  size = 'xl',
}: FullPageLoaderProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
      <LoadingSpinner size={size} />
      <p className="mt-4 text-lg text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * Inline loading indicator
 * For use within text or small spaces
 */
export function InlineLoader({
  size = 'xs',
  className,
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <LoadingSpinner size={size} />
    </span>
  );
}

export default LoadingSpinner;

