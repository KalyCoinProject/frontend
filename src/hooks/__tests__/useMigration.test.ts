/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMigration } from '../useMigration'

vi.mock('@/lib/logger', () => ({
  walletLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to create a valid JWT for localStorage
function createFakeJwt() {
  const payload = { id: 'user-1', username: 'testuser', exp: Math.floor(Date.now() / 1000) + 3600 }
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

describe('useMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', createFakeJwt())
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('should start with NOT_STARTED status', () => {
      // Mock the fetchMigrationStatus call on mount
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            walletMigrationStatus: null,
          },
        }),
      })

      const { result } = renderHook(() => useMigration())

      expect(result.current.status).toBe('NOT_STARTED')
      expect(result.current.thirdwebWalletAddress).toBeNull()
      expect(result.current.oldWallets).toEqual([])
      expect(result.current.currentStep).toBe('idle')
      expect(result.current.error).toBeNull()
    })

    it('should report needsMigration as false when no old wallets', () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      expect(result.current.needsMigration).toBe(false)
    })
  })

  describe('fetchMigrationStatus', () => {
    it('should update state with migration data from backend', async () => {
      const mockWallets = [
        { id: 'w1', address: '0xOldWallet1', chainId: 3888 },
        { id: 'w2', address: '0xOldWallet2', chainId: 56 },
      ]

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            walletMigrationStatus: {
              thirdwebWalletAddress: null,
              walletMigrationStatus: 'NOT_STARTED',
              walletMigratedAt: null,
              wallets: mockWallets,
              walletMigrations: [],
            },
          },
        }),
      })

      const { result } = renderHook(() => useMigration())

      await waitFor(() => {
        expect(result.current.oldWallets).toHaveLength(2)
      })

      expect(result.current.status).toBe('NOT_STARTED')
      expect(result.current.needsMigration).toBe(true)
    })

    it('should silently handle errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useMigration())

      // Should not crash — status stays at default
      await waitFor(() => {
        expect(result.current.status).toBe('NOT_STARTED')
      })
    })
  })

  describe('linkThirdwebWallet', () => {
    it('should call the linkThirdwebWallet mutation', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // Link fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { linkThirdwebWallet: { success: true } },
        }),
      })

      await act(async () => {
        await result.current.linkThirdwebWallet('0xNewWalletAddress')
      })

      expect(result.current.status).toBe('IN_PROGRESS')
      expect(result.current.thirdwebWalletAddress).toBe('0xNewWalletAddress')
    })
  })

  describe('migrateNativeTokens', () => {
    it('should call the mutation and track tx hash', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // Migrate fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { migrateNativeTokens: { txHash: '0xNativeTxHash' } },
        }),
      })

      let txHash: string
      await act(async () => {
        txHash = await result.current.migrateNativeTokens('password123', '0xNewAddr', 3888)
      })

      expect(txHash!).toBe('0xNativeTxHash')
      expect(result.current.transferProgress.nativeTransferred).toBe(true)
      expect(result.current.transferProgress.txHashes).toContain('0xNativeTxHash')
    })
  })

  describe('migrateTokens', () => {
    it('should call the mutation and track tx hashes', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // Migrate tokens fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { migrateTokens: { txHashes: ['0xTokenTx1', '0xTokenTx2'] } },
        }),
      })

      const tokenAddresses = ['0xToken1', '0xToken2']
      let hashes: string[]

      await act(async () => {
        hashes = await result.current.migrateTokens('password123', '0xNewAddr', tokenAddresses, 3888)
      })

      expect(hashes!).toEqual(['0xTokenTx1', '0xTokenTx2'])
      expect(result.current.transferProgress.tokensTransferred).toBe(true)
    })
  })

  describe('completeMigration', () => {
    it('should set status to COMPLETED', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // Complete fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { completeWalletMigration: { success: true } },
        }),
      })

      await act(async () => {
        await result.current.completeMigration()
      })

      expect(result.current.status).toBe('COMPLETED')
      expect(result.current.currentStep).toBe('complete')
    })
  })

  describe('optOut', () => {
    it('should set status to OPTED_OUT', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // OptOut fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { optOutWalletMigration: { success: true } },
        }),
      })

      await act(async () => {
        await result.current.optOut()
      })

      expect(result.current.status).toBe('OPTED_OUT')
    })
  })

  describe('fetchWalletBalance', () => {
    it('should return wallet balance data', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      const mockBalance = {
        native: { symbol: 'KLC', balance: '1000000000000000000', formattedBalance: '1.0' },
        tokens: [
          { symbol: 'USDT', balance: '1000000', address: '0xUSDT', formattedBalance: '1.0', decimals: 6, name: 'Tether' },
        ],
      }

      // Balance fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: { walletBalance: mockBalance },
        }),
      })

      let balance: any
      await act(async () => {
        balance = await result.current.fetchWalletBalance('0xSomeAddress', 3888)
      })

      expect(balance).toEqual(mockBalance)
      expect(balance.native.symbol).toBe('KLC')
      expect(balance.tokens).toHaveLength(1)
    })

    it('should return null on error', async () => {
      // Mount fetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { walletMigrationStatus: null } }),
      })

      const { result } = renderHook(() => useMigration())

      // Balance fetch fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      let balance: any
      await act(async () => {
        balance = await result.current.fetchWalletBalance('0xSomeAddress', 3888)
      })

      expect(balance).toBeNull()
    })
  })
})
