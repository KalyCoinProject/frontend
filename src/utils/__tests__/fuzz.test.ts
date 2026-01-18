/**
 * Fuzz Tests for Math Functions
 * 
 * Uses seeded random number generation for reproducible edge case discovery.
 * These tests verify that our math functions handle a wide range of inputs
 * without crashing or producing invalid results.
 */
import { describe, it, expect } from 'vitest'
import { calculateBothPrices, calculatePriceFromReservesRaw, PairInfo } from '../price'
import { calculatePriceImpactFromReserves, getPriceImpactSeverity } from '../priceImpact'
import { parseKLCAmount, fromWei, calcPercent } from '../staking/mathHelpers'

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  nextBigInt(min: bigint, max: bigint): bigint {
    const range = max - min
    const randomFraction = this.next()
    return min + BigInt(Math.floor(Number(range) * randomFraction))
  }
}

const FUZZ_ITERATIONS = 100
const SEED = 42 // Fixed seed for reproducibility

describe('Fuzz Tests: Price Calculations', () => {
  const rng = new SeededRandom(SEED)

  it('calculateBothPrices never crashes with random reserves', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const reserve0 = rng.nextInt(1, 1e15).toString()
      const reserve1 = rng.nextInt(1, 1e15).toString()

      const pairInfo: PairInfo = {
        token0: { id: '0x1' },
        token1: { id: '0x2' },
        reserve0,
        reserve1,
      }

      const result = calculateBothPrices(pairInfo)

      // Should never throw
      expect(result).toBeDefined()
      expect(typeof result.token0Price).toBe('number')
      expect(typeof result.token1Price).toBe('number')

      // Prices should be positive for positive reserves
      expect(result.token0Price).toBeGreaterThan(0)
      expect(result.token1Price).toBeGreaterThan(0)

      // Prices should be reciprocals
      expect(result.token0Price * result.token1Price).toBeCloseTo(1, 5)
    }
  })

  it('calculatePriceFromReservesRaw handles extreme ratios', () => {
    const extremeRatios = [
      { reserve0: '1', reserve1: '1000000000000' }, // Very small token0
      { reserve0: '1000000000000', reserve1: '1' }, // Very large token0
      { reserve0: '1', reserve1: '1' }, // Equal reserves
    ]

    for (const { reserve0, reserve1 } of extremeRatios) {
      const pairInfo: PairInfo = {
        token0: { id: '0xabc' },
        token1: { id: '0xdef' },
        reserve0,
        reserve1,
      }

      const price = calculatePriceFromReservesRaw('0xabc', pairInfo)
      expect(isFinite(price)).toBe(true)
      expect(price).toBeGreaterThan(0)
    }
  })
})

describe('Fuzz Tests: Price Impact', () => {
  const rng = new SeededRandom(SEED + 1)

  it('calculatePriceImpactFromReserves never crashes with random inputs', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const reserveIn = rng.nextBigInt(BigInt(1e18), BigInt(1e24))
      const reserveOut = rng.nextBigInt(BigInt(1e18), BigInt(1e24))
      const inputAmount = rng.nextBigInt(BigInt(1e15), reserveIn / BigInt(2))

      const result = calculatePriceImpactFromReserves(inputAmount, reserveIn, reserveOut)

      expect(result).toBeDefined()
      const impact = parseFloat(result)
      expect(isFinite(impact)).toBe(true)
      expect(impact).toBeGreaterThanOrEqual(0)
    }
  })

  it('price impact is always non-negative', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const reserveIn = rng.nextBigInt(BigInt(1e18), BigInt(1e24))
      const reserveOut = rng.nextBigInt(BigInt(1e18), BigInt(1e24))
      const inputAmount = rng.nextBigInt(BigInt(1), reserveIn)

      const result = calculatePriceImpactFromReserves(inputAmount, reserveIn, reserveOut)
      const impact = parseFloat(result)

      expect(impact).toBeGreaterThanOrEqual(0)
    }
  })

  it('getPriceImpactSeverity handles all valid impact values', () => {
    const testValues = ['0', '0.05', '0.5', '1', '2.5', '5', '10', '15', '50', '100']

    for (const value of testValues) {
      const result = getPriceImpactSeverity(value)
      expect(['low', 'medium', 'high', 'critical']).toContain(result.severity)
      expect(result.priceImpact).toBe(value)
    }
  })
})

describe('Fuzz Tests: Staking Math', () => {
  const rng = new SeededRandom(SEED + 2)

  it('parseKLCAmount handles random decimal strings', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const intPart = rng.nextInt(0, 1000000)
      const decPart = rng.nextInt(0, 999999999999999999)
      const amount = `${intPart}.${decPart.toString().padStart(18, '0')}`

      const result = parseKLCAmount(amount)
      expect(result).toBeGreaterThanOrEqual(BigInt(0))
    }
  })

  it('fromWei handles random values without overflow', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const value = rng.nextInt(0, Number.MAX_SAFE_INTEGER)
      const result = fromWei(value)

      expect(isFinite(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })

  it('calcPercent handles random bigint values', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const rewards = rng.nextBigInt(BigInt(0), BigInt(1e24))
      const total = rng.nextBigInt(BigInt(1), BigInt(1e24))

      const result = calcPercent(rewards, total)

      expect(isFinite(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })
})

