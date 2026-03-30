/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useV3AddLiquidity } from '../useV3AddLiquidity';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Token } from '@/config/dex/types';

// Mock dependencies
vi.mock('@/services/dex/KalySwapV3Service');
vi.mock('wagmi', () => ({
    useAccount: () => ({ address: '0x123', chainId: 1 }),
    usePublicClient: () => ({}),
    useWalletClient: () => ({ data: { writeContract: vi.fn() } }),
}));
vi.mock('@/lib/logger', () => ({
    poolLogger: {
        error: vi.fn(),
        info: vi.fn(),
    }
}));

const mockMintV3Position = vi.fn();
const mockIncreaseLiquidity = vi.fn();

describe('useV3AddLiquidity', () => {
    const token0: Token = { address: '0x111', decimals: 18, symbol: 'T0', name: 'Token 0', chainId: 1, logoURI: '' };
    const token1: Token = { address: '0x222', decimals: 18, symbol: 'T1', name: 'Token 1', chainId: 1, logoURI: '' };
    const fee = 3000;

    beforeEach(() => {
        vi.clearAllMocks();
        (getKalySwapV3Service as any).mockReturnValue({
            mintV3Position: mockMintV3Position,
            increaseLiquidity: mockIncreaseLiquidity,
        });
    });

    it('should call mintV3Position when no tokenId is provided', async () => {
        mockMintV3Position.mockResolvedValue({ txHash: '0xmint_hash', tokenId: 1n });

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }));

        await act(async () => {
            await result.current.addLiquidity('100', '200', -100, 100);
        });

        expect(mockMintV3Position).toHaveBeenCalledWith(
            expect.objectContaining({
                token0,
                token1,
                fee,
                tickLower: -100,
                tickUpper: 100,
                amount0Desired: '100',
                amount1Desired: '200',
            }),
            expect.anything(),
            expect.anything()
        );
        expect(result.current.error).toBeNull();
    });

    it('should call increaseLiquidity when tokenId is provided', async () => {
        mockIncreaseLiquidity.mockResolvedValue('0xincrease_hash');
        const tokenId = 12345n;

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee,
            tokenId
        }));

        await act(async () => {
            // increase liquidity might not need ticks, or ignores them if provided
            await result.current.addLiquidity('50', '50');
        });

        expect(mockIncreaseLiquidity).toHaveBeenCalledWith(
            expect.objectContaining({
                tokenId,
                amount0Desired: '50',
                amount1Desired: '50',
            }),
            expect.anything(),
            expect.anything()
        );
        expect(result.current.error).toBeNull();
    });

    it('should handle errors gracefully', async () => {
        mockMintV3Position.mockRejectedValue(new Error('Mint failed'));

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }));

        await act(async () => {
            await result.current.addLiquidity('10', '10', -100, 100);
        });

        expect(result.current.error).toBe('Mint failed');
        expect(result.current.isLoading).toBe(false);
    });
});
