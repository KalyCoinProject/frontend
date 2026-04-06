import { useEffect, useRef, useCallback } from 'react'
import { useActiveAccount, useActiveWallet } from 'thirdweb/react'
import { thirdwebClient } from '@/config/thirdweb'
import { walletLogger } from '@/lib/logger'

const AUTHENTICATE_WITH_WALLET = `
  mutation AuthenticateWithWallet($walletAddress: String!, $email: String) {
    authenticateWithWallet(walletAddress: $walletAddress, email: $email) {
      token
      user { id username email }
    }
  }
`

/**
 * Hook that provides lazy backend authentication for Thirdweb wallet users.
 *
 * Does NOT auto-create a backend account on every wallet connect.
 * Instead, provides `ensureAuth()` that components call when they
 * need a backend session (e.g. dashboard, launchpad).
 */
export function useAutoAuth() {
  const account = useActiveAccount()
  const wallet = useActiveWallet()
  const lastAuthAddress = useRef<string | null>(null)
  const isAuthenticating = useRef(false)

  // Clear JWT when wallet disconnects
  useEffect(() => {
    if (!account && lastAuthAddress.current) {
      try {
        localStorage.removeItem('auth_token')
      } catch {}
      lastAuthAddress.current = null
    }
  }, [account])

  const ensureAuth = useCallback(async (): Promise<string | null> => {
    // Already have a valid token
    const existingToken = localStorage.getItem('auth_token')
    if (existingToken) {
      // Basic expiry check
      try {
        const payload = JSON.parse(atob(existingToken.split('.')[1]))
        if (payload.exp * 1000 > Date.now()) {
          return existingToken
        }
      } catch {}
      // Token expired or malformed — continue to re-authenticate
    }

    // No wallet connected
    if (!account?.address) return null

    // Prevent concurrent calls
    if (isAuthenticating.current) return null
    isAuthenticating.current = true

    try {
      // Try to get email from Thirdweb profile
      let email: string | undefined
      try {
        if (wallet) {
          const { getUserEmail } = await import('thirdweb/wallets')
          const result = await getUserEmail({ client: thirdwebClient })
          email = result || undefined
        }
      } catch {
        // Email is optional
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: AUTHENTICATE_WITH_WALLET,
          variables: { walletAddress: account.address, email },
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      const { token } = result.data.authenticateWithWallet
      localStorage.setItem('auth_token', token)
      lastAuthAddress.current = account.address.toLowerCase()
      return token
    } catch (error) {
      walletLogger.error('Auto-auth failed:', error)
      return null
    } finally {
      isAuthenticating.current = false
    }
  }, [account?.address, wallet])

  return { ensureAuth }
}
