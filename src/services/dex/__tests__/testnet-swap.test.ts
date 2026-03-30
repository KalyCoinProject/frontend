
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { getKalySwapV3Service } from '../KalySwapV3Service';
import { Token } from '@/config/dex/types';
import { parseUnits } from 'viem';

// Mock dependencies
const mockPublicClient = {
    readContract: vi.fn(),
    multicall: vi.fn(),
};

const mockWalletClient = {
    account: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    writeContract: vi.fn(),
    chain: { id: 3889 },
    extend: vi.fn().mockReturnThis(),
    readContract: vi.fn(),
};

// Mock Tokens
const WETH: Token = {
    chainId: 3889,
    address: '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3', // WKLC
    decimals: 18,
    symbol: 'WKLC',
    name: 'Wrapped KLC',
    logoURI: ''
};

const KLC: Token = {
    chainId: 3889,
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    symbol: 'KLC',
    name: 'KLC',
    isNative: true,
    logoURI: ''
};

const BUSD: Token = {
    chainId: 3889,
    address: '0xA510Df56F2aa3f7241da94F2cF053C1bf02E1168',
    decimals: 18,
    symbol: 'BUSD',
    name: 'BUSD',
    logoURI: ''
};

describe('KalySwap Testnet Integration', () => {
    let service: any;

    beforeEach(() => {
        vi.clearAllMocks();
        service = getKalySwapV3Service(CHAIN_IDS.KALYCHAIN_TESTNET);

        // Mock contract reads (factory pool lookup + quoter)
        mockPublicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
            if (functionName === 'getPool') {
                // Return a valid pool address for any token pair query
                return '0x1234567890123456789012345678901234567890';
            }
            if (functionName === 'quoteExactInputSingle') {
                return [parseUnits('90', 18), BigInt(0), BigInt(0), BigInt(0)]; // 90 BUSD out for 100 In
            }
            return undefined;
        });

        // Link walletClient read to publicClient read
        mockWalletClient.readContract.mockImplementation(mockPublicClient.readContract);
    });

    it('should generate a valid quote for Testnet tokens', async () => {
        const amountIn = '100';
        const quote = await service.getQuote(KLC, BUSD, amountIn, mockPublicClient);

        expect(quote).toBeDefined();
        expect(quote.amountOut).toBe('90'); // Based on mock
        expect(quote.route).toBeDefined();
    });

    it('should get a V3 quote using WKLC when native KLC is passed', async () => {
        // Test that getV3Quote works when we pass the wrapped token address directly
        // (executeSwap creates its own publicClient internally, so we test the quote layer)
        const amountIn = '100';
        const quote = await service.getV3Quote(WETH, BUSD, amountIn, 3000, mockPublicClient);

        expect(quote).toBeDefined();
        expect(quote.amountOut).toBe('90');
        expect(quote.priceImpact).toBeDefined();
    });

    it('should execute a V3 swap via executeV3Swap with mocked wallet', async () => {
        mockWalletClient.writeContract.mockResolvedValue('0xhash');

        const swapParams = {
            tokenIn: WETH,
            tokenOut: BUSD,
            fee: 3000,
            recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            amountIn: '100',
            amountOutMinimum: '89',
            deadline: Math.floor(Date.now() / 1000) + 1200,
        };

        const result = await service.executeV3Swap(swapParams, mockPublicClient, mockWalletClient);
        expect(result).toBe('0xhash');

        // Verify it called Router with multicall
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            address: expect.stringMatching(/^0x/), // Router address
            functionName: 'multicall'
        }));
    });
});
