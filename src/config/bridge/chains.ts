// Bridge Chain Configuration - Production Ready Configuration
// This file contains complete chain configurations for bridge operations

import { ChainMap, ChainMetadata, ExplorerFamily } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { CHAIN_IDS } from '@/config/chains';

// Complete chain configurations matching production standards
export const bridgeChains: ChainMap<ChainMetadata> = {
  kalychain: {
    protocol: ProtocolType.Ethereum,
    chainId: CHAIN_IDS.KALYCHAIN,
    domainId: CHAIN_IDS.KALYCHAIN,
    name: 'kalychain',
    displayName: 'KalyChain',
    nativeToken: { name: 'KalyCoin', symbol: 'KLC', decimals: 18 },
    rpcUrls: [{ http: 'https://rpc.kalychain.io/rpc' }],
    blockExplorers: [
      {
        name: 'KalyScan',
        url: 'https://kalyscan.io',
        apiUrl: 'https://kalyscan.io/api',
        family: ExplorerFamily.Etherscan,
      },
    ],
    blocks: {
      confirmations: 1,
      reorgPeriod: 1,
      estimateBlockTime: 2,
    },
    logoURI: '/logos/klc.svg',
  },
  arbitrum: {
    protocol: ProtocolType.Ethereum,
    chainId: 42161,
    domainId: 42161,
    name: 'arbitrum',
    displayName: 'Arbitrum One',
    nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [{ http: 'https://arb1.arbitrum.io/rpc' }],
    blockExplorers: [
      {
        name: 'Arbiscan',
        url: 'https://arbiscan.io',
        apiUrl: 'https://api.arbiscan.io/api',
        family: ExplorerFamily.Etherscan,
      },
    ],
    blocks: {
      confirmations: 1,
      reorgPeriod: 1,
      estimateBlockTime: 1,
    },
    logoURI: '/logos/arbitrum.svg',
  },
  bsc: {
    protocol: ProtocolType.Ethereum,
    chainId: 56,
    domainId: 56,
    name: 'bsc',
    displayName: 'BNB Smart Chain',
    nativeToken: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: [{ http: 'https://bsc-dataseed.binance.org' }],
    blockExplorers: [
      {
        name: 'BscScan',
        url: 'https://bscscan.com',
        apiUrl: 'https://api.bscscan.com/api',
        family: ExplorerFamily.Etherscan,
      },
    ],
    blocks: {
      confirmations: 1,
      reorgPeriod: 15,
      estimateBlockTime: 3,
    },
    logoURI: '/logos/bnb.svg',
  },
  clisha: {
    protocol: ProtocolType.Ethereum,
    chainId: 3890,
    domainId: 3890,
    name: 'clisha',
    displayName: 'Clisha',
    nativeToken: { name: 'Clisha Coin', symbol: 'CLISHA', decimals: 18 },
    rpcUrls: [{ http: 'https://rpc.clishachain.com/rpc' }],
    blockExplorers: [
      {
        name: 'ClishaScan',
        url: 'https://clishascan.com',
        apiUrl: 'https://clishascan.com/api',
        family: ExplorerFamily.Etherscan,
      },
    ],
    blocks: {
      confirmations: 1,
      reorgPeriod: 2,
      estimateBlockTime: 4,
    },
    logoURI: '/logos/clisha.svg',
  },
};

export type BridgeChain = ChainMetadata;
