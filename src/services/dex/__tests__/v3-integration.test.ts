
import { describe, it, expect } from 'vitest';
import { createPublicClient, http } from 'viem';
import { getKalySwapV3Service } from '../KalySwapV3Service';
import { CHAIN_IDS } from '@/config/chains';
import { Token } from '@/config/dex/types';

// User provided test tokens
const TOKEN_A_ADDRESS = '0x5850B207c470C1F2F4c1ca6B1f624d4C28B729a1';
const TOKEN_B_ADDRESS = '0xA510Df56F2aa3f7241da94F2cF053C1bf02E1168';

// Mock Token Objects (Using Testnet Chain ID)
const TOKEN_A: Token = {
    chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
    address: TOKEN_A_ADDRESS,
    decimals: 18,
    symbol: 'TKA',
    name: 'Token A',
    logoURI: '',
};

const TOKEN_B: Token = {
    chainId: CHAIN_IDS.KALYCHAIN_TESTNET,
    address: TOKEN_B_ADDRESS,
    decimals: 18,
    symbol: 'TKB',
    name: 'Token B',
    logoURI: '',
};

describe('KalySwap V3 Integration (Testnet)', () => {
    const chainId = CHAIN_IDS.KALYCHAIN_TESTNET;
    const service = getKalySwapV3Service(chainId)!;

    // Create actual client for testnet
    const publicClient = createPublicClient({
        chain: {
            id: chainId,
            name: 'KalyChain Testnet',
            nativeCurrency: { name: 'Kaly', symbol: 'KLC', decimals: 18 },
            rpcUrls: { default: { http: ['https://testnetrpc.kalychain.io/rpc'] } }
        } as any,
        transport: http('https://testnetrpc.kalychain.io/rpc')
    });

    it('should identify the V3 pool for the test tokens', async () => {
        const poolAddress = await service.getV3PoolAddress(TOKEN_A, TOKEN_B, 3000, publicClient);
        console.log('Pool Address (0.3%):', poolAddress);
        expect(poolAddress).toBeTruthy();
        expect(poolAddress).not.toBe('0x0000000000000000000000000000000000000000');
    });

    it('should find the best fee tier for the pair', async () => {
        const feeTier = await service.getOptimalFeeTier(TOKEN_A, TOKEN_B, publicClient);
        console.log('Optimal Fee Tier:', feeTier);
        // Should be one of the standard uniswap ticks
        expect([100, 500, 3000, 10000]).toContain(feeTier);
    });

    it('should get pool info and verify liquidity', async () => {
        const poolInfo = await service.getV3PoolInfo(TOKEN_A, TOKEN_B, 3000, publicClient);
        console.log('Pool Info:', {
            liquidity: poolInfo?.liquidity.toString(),
            price0: poolInfo?.token0Price
        });

        expect(poolInfo).not.toBeNull();
        expect(poolInfo?.liquidity).not.toBe(0n);
    });

    it('should get a quote for swapping Token A -> Token B (Exact Input)', async () => {
        const amountIn = '1';
        const quote = await service.getV3Quote(TOKEN_A, TOKEN_B, amountIn, 3000, publicClient);

        console.log('A -> B Quote:', quote.amountOut);
        expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
        expect(quote.priceImpact).toBeDefined();
    });

    it('should get a quote for swapping Token B -> Token A (Reverse Direction)', async () => {
        const amountIn = '10';
        const quote = await service.getV3Quote(TOKEN_B, TOKEN_A, amountIn, 3000, publicClient);

        console.log('B -> A Quote:', quote.amountOut);
        expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
    });
}, 30000); // 30s timeout
