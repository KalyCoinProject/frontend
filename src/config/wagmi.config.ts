import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { supportedChains, getRpcUrl, RPC_URLS } from './chains'

// Re-export RPC URLs for backward compatibility
// NOTE: Prefer importing from '@/config/chains' directly
export const chainRpcUrls = RPC_URLS

// Get project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id'

// Create transports with explicit RPC URLs from centralized config
const transports = supportedChains.reduce((acc, chain) => {
  const rpcUrl = getRpcUrl(chain.id)
  acc[chain.id] = http(rpcUrl)
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
