import { Token } from '../types';
import { CHAIN_IDS } from '@/config/chains';

// KalyChain Testnet tokens
export const KALYCHAIN_TESTNET_TOKENS: Token[] = [
    // Native KLC
    {
        chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
        address: '0x0000000000000000000000000000000000000000', // Native token
        decimals: 18,
        name: 'KalyCoin',
        symbol: 'KLC',
        logoURI: '/tokens/klc.png',
        isNative: true
    },
    // Wrapped KLC
    {
        chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
        address: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3',
        decimals: 18,
        name: 'Wrapped KalyCoin',
        symbol: 'wKLC',
        logoURI: '/tokens/klc.png'
    },
    // Token A (tKLS) - User provided Address 1
    {
        chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
        address: '0x5850B207c470C1F2F4c1ca6B1f624d4C28B729a1',
        decimals: 18,
        name: 'Test KalySwap',
        symbol: 'tKLS',
        logoURI: '/tokens/klc.png'
    },
    // Token B (BUSD) - User provided Address 2
    {
        chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
        address: '0xA510Df56F2aa3f7241da94F2cF053C1bf02E1168',
        decimals: 18,
        name: 'Binance USD (Test)',
        symbol: 'BUSD',
        logoURI: '/tokens/busd.png'
    }
];
