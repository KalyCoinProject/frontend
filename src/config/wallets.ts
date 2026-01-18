import { walletLogger } from '@/lib/logger';
import { Wallet } from '@rainbow-me/rainbowkit'
import { Chain } from 'viem'
import { internalWalletConnector } from '@/connectors/internalWallet'

// KalySwap Internal Wallet configuration for Rainbow Kit
// Following the working Arcana pattern - function that returns wallet
export const kalyswapWallet = (params: any = {}): Wallet => {
  walletLogger.debug('Creating KalySwap Wallet configuration...', params)
  return {
    id: 'kalyswap-internal',
    name: 'KalySwap Wallet',
    iconUrl: '/icons/kalyswap-wallet.svg',
    iconBackground: '#3B82F6',
  downloadUrls: {
    browserExtension: 'https://kalyswap.io/wallet',
    android: 'https://kalyswap.io/wallet',
    ios: 'https://kalyswap.io/wallet',
    mobile: 'https://kalyswap.io/wallet',
    qrCode: 'https://kalyswap.io/wallet',
  },
  mobile: {
    getUri: () => 'https://kalyswap.io/wallet',
  },
  qrCode: {
    getUri: () => 'https://kalyswap.io/wallet',
    instructions: {
      learnMoreUrl: 'https://kalyswap.io/wallet',
      steps: [
        {
          description: 'Create or import your wallet on KalySwap dashboard',
          step: 'install',
          title: 'Get KalySwap Wallet',
        },
        {
          description: 'Login to your KalySwap account to access your wallets',
          step: 'create',
          title: 'Access Your Wallets',
        },
        {
          description: 'Select your wallet and confirm the connection',
          step: 'scan',
          title: 'Connect Wallet',
        },
      ],
    },
  },
  extension: {
    instructions: {
      learnMoreUrl: 'https://kalyswap.io/wallet',
      steps: [
        {
          description: 'Login to your KalySwap account to access your internal wallets',
          step: 'install',
          title: 'Access KalySwap Wallet',
        },
        {
          description: 'Select from your existing wallets or create a new one',
          step: 'create',
          title: 'Choose Wallet',
        },
        {
          description: 'Enter your wallet password to connect securely',
          step: 'refresh',
          title: 'Connect Wallet',
        },
      ],
    },
  },
  createConnector: () => {
    walletLogger.debug('Creating internal wallet connector...')
    // Return the connector function directly (corrected from Arcana pattern)
    return internalWalletConnector
  },
}
}

// Wallet groups for Rainbow Kit
export const walletGroups = [
  {
    groupName: 'Popular',
    wallets: [kalyswapWallet],
  },
]

// Export individual wallet for easy access
export { kalyswapWallet as internalWallet }
