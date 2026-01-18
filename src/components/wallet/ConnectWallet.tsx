'use client'

import { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useConnect, useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useWallet } from '@/hooks/useWallet'
import { Wallet, ExternalLink, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { internalWalletConnector } from '@/connectors/internalWallet'
import { walletLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

interface ConnectWalletProps {
  children?: React.ReactNode
  className?: string
}

export function ConnectWallet({ children, className }: ConnectWalletProps) {
  const { isConnected, walletType } = useWallet()
  const { isConnected: wagmiConnected, connector } = useAccount()
  const [showWalletModal, setShowWalletModal] = useState(false)
  const { connect, connectors } = useConnect()
  const router = useRouter()

  // Use wagmi connection state as the primary source of truth
  const actuallyConnected = wagmiConnected || isConnected

  // DEBUG: Log available connectors (only in development and not during render)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      walletLogger.debug('Available connectors:', connectors.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type
      })))
      walletLogger.debug('Internal connector available:', !!internalWalletConnector)
    }
  }, [connectors])

  // Custom Connect Button approach - more reliable than trying to integrate with Rainbow Kit modal
  return (
    <div className={className}>
      {actuallyConnected ? (
        // Show connected state with Rainbow Kit button
        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus={{
            smallScreen: 'avatar',
            largeScreen: 'full',
          }}
        />
      ) : (
        // Show custom connect options when not connected
        <Dialog open={showWalletModal} onOpenChange={setShowWalletModal}>
          <DialogTrigger asChild>
            {children || (
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            )}
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-md border-white/20"
            style={{ backgroundColor: '#0c0a09' }}
          >
            <DialogHeader className="bg-stone-900 -m-6 mb-2 p-6 rounded-t-lg">
              <DialogTitle className="flex items-center gap-2" style={{ color: '#fef3c7' }}>
                <Wallet className="h-5 w-5" style={{ color: '#fef3c7' }} />
                Connect Your Wallet
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-2">
              {/* External Wallets Section */}
              <Card className="bg-white/10 backdrop-blur-[10px] border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-100">
                    <img
                      src="/icons/metamask.png"
                      alt="MetaMask"
                      className="h-4 w-4"
                    />
                    External Wallets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-amber-100 mb-4">
                    Connect your existing wallet (MetaMask, WalletConnect, etc.)
                  </p>
                  <ConnectButton.Custom>
                    {({ openConnectModal, connectModalOpen }) => (
                      <Button
                        onClick={() => {
                          setShowWalletModal(false)
                          setTimeout(() => openConnectModal(), 100)
                        }}
                        className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0"
                        disabled={connectModalOpen}
                      >
                        <img
                          src="/icons/metamask.png"
                          alt="MetaMask"
                          className="h-4 w-4 mr-2"
                        />
                        Connect External Wallet
                      </Button>
                    )}
                  </ConnectButton.Custom>
                </CardContent>
              </Card>

              {/* Internal Wallets Section */}
              <Card className="bg-white/10 backdrop-blur-[10px] border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-100">
                    <img
                      src="/icons/KalySwapLogo.png"
                      alt="KalySwap"
                      className="h-4 w-4"
                    />
                    KalySwap Wallets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-amber-100 mb-4">
                    Use your KalySwap internal wallet or create a new one
                  </p>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full border-amber-500/50 text-amber-100 hover:bg-amber-500/10 hover:border-amber-400"
                      onClick={async () => {
                        try {
                          // Use our internal wallet connector directly
                          await connect({ connector: internalWalletConnector })
                          setShowWalletModal(false)
                        } catch (error) {
                          walletLogger.error('Failed to connect internal wallet:', error)
                          alert(error instanceof Error ? error.message : 'Failed to connect internal wallet')
                        }
                      }}
                    >
                      <img
                        src="/icons/KalySwapLogo.png"
                        alt="KalySwap"
                        className="h-4 w-4 mr-2"
                      />
                      Use Internal Wallet
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-sm text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
                      onClick={() => {
                        setShowWalletModal(false)
                        router.push('/dashboard')
                      }}
                    >
                      Create New Wallet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )

  // Custom modal approach temporarily removed for pure Rainbow Kit testing
}

// Simplified version for navigation with error boundary
export function ConnectWalletButton({ className }: { className?: string }) {
  try {
    return (
      <ConnectWallet className={className}>
        <Button
          size="sm"
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold"
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect
        </Button>
      </ConnectWallet>
    )
  } catch (error) {
    // Fallback if wallet providers are not available
    return (
      <Button
        size="sm"
        className={`bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold ${className}`}
        disabled
      >
        <Wallet className="h-4 w-4 mr-2" />
        Connect
      </Button>
    )
  }
}

// Wallet info display component
export function WalletInfo() {
  const { isConnected, address, chainId, walletType, balance } = useWallet()

  if (!isConnected) {
    return null
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Connected Wallet
          </span>
          <Badge variant={walletType === 'external' ? 'default' : 'secondary'}>
            {walletType === 'external' ? 'External' : 'Internal'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Address</p>
          <p className="font-mono text-sm">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-500 mb-1">Network</p>
          <p className="text-sm">
            {chainId === CHAIN_IDS.KALYCHAIN ? 'KalyChain' : `Chain ${chainId}`}
          </p>
        </div>
        
        {balance && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Balance</p>
            <p className="text-sm font-medium">
              {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
