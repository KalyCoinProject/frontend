import { createConfig, http, fallback } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { supportedChains, getRpcUrls, RPC_URLS } from './chains'

// Re-export RPC URLs for backward compatibility
// NOTE: Prefer importing from '@/config/chains' directly
export const chainRpcUrls = RPC_URLS

// Get project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id'

// Create transports: each chain gets a fallback() over all its RPC URLs so
// viem automatically rotates to the next endpoint when the primary drops a
// request. batch:true coalesces simultaneous eth_calls into one HTTP POST
// per tick. This is the production-critical piece when rpc.kalychain.io is
// under load — users transparently move to rpc2.kalychain.io instead of
// seeing "Failed to fetch" and a stuck UI.
const transports = supportedChains.reduce((acc, chain) => {
  const urls = getRpcUrls(chain.id)
  const httpTransports = urls.map((url) =>
    http(url, { batch: true, retryCount: 1, retryDelay: 200, timeout: 5_000 })
  )
  acc[chain.id] = httpTransports.length > 1
    ? fallback(httpTransports, { rank: false })
    : httpTransports[0]
  return acc
}, {} as Record<number, any>)

// Wagmi config with standard connectors
// Thirdweb handles wallet connection UI and in-app wallets separately
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    injected(),
    walletConnect({
      projectId,
      metadata: {
        name: 'KalySwap V3',
        description: 'Decentralized Exchange and Launchpad on KalyChain',
        url: 'https://kalyswap.io',
        icons: ['https://kalyswap.io/logo.png'],
      },
    }),
  ],
  transports,
  ssr: false,
})

// Export for use in providers
export { projectId }

// Wallet connection configuration
export const walletConnectConfig = {
  projectId,
  metadata: {
    name: 'KalySwap V3',
    description: 'Decentralized Exchange and Launchpad on KalyChain',
    url: 'https://kalyswap.io',
    icons: ['https://kalyswap.io/logo.png'],
  },
}
