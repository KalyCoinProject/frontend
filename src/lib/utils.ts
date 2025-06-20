import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with proper locale formatting and decimal places
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @param options - Additional formatting options
 * @returns Formatted number string
 */
export function formatNumber(
  value: number | string | undefined | null,
  decimals: number = 2,
  options?: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    notation?: 'standard' | 'scientific' | 'engineering' | 'compact'
    compactDisplay?: 'short' | 'long'
  }
): string {
  if (value === undefined || value === null || value === '' || isNaN(Number(value))) {
    return '0'
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numValue)) {
    return '0'
  }

  // For very large numbers, use compact notation
  if (numValue >= 1000000 && !options?.notation) {
    return numValue.toLocaleString(undefined, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: decimals,
      ...options
    })
  }

  return numValue.toLocaleString(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits ?? (decimals > 0 ? 0 : 0),
    maximumFractionDigits: options?.maximumFractionDigits ?? decimals,
    ...options
  })
}

/**
 * Format a currency value with proper formatting
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string without currency symbol
 */
export function formatCurrency(value: number | string | undefined | null, decimals: number = 2): string {
  return formatNumber(value, decimals)
}

/**
 * Format a percentage value
 * @param value - The percentage value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with % symbol
 */
export function formatPercentage(value: number | string | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null || value === '' || isNaN(Number(value))) {
    return '0%'
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value
  return `${formatNumber(numValue, decimals)}%`
}

/**
 * Format a token amount with proper decimal handling
 * @param value - The token amount
 * @param decimals - Number of decimal places to show (default: 6)
 * @returns Formatted token amount string
 */
export function formatTokenAmount(value: number | string | undefined | null, decimals: number = 6): string {
  if (value === undefined || value === null || value === '' || isNaN(Number(value))) {
    return '0'
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (numValue === 0) {
    return '0'
  }

  // For very small amounts, show more precision
  if (numValue < 0.000001) {
    return numValue.toExponential(2)
  }

  // For small amounts, show up to 6 decimals but remove trailing zeros
  if (numValue < 1) {
    return parseFloat(numValue.toFixed(decimals)).toString()
  }

  // For larger amounts, use standard formatting
  return formatNumber(numValue, Math.min(decimals, 6))
}
