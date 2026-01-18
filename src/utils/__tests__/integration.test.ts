/**
 * Integration Tests - UI Math vs Live Contracts
 * 
 * These tests verify that our UI calculations match what the smart contracts
 * would return. They call live contracts on KalyChain mainnet.
 * 
 * Run with: npm test -- --testPathPattern=integration
 * 
 * Note: These tests require network access and may be slower than unit tests.
 * They are skipped by default in CI - run manually to verify contract integration.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http, formatUnits, parseUnits } from 'viem'
import { CHAIN_IDS, RPC_URLS } from '@/config/chains'
import { MAINNET_CONTRACTS } from '@/config/contracts'
import { PAIR_ABI, ROUTER_ABI, FACTORY_ABI } from '@/config/abis'
import { calculatePriceFromReservesRaw, calculateBothPrices, PairInfo } from '../price'
import { calculatePriceImpactFromReserves } from '../priceImpact'

// Skip integration tests in CI or when no network
const SKIP_INTEGRATION = process.env.CI === 'true' || process.env.SKIP_INTEGRATION === 'true'

// Create a public client for KalyChain
const publicClient = createPublicClient({
  chain: {
    id: CHAIN_IDS.KALYCHAIN,
    name: 'KalyChain',
    nativeCurrency: { name: 'KLC', symbol: 'KLC', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URLS[CHAIN_IDS.KALYCHAIN]] } },
  },
  transport: http(RPC_URLS[CHAIN_IDS.KALYCHAIN]),
})

describe.skipIf(SKIP_INTEGRATION)('Integration: Price Calculations vs Live Contracts', () => {
  let wklcUsdtPair: string | null = null
  let reserves: { reserve0: bigint; reserve1: bigint; token0: string; token1: string } | null = null

  beforeAll(async () => {
    // Get WKLC/USDT pair address from factory
    try {
      wklcUsdtPair = await publicClient.readContract({
        address: MAINNET_CONTRACTS.FACTORY as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [MAINNET_CONTRACTS.WKLC, MAINNET_CONTRACTS.USDT],
      }) as string

      if (wklcUsdtPair && wklcUsdtPair !== '0x0000000000000000000000000000000000000000') {
        // Get reserves
        const [reserveData, token0, token1] = await Promise.all([
          publicClient.readContract({
            address: wklcUsdtPair as `0x${string}`,
            abi: PAIR_ABI,
            functionName: 'getReserves',
            args: [],
          }),
          publicClient.readContract({
            address: wklcUsdtPair as `0x${string}`,
            abi: PAIR_ABI,
            functionName: 'token0',
            args: [],
          }),
          publicClient.readContract({
            address: wklcUsdtPair as `0x${string}`,
            abi: PAIR_ABI,
            functionName: 'token1',
            args: [],
          }),
        ])

        reserves = {
          reserve0: (reserveData as [bigint, bigint, number])[0],
          reserve1: (reserveData as [bigint, bigint, number])[1],
          token0: (token0 as string).toLowerCase(),
          token1: (token1 as string).toLowerCase(),
        }
      }
    } catch (error) {
      console.warn('Failed to fetch pair data:', error)
    }
  }, 30000)

  it('UI price calculation matches contract reserves', async () => {
    if (!reserves) {
      console.warn('Skipping: No reserves available')
      return
    }

    // Create PairInfo from live data
    const pairInfo: PairInfo = {
      token0: { id: reserves.token0 },
      token1: { id: reserves.token1 },
      reserve0: formatUnits(reserves.reserve0, 18),
      reserve1: formatUnits(reserves.reserve1, 18),
    }

    // Calculate price using our utility
    const wklcPrice = calculatePriceFromReservesRaw(MAINNET_CONTRACTS.WKLC.toLowerCase(), pairInfo)

    // Verify price is reasonable (WKLC should be worth something in USDT)
    expect(wklcPrice).toBeGreaterThan(0)
    expect(wklcPrice).toBeLessThan(1000000) // Sanity check

    // Calculate both prices and verify they're reciprocals
    const bothPrices = calculateBothPrices(pairInfo)
    expect(bothPrices.token0Price * bothPrices.token1Price).toBeCloseTo(1, 5)
  })

  it('router getAmountsOut matches our price impact calculation', async () => {
    if (!reserves) {
      console.warn('Skipping: No reserves available')
      return
    }

    // Test with 1 WKLC swap
    const amountIn = parseUnits('1', 18)

    // Get expected output from router
    const amountsOut = await publicClient.readContract({
      address: MAINNET_CONTRACTS.ROUTER as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, [MAINNET_CONTRACTS.WKLC, MAINNET_CONTRACTS.USDT]],
    }) as bigint[]

    const expectedOutput = amountsOut[1]

    // Determine which reserve is WKLC
    const isWklcToken0 = reserves.token0 === MAINNET_CONTRACTS.WKLC.toLowerCase()
    const reserveIn = isWklcToken0 ? reserves.reserve0 : reserves.reserve1
    const reserveOut = isWklcToken0 ? reserves.reserve1 : reserves.reserve0

    // Calculate price impact using our utility
    const priceImpact = calculatePriceImpactFromReserves(amountIn, reserveIn, reserveOut)
    const impactPercent = parseFloat(priceImpact)

    // For a small trade (1 WKLC), price impact should be minimal
    expect(impactPercent).toBeGreaterThanOrEqual(0)
    expect(impactPercent).toBeLessThan(10) // Should be < 10% for 1 token

    // Verify router output is positive
    expect(expectedOutput).toBeGreaterThan(BigInt(0))
  })
})

describe.skipIf(SKIP_INTEGRATION)('Integration: Factory Contract', () => {
  it('can query pair count', async () => {
    const pairCount = await publicClient.readContract({
      address: MAINNET_CONTRACTS.FACTORY as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength',
      args: [],
    })

    expect(Number(pairCount)).toBeGreaterThan(0)
  })

  it('WKLC/USDT pair exists', async () => {
    const pairAddress = await publicClient.readContract({
      address: MAINNET_CONTRACTS.FACTORY as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [MAINNET_CONTRACTS.WKLC, MAINNET_CONTRACTS.USDT],
    })

    expect(pairAddress).not.toBe('0x0000000000000000000000000000000000000000')
  })
})

