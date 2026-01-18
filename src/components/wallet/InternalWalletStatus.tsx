'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { internalWalletUtils } from '@/connectors/internalWallet'
import { useEffect, useState } from 'react'
import { kalychain, CHAIN_IDS } from '@/config/chains'
import { arbitrum, bsc } from 'viem/chains'

// Helper function to get chain name
const getChainName = (chainId: number): string => {
  switch (chainId) {
    case CHAIN_IDS.KALYCHAIN: return 'KalyChain'
    case 56: return 'BSC'
    case 42161: return 'Arbitrum'
    default: return `Chain ${chainId}`
  }
}

// Helper function to get chain symbol
const getChainSymbol = (chainId: number): string => {
  switch (chainId) {
    case CHAIN_IDS.KALYCHAIN: return 'KLC'
    case 56: return 'BNB'
    case 42161: return 'ETH'
    default: return 'ETH'
  }
}

export default function InternalWalletStatus() {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const [internalWalletState, setInternalWalletState] = useState(internalWalletUtils.getState())

  useEffect(() => {
    const handleStateChange = () => {
      setInternalWalletState(internalWalletUtils.getState())
    }

    internalWalletUtils.addEventListener('connect', handleStateChange)
    internalWalletUtils.addEventListener('disconnect', handleStateChange)
    internalWalletUtils.addEventListener('accountsChanged', handleStateChange)
    internalWalletUtils.addEventListener('chainChanged', handleStateChange)

    return () => {
      internalWalletUtils.removeEventListener('connect', handleStateChange)
      internalWalletUtils.removeEventListener('disconnect', handleStateChange)
      internalWalletUtils.removeEventListener('accountsChanged', handleStateChange)
      internalWalletUtils.removeEventListener('chainChanged', handleStateChange)
    }
  }, [])

  // Only show if connected with internal wallet
  if (!isConnected || connector?.id !== 'kalyswap-internal') {
    return null
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-blue-900">KalySwap Internal Wallet Connected</h3>
          <p className="text-sm text-blue-700">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
          {internalWalletState.activeWallet && (
            <p className="text-xs text-blue-600 mt-1">
              {getChainName(internalWalletState.activeWallet.chainId)} • {getChainSymbol(internalWalletState.activeWallet.chainId)}
            </p>
          )}
          {internalWalletState.availableWallets.length > 1 && (
            <p className="text-xs text-blue-600 mt-1">
              {internalWalletState.availableWallets.length} wallets available across chains
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
