import { CHAIN_IDS } from '@/config/chains';
import { DexConfig } from './types';
import { KALYCHAIN_TESTNET_TOKENS } from './tokens/kalychain-testnet';
import { ROUTER_ABI, FACTORY_ABI } from '../abis';

export const KALYSWAP_TESTNET_CONFIG: DexConfig = {
    name: 'KalySwap Testnet',
    factory: '0xCd4AA7D066efc78793d19A9aE64B6798767B0c34', // From testnet.txt
    router: '0x7fD3173Eef473F64AD4553169D6d334d42Df1d95', // From testnet.txt
    subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL || 'https://localhost:8000/subgraphs/name/kalyswap/dex-subgraph',
    tokens: KALYCHAIN_TESTNET_TOKENS,
    routerABI: ROUTER_ABI,
    factoryABI: FACTORY_ABI,
    wethAddress: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', // wKLC
    nativeToken: {
        symbol: 'KLC',
        name: 'KalyCoin',
        decimals: 18,
    },
};
