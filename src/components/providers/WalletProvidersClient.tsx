'use client'

import { ReactNode, createContext, useContext } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThirdwebProvider } from 'thirdweb/react'
import { wagmiConfig } from '@/config/wagmi.config'
import { useThirdwebWagmiBridge } from '@/connectors/thirdwebBridge'
import { useAutoAuth } from '@/hooks/useAutoAuth'

interface WalletProvidersClientProps {
  children: ReactNode
}

// Create QueryClient outside component to prevent recreation
// staleTime: 5000 — balance/price reads inside a 5s window dedupe instead of
// re-hitting the RPC on every store mutation. Pairs with batch:true transports
// to reduce RPC pressure when wagmi state changes trigger cascading re-renders.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
})

/**
 * Context for lazy backend authentication.
 * Components call `ensureAuth()` when they need a backend session.
 */
const AutoAuthContext = createContext<{ ensureAuth: () => Promise<string | null> }>({
  ensureAuth: async () => null,
})

export const useEnsureAuth = () => useContext(AutoAuthContext)

/**
 * Inner component that runs the bridge and auto-auth hooks.
 * Must be inside both WagmiProvider and ThirdwebProvider.
 */
function WalletBridgeAndAuth({ children }: { children: ReactNode }) {
  useThirdwebWagmiBridge()
  const { ensureAuth } = useAutoAuth()

  return (
    <AutoAuthContext.Provider value={{ ensureAuth }}>
      {children}
    </AutoAuthContext.Provider>
  )
}

function WalletProvidersClient({ children }: WalletProvidersClientProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ThirdwebProvider>
          <WalletBridgeAndAuth>
            {children}
          </WalletBridgeAndAuth>
        </ThirdwebProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default WalletProvidersClient
