/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoAuth } from '../useAutoAuth'

// Mock Thirdweb hooks
const mockAddress = '0xb22bBb5AC91dcD2DD7795AE29bfaAa8cEC18bb85'
let mockAccount: { address: string } | undefined = undefined
let mockWallet: any = undefined

vi.mock('thirdweb/react', () => ({
  useActiveAccount: () => mockAccount,
  useActiveWallet: () => mockWallet,
}))

vi.mock('@/config/thirdweb', () => ({
  thirdwebClient: { clientId: 'test-client-id' },
}))

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

describe('useAutoAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockAccount = undefined
    mockWallet = undefined
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('ensureAuth with no wallet', () => {
    it('should return null when no wallet connected', async () => {
      const { result } = renderHook(() => useAutoAuth())

      const token = await result.current.ensureAuth()
      expect(token).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('ensureAuth with existing token', () => {
    it('should return existing valid JWT without calling backend', async () => {
      // Create a non-expired JWT (expires in 1 hour)
      const payload = { id: 'user-1', username: 'test', exp: Math.floor(Date.now() / 1000) + 3600 }
      const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`
      localStorage.setItem('auth_token', fakeJwt)

      mockAccount = { address: mockAddress }

      const { result } = renderHook(() => useAutoAuth())
      const token = await result.current.ensureAuth()

      expect(token).toBe(fakeJwt)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should re-authenticate when JWT is expired', async () => {
      // Create an expired JWT
      const payload = { id: 'user-1', username: 'test', exp: Math.floor(Date.now() / 1000) - 3600 }
      const expiredJwt = `header.${btoa(JSON.stringify(payload))}.signature`
      localStorage.setItem('auth_token', expiredJwt)

      mockAccount = { address: mockAddress }
      const newToken = 'new-jwt-token'

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            authenticateWithWallet: {
              token: newToken,
              user: { id: 'user-1', username: mockAddress.toLowerCase(), email: null },
            },
          },
        }),
      })

      const { result } = renderHook(() => useAutoAuth())
      const token = await result.current.ensureAuth()

      expect(token).toBe(newToken)
      expect(localStorage.getItem('auth_token')).toBe(newToken)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('ensureAuth with wallet connected', () => {
    beforeEach(() => {
      mockAccount = { address: mockAddress }
      mockWallet = { id: 'inApp' }
    })

    it('should call authenticateWithWallet mutation', async () => {
      const newToken = 'jwt-from-backend'

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            authenticateWithWallet: {
              token: newToken,
              user: { id: 'user-2', username: mockAddress.toLowerCase(), email: 'test@example.com' },
            },
          },
        }),
      })

      const { result } = renderHook(() => useAutoAuth())
      const token = await result.current.ensureAuth()

      expect(token).toBe(newToken)
      expect(localStorage.getItem('auth_token')).toBe(newToken)

      // Verify the GraphQL mutation was called
      const fetchCall = mockFetch.mock.calls[0]
      expect(fetchCall[0]).toBe('/api/graphql')
      const body = JSON.parse(fetchCall[1].body)
      expect(body.query).toContain('authenticateWithWallet')
      expect(body.variables.walletAddress).toBe(mockAddress)
    })

    it('should return null on backend error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errors: [{ message: 'Something went wrong' }],
        }),
      })

      const { result } = renderHook(() => useAutoAuth())
      const token = await result.current.ensureAuth()

      expect(token).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useAutoAuth())
      const token = await result.current.ensureAuth()

      expect(token).toBeNull()
    })
  })

  describe('cleanup on disconnect', () => {
    it('should clear JWT when wallet disconnects', async () => {
      // Start with a wallet connected and token stored
      mockAccount = { address: mockAddress }
      const fakeJwt = 'some-jwt-token'
      localStorage.setItem('auth_token', fakeJwt)

      const { result, rerender } = renderHook(() => useAutoAuth())

      // Simulate successful auth to set lastAuthAddress ref
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: {
            authenticateWithWallet: {
              token: 'new-token',
              user: { id: 'u1', username: 'test', email: null },
            },
          },
        }),
      })
      await result.current.ensureAuth()

      // Disconnect wallet
      mockAccount = undefined
      rerender()

      // Token should be cleared
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })
})
