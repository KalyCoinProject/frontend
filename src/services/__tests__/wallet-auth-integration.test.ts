/**
 * Integration tests for the wallet authentication flow.
 * Tests the full backend authenticateWithWallet mutation against the live API.
 *
 * These tests require the backend to be running at localhost:3000.
 * Skip in CI with SKIP_INTEGRATION=true.
 */
import { describe, it, expect } from 'vitest'

const SKIP_INTEGRATION = process.env.CI === 'true' || process.env.SKIP_INTEGRATION === 'true'
const API_URL = 'http://localhost:3000/api/graphql'

const AUTHENTICATE_WITH_WALLET = `
  mutation AuthenticateWithWallet($walletAddress: String!, $email: String) {
    authenticateWithWallet(walletAddress: $walletAddress, email: $email) {
      token
      user {
        id
        username
        email
      }
    }
  }
`

const ME_QUERY = `
  query Me {
    me {
      id
      username
      email
      thirdwebWalletAddress
    }
  }
`

async function graphqlRequest(query: string, variables?: Record<string, any>, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })

  return response.json()
}

describe.skipIf(SKIP_INTEGRATION)('Wallet Authentication Integration', () => {
  // Use a unique address for each test run to avoid conflicts
  const testAddress = `0x${Date.now().toString(16).padStart(40, '0')}`

  it('should create a new user for a fresh wallet address', async () => {
    const result = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddress,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data.authenticateWithWallet).toBeDefined()
    expect(result.data.authenticateWithWallet.token).toBeTruthy()
    expect(result.data.authenticateWithWallet.user.username).toBe(testAddress.toLowerCase())
  }, 10000)

  it('should return the same user for repeated calls with same address', async () => {
    const result1 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddress,
    })

    const result2 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddress,
    })

    expect(result1.data.authenticateWithWallet.user.id)
      .toBe(result2.data.authenticateWithWallet.user.id)
  }, 10000)

  it('should return a valid JWT that works with me query', async () => {
    const authResult = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddress,
    })

    const token = authResult.data.authenticateWithWallet.token

    const meResult = await graphqlRequest(ME_QUERY, undefined, token)

    expect(meResult.errors).toBeUndefined()
    expect(meResult.data.me).toBeDefined()
    expect(meResult.data.me.username).toBe(testAddress.toLowerCase())
  }, 10000)

  it('should store email when provided', async () => {
    const emailAddress = `0x${(Date.now() + 1).toString(16).padStart(40, '0')}`
    const testEmail = `test-${Date.now()}@example.com`

    const result = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: emailAddress,
      email: testEmail,
    })

    expect(result.data.authenticateWithWallet.user.email).toBe(testEmail)
  }, 10000)

  it('should handle case-insensitive wallet addresses', async () => {
    const addr = `0xABCDEF${Date.now().toString(16).padStart(34, '0')}`

    const result1 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: addr.toUpperCase(),
    })

    const result2 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: addr.toLowerCase(),
    })

    expect(result1.data.authenticateWithWallet.user.id)
      .toBe(result2.data.authenticateWithWallet.user.id)
  }, 10000)

  it('should handle email conflict gracefully', async () => {
    const addr1 = `0x1111${Date.now().toString(16).padStart(36, '0')}`
    const addr2 = `0x2222${Date.now().toString(16).padStart(36, '0')}`
    const sharedEmail = `shared-${Date.now()}@example.com`

    // First user claims the email
    const result1 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: addr1,
      email: sharedEmail,
    })
    expect(result1.errors).toBeUndefined()

    // Second user with same email should still work (email skipped)
    const result2 = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: addr2,
      email: sharedEmail,
    })
    expect(result2.errors).toBeUndefined()
    expect(result2.data.authenticateWithWallet.user.id).not.toBe(
      result1.data.authenticateWithWallet.user.id
    )
  }, 15000)
})

describe.skipIf(SKIP_INTEGRATION)('Thirdweb Custom Auth Endpoint Integration', () => {
  const AUTH_ENDPOINT_URL = 'http://localhost:3000/api/auth/thirdweb'

  it('should verify a valid KalySwap JWT', async () => {
    // First, get a valid JWT via login or authenticateWithWallet
    const testAddr = `0xAUTH${Date.now().toString(16).padStart(36, '0')}`

    const authResult = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddr,
    })
    const jwt = authResult.data.authenticateWithWallet.token

    // Call the Thirdweb auth endpoint with the JWT as payload
    const response = await fetch(AUTH_ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: jwt }),
    })

    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.userId).toBeTruthy()
    expect(result.userId).toBe(authResult.data.authenticateWithWallet.user.id)
  }, 10000)

  it('should reject an invalid JWT', async () => {
    const response = await fetch(AUTH_ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'invalid-jwt-token' }),
    })

    expect(response.status).toBe(401)
    const result = await response.json()
    expect(result.message).toBeTruthy()
  }, 10000)

  it('should reject missing payload', async () => {
    const response = await fetch(AUTH_ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(401)
  }, 10000)

  it('should reject non-POST methods', async () => {
    const response = await fetch(AUTH_ENDPOINT_URL, {
      method: 'GET',
    })

    expect(response.status).toBe(405)
  }, 10000)
})

describe.skipIf(SKIP_INTEGRATION)('Migration GraphQL Integration', () => {
  let authToken: string
  const testAddr = `0xMIG${Date.now().toString(16).padStart(37, '0')}`

  it('should query walletMigrationStatus', async () => {
    // Create a user first
    const authResult = await graphqlRequest(AUTHENTICATE_WITH_WALLET, {
      walletAddress: testAddr,
    })
    authToken = authResult.data.authenticateWithWallet.token

    const result = await graphqlRequest(`
      query {
        walletMigrationStatus {
          walletMigrationStatus
          thirdwebWalletAddress
          wallets { id address chainId }
          walletMigrations { id }
        }
      }
    `, undefined, authToken)

    expect(result.errors).toBeUndefined()
    expect(result.data.walletMigrationStatus).toBeDefined()
    expect(result.data.walletMigrationStatus.walletMigrationStatus).toBe('NOT_STARTED')
  }, 10000)

  it('should link a thirdweb wallet address', async () => {
    const result = await graphqlRequest(`
      mutation {
        linkThirdwebWallet(thirdwebAddress: "${testAddr.toLowerCase()}") {
          success
        }
      }
    `, undefined, authToken)

    expect(result.errors).toBeUndefined()
    expect(result.data.linkThirdwebWallet.success).toBe(true)
  }, 10000)
})
