'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { Contract, ethers } from 'ethers'
import factoryABI from '@/config/abis/dex/factoryABI.json'
import { KALYCHAIN_TOKENS } from '@/config/farming'
import { farmingLogger } from '@/lib/logger'

interface PairInfo {
  token0: string
  token1: string
  pairAddress: string
  exists: boolean
}

export function usePairAddresses() {
  const { chainId } = useWallet()
  const [pairAddresses, setPairAddresses] = useState<{ [key: string]: string }>({})
  const [loading, setLoading] = useState(true)
  const lastChainIdRef = useRef<number | undefined>(undefined)
  const isFetchingRef = useRef(false)

  // Factory contract address on KalyChain
  const FACTORY_ADDRESS = '0xD42Af909d323D88e0E933B6c50D3e91c279004ca'

  const getFactoryContract = useCallback(() => {
    try {
      // Create a provider for reading contract data
      const provider = new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
      return new Contract(FACTORY_ADDRESS, factoryABI, provider)
    } catch (error) {
      farmingLogger.error('Error creating factory contract:', error)
      return null
    }
  }, [])

  const getPairAddress = useCallback(async (
    tokenA: string,
    tokenB: string
  ): Promise<string | null> => {
    try {
      const factory = getFactoryContract()
      if (!factory) return null

      const pairAddress = await factory.getPair(tokenA, tokenB)
      
      // Check if pair exists (not zero address)
      if (pairAddress && pairAddress !== '0x0000000000000000000000000000000000000000') {
        return pairAddress
      }
      
      return null
    } catch (error) {
      farmingLogger.error('Error getting pair address:', error)
      return null
    }
  }, [getFactoryContract])

  const fetchAllPairAddresses = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      return
    }

    // Check if we already have data and chainId hasn't changed
    if (lastChainIdRef.current === chainId && Object.keys(pairAddresses).length > 0) {
      return
    }

    isFetchingRef.current = true
    lastChainIdRef.current = chainId
    setLoading(true)
    
    try {
      const pairs = [
        { key: 'WKLC_KSWAP', tokenA: KALYCHAIN_TOKENS.WKLC.address, tokenB: KALYCHAIN_TOKENS.KSWAP.address },
        { key: 'WKLC_USDT', tokenA: KALYCHAIN_TOKENS.WKLC.address, tokenB: KALYCHAIN_TOKENS.USDT.address },
        { key: 'KSWAP_USDT', tokenA: KALYCHAIN_TOKENS.KSWAP.address, tokenB: KALYCHAIN_TOKENS.USDT.address },
        { key: 'WKLC_USDC', tokenA: KALYCHAIN_TOKENS.WKLC.address, tokenB: KALYCHAIN_TOKENS.USDC.address },
        { key: 'WKLC_WBTC', tokenA: KALYCHAIN_TOKENS.WKLC.address, tokenB: KALYCHAIN_TOKENS.WBTC.address },
        { key: 'WKLC_ETH', tokenA: KALYCHAIN_TOKENS.WKLC.address, tokenB: KALYCHAIN_TOKENS.ETH.address }
      ]

      const results = await Promise.allSettled(
        pairs.map(async (pair) => {
          const address = await getPairAddress(pair.tokenA, pair.tokenB)
          return { key: pair.key, address }
        })
      )

      const newPairAddresses: { [key: string]: string } = {}
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.address) {
          newPairAddresses[result.value.key] = result.value.address
        } else {
          // Use known addresses as fallback
          if (pairs[index].key === 'WKLC_USDT') {
            newPairAddresses[pairs[index].key] = '0x25FDDaF836d12dC5e285823a644bb86E0b79c8e2'
          }
        }
      })

      // Only update if the addresses have actually changed
      const hasChanged = JSON.stringify(pairAddresses) !== JSON.stringify(newPairAddresses)
      if (hasChanged) {
        setPairAddresses(newPairAddresses)
      }
    } catch (error) {
      farmingLogger.error('Error fetching pair addresses:', error)
      // Set known addresses as fallback
      setPairAddresses({
        'WKLC_USDT': '0x25FDDaF836d12dC5e285823a644bb86E0b79c8e2'
      })
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [chainId, getPairAddress, pairAddresses]) // Depend on chainId and getPairAddress

  useEffect(() => {
    fetchAllPairAddresses()
  }, [fetchAllPairAddresses]) // Depend on the function itself

  return {
    pairAddresses,
    loading,
    getPairAddress,
    refetch: fetchAllPairAddresses
  }
}
