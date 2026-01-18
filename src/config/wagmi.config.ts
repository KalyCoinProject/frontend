import { walletLogger } from '@/lib/logger';
import { getDefaultConfig, getDefaultWallets, connectorsForWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { supportedChains, RPC_URLS, getRpcUrl } from './chains'
import { kalyswapWallet } from './wallets'

// Get project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id'

// Re-export RPC URLs for backward compatibility
// NOTE: Prefer importing from '@/config/chains' directly
export const chainRpcUrls = RPC_URLS;

// Create wagmi config with internal wallet registered for auto-reconnection
const createWagmiConfigWithInternalWallet = () => {
  // Get default wallets
  const { wallets } = getDefaultWallets({
    appName: 'KalySwap V3',
    projectId,
  })

  // Add our internal wallet to ensure it's registered for auto-reconnection
  const allWallets = [
    ...wallets,
    {
      groupName: 'KalySwap',
      wallets: [kalyswapWallet],
    },
  ]

  // Create connectors - this registers the internal wallet for auto-reconnection
  const connectors = connectorsForWallets(allWallets, {
    appName: 'KalySwap V3',
    projectId,
  })

  // Create transports with explicit RPC URLs from centralized config
  const transports = supportedChains.reduce((acc, chain) => {
    const rpcUrl = getRpcUrl(chain.id)
    acc[chain.id] = http(rpcUrl)
    return acc
  }, {} as Record<number, any>)

  return createConfig({
    chains: supportedChains,
    connectors,
    transports,
    ssr: false,
  })
}

// Use config with internal wallet registered
export const wagmiConfig = createWagmiConfigWithInternalWallet()

// DEBUG: Log the configuration (only in development)
if (process.env.NODE_ENV === 'development') {
  walletLogger.debug('Wagmi Config Created with custom connect button approach:', {
    chains: supportedChains.map(c => ({ id: c.id, name: c.name })),
    approach: 'Custom Connect Button with separate internal wallet handling'
  })
}

// Export for use in providers
export { projectId }

// Wallet connection configuration
export const walletConnectConfig = {
  projectId,
  metadata: {
    name: 'KalySwap V3',
    description: 'Decentralized Exchange and Launchpad on KalyChain',
    url: 'https://kalyswap.io', // Update with actual domain
    icons: ['https://kalyswap.io/logo.png'], // Update with actual logo
  },
}

// Rainbow Kit theme configuration
export const rainbowKitTheme = {
  blurs: {
    modalOverlay: 'blur(4px)',
  },
  colors: {
    accentColor: '#3B82F6', // Blue accent to match platform
    accentColorForeground: 'white',
    actionButtonBorder: 'rgba(255, 255, 255, 0.04)',
    actionButtonBorderMobile: 'rgba(255, 255, 255, 0.08)',
    actionButtonSecondaryBackground: 'rgba(255, 255, 255, 0.08)',
    closeButton: 'rgba(224, 232, 255, 0.6)',
    closeButtonBackground: 'rgba(255, 255, 255, 0.08)',
    connectButtonBackground: '#3B82F6',
    connectButtonBackgroundError: '#FF6B6B',
    connectButtonInnerBackground: 'linear-gradient(0deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.15))',
    connectButtonText: 'white',
    connectButtonTextError: 'white',
    connectionIndicator: '#30D158',
    downloadBottomCardBackground: 'linear-gradient(126deg, rgba(255, 255, 255, 0) 9.49%, rgba(171, 171, 171, 0.04) 71.04%), #1A1B1F',
    downloadTopCardBackground: 'linear-gradient(126deg, rgba(171, 171, 171, 0.2) 9.49%, rgba(255, 255, 255, 0) 71.04%), #1A1B1F',
    error: '#FF6B6B',
    generalBorder: 'rgba(255, 255, 255, 0.08)',
    generalBorderDim: 'rgba(255, 255, 255, 0.04)',
    menuItemBackground: 'rgba(224, 232, 255, 0.1)',
    modalBackdrop: 'rgba(0, 0, 0, 0.5)',
    modalBackground: 'white',
    modalBorder: 'rgba(255, 255, 255, 0.08)',
    modalText: '#1F2937',
    modalTextDim: '#6B7280',
    modalTextSecondary: '#9CA3AF',
    profileAction: 'rgba(224, 232, 255, 0.1)',
    profileActionHover: 'rgba(224, 232, 255, 0.2)',
    profileForeground: 'rgba(224, 232, 255, 0.05)',
    selectedOptionBorder: 'rgba(224, 232, 255, 0.1)',
    standby: '#FFD23F',
  },
  fonts: {
    body: 'Inter, system-ui, sans-serif',
  },
  radii: {
    actionButton: '12px',
    connectButton: '12px',
    menuButton: '12px',
    modal: '16px',
    modalMobile: '16px',
  },
  shadows: {
    connectButton: '0px 4px 12px rgba(0, 0, 0, 0.1)',
    dialog: '0px 8px 32px rgba(0, 0, 0, 0.32)',
    profileDetailsAction: '0px 2px 6px rgba(37, 41, 46, 0.04)',
    selectedOption: '0px 2px 6px rgba(0, 0, 0, 0.24)',
    selectedWallet: '0px 2px 6px rgba(0, 0, 0, 0.12)',
    walletLogo: '0px 2px 16px rgba(0, 0, 0, 0.16)',
  },
}

// Export configuration for different environments
export const getWagmiConfig = () => {
  return getDefaultConfig({
    appName: 'KalySwap V3',
    projectId,
    chains: supportedChains,
    ssr: true,
  })
}
