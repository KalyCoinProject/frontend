'use client'

import { ReactNode, useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/config/wagmi.config'
import { useHydration } from '@/hooks/useHydration'
import { kalychain } from '@/config/chains'

// Import Rainbow Kit styles
import '@rainbow-me/rainbowkit/styles.css'

interface WalletProvidersClientProps {
  children: ReactNode
}

// Create QueryClient outside component to prevent recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
})

function WalletProvidersClient({ children }: WalletProvidersClientProps) {
  const isHydrated = useHydration()

  // Initialize internal wallet state on client side after hydration
  useEffect(() => {
    if (isHydrated) {
      // Use setTimeout to defer initialization until after React has finished hydrating
      const timeoutId = setTimeout(() => {
        import('@/connectors/internalWallet').then(({ internalWalletUtils }) => {
          internalWalletUtils.initialize()
        }).catch(error => {
          console.warn('Failed to initialize internal wallet:', error)
        })
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [isHydrated])

  // Return children without wallet providers during SSR
  if (!isHydrated) {
    return <>{children}</>
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider
          modalSize="compact"
          showRecentTransactions={true}
          initialChain={kalychain}
        >
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default WalletProvidersClient
