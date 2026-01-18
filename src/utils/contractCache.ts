'use client'

import { contractLogger } from '@/lib/logger';

/**
 * Contract data caching system
 * Caches contract responses for 30-60 seconds to avoid redundant calls
 */

export interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

export interface CacheOptions {
  ttl?: number // Default 45 seconds
  key?: string
}

class ContractCache {
  private cache = new Map<string, CacheEntry>()
  private defaultTTL = 45 * 1000 // 45 seconds

  /**
   * Get cached data if still valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, remove it
      this.cache.delete(key)
      return null
    }

    contractLogger.debug(`📦 Cache HIT for ${key}`)
    return entry.data as T
  }

  /**
   * Set cache data
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const ttl = options.ttl || this.defaultTTL
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })

    contractLogger.debug(`💾 Cache SET for ${key} (TTL: ${ttl}ms)`)
  }

  /**
   * Check if cache has valid entry
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
    contractLogger.debug(`🗑️ Cache DELETE for ${key}`)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    contractLogger.debug('🗑️ Cache CLEARED')
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      contractLogger.debug(`🧹 Cache cleanup: removed ${cleaned} expired entries`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    entries: Array<{ key: string; age: number; ttl: number }>
  } {
    const now = Date.now()
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      ttl: entry.ttl
    }))

    return {
      size: this.cache.size,
      entries
    }
  }
}

// Global cache instance
const contractCache = new ContractCache()

// Cleanup expired entries every 2 minutes
setInterval(() => {
  contractCache.cleanup()
}, 2 * 60 * 1000)

export { contractCache }

/**
 * Cache key generators for different types of data
 */
export const CacheKeys = {
  // Farm data keys
  farmingData: (chainId: number, userAddress?: string) =>
    userAddress ? `farming:all:${chainId}:${userAddress}` : `farming:all:${chainId}:general`,
  
  singleFarmData: (chainId: number, pairAddress: string, userAddress?: string) =>
    `farming:single:${chainId}:${pairAddress}:${userAddress || 'anonymous'}`,
  
  liquidityManagerData: (chainId: number, stakingAddress: string) =>
    `liquidity:manager:${chainId}:${stakingAddress}`,
  
  stakingRewardsData: (chainId: number, stakingAddress: string, userAddress?: string) =>
    `staking:rewards:${chainId}:${stakingAddress}:${userAddress || 'anonymous'}`,
  
  pairAddresses: (chainId: number) =>
    `pair:addresses:${chainId}`,

  // Token data keys
  tokenBalance: (chainId: number, tokenAddress: string, userAddress: string) =>
    `token:balance:${chainId}:${tokenAddress}:${userAddress}`,
  
  tokenInfo: (chainId: number, tokenAddress: string) =>
    `token:info:${chainId}:${tokenAddress}`
}

/**
 * Cached async function wrapper
 */
export function withCache<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  options: CacheOptions = {}
) {
  return async (...args: T): Promise<R> => {
    const key = keyGenerator(...args)
    
    // Try to get from cache first
    const cached = contractCache.get<R>(key)
    if (cached !== null) {
      return cached
    }

    // Cache miss, execute function
    contractLogger.debug(`📡 Cache MISS for ${key}, fetching...`)
    try {
      const result = await fn(...args)
      contractCache.set(key, result, options)
      return result
    } catch (error) {
      contractLogger.error(`❌ Failed to fetch ${key}:`, error)
      throw error
    }
  }
}

/**
 * Invalidate cache entries by pattern
 */
export function invalidateCache(pattern: string): void {
  const keys = Array.from(contractCache['cache'].keys())
  const matchingKeys = keys.filter(key => key.includes(pattern))
  
  matchingKeys.forEach(key => {
    contractCache.delete(key)
  })

  contractLogger.debug(`🗑️ Invalidated ${matchingKeys.length} cache entries matching "${pattern}"`)
}

/**
 * Preload cache with data
 */
export function preloadCache<T>(key: string, data: T, options: CacheOptions = {}): void {
  contractCache.set(key, data, options)
}

export default contractCache
