/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useV3Migration } from '../useV3Migration';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Token } from '@/config/dex/types';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';

// Mock dependencies
vi.mock('wagmi', () => ({
    useAccount: vi.fn(),
    useWalletClient: vi.fn(),
    usePublicClient: vi.fn()
}));

const mockMigrateLiquidity = vi.fn();
const mockConfig = { migrator: '0xMigrator' };
const mockGetKalySwapV3Service = vi.fn().mockReturnValue({
    config: mockConfig,
    migrateLiquidity: mockMigrateLiquidity,
    getMigratorAddress: () => '0xMigrator',
});

vi.mock('@/services/dex/KalySwapV3Service', () => ({
    getKalySwapV3Service: () => mockGetKalySwapV3Service()
}));

vi.mock('viem', async () => {
    const actual = await vi.importActual('viem');
    return {
        ...actual,
        getContract: vi.fn(),
        maxUint256: 115792089237316195423570985008687907853269984665640564039457584007913129639935n
    };
});

import { getContract } from 'viem';

describe('useV3Migration', () => {
    const token0: Token = { address: '0x1', decimals: 18, symbol: 'T0', name: 'Token 0', chainId: 3889, logoURI: '' };
    const token1: Token = { address: '0x2', decimals: 18, symbol: 'T1', name: 'Token 1', chainId: 3889, logoURI: '' };
    const fee = 3000;

    const mockPublicClient = {
        simulateContract: vi.fn(),
        waitForTransactionReceipt: vi.fn()
    };
    const mockWalletClient = {
        writeContract: vi.fn()
    };
    const mockContractRead = {
        allowance: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAccount as any).mockReturnValue({ address: '0xUser', chainId: 3889 });
        (usePublicClient as any).mockReturnValue(mockPublicClient);
        (useWalletClient as any).mockReturnValue({ data: mockWalletClient });
        (getContract as any).mockReturnValue({ read: mockContractRead });
    });

    it('should initialize with correct state', () => {
        const { result } = renderHook(() => useV3Migration({ token0, token1, fee }));

        expect(result.current.isApproving).toBe(false);
        expect(result.current.isMigrating).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('approveV2LP should handle already approved allowance', async () => {
        // Mock allowance sufficiently high
        mockContractRead.allowance.mockResolvedValue(1000n);

        const { result } = renderHook(() => useV3Migration({ token0, token1, fee }));

        let txHash;
        await act(async () => {
            txHash = await result.current.approveV2LP('0xPair', '500');
        });

        expect(txHash).toBe('already-approved');
        expect(mockPublicClient.simulateContract).not.toHaveBeenCalled();
    });

    it('approveV2LP should execute approval when allowance is low', async () => {
        // Mock allowance too low
        mockContractRead.allowance.mockResolvedValue(100n);
        mockPublicClient.simulateContract.mockResolvedValue({ request: {} });
        mockWalletClient.writeContract.mockResolvedValue('0xApproveTx');

        const { result } = renderHook(() => useV3Migration({ token0, token1, fee }));

        let txHash;
        await act(async () => {
            txHash = await result.current.approveV2LP('0xPair', '500');
        });

        expect(txHash).toBe('0xApproveTx');
        expect(mockPublicClient.simulateContract).toHaveBeenCalledWith(expect.objectContaining({
            address: '0xPair',
            functionName: 'approve'
        }));
    });

    it('migrate should call service migrateLiquidity', async () => {
        mockMigrateLiquidity.mockResolvedValue('0xMigrateTx');

        const { result } = renderHook(() => useV3Migration({ token0, token1, fee }));

        let txHash;
        await act(async () => {
            txHash = await result.current.migrate(
                '0xPair',
                '1000',
                100,
                -887220,
                887220,
                '0',
                '0'
            );
        });

        expect(txHash).toBe('0xMigrateTx');
        expect(mockMigrateLiquidity).toHaveBeenCalledWith(
            expect.objectContaining({
                pair: '0xPair',
                liquidityToMigrate: '1000',
                percentageToMigrate: 100
            }),
            mockPublicClient,
            mockWalletClient
        );
    });

    it('should handle errors in migrate', async () => {
        mockMigrateLiquidity.mockRejectedValue(new Error('Migration Failed'));

        const { result } = renderHook(() => useV3Migration({ token0, token1, fee }));

        await act(async () => {
            await result.current.migrate(
                '0xPair',
                '1000',
                100,
                -887220,
                887220,
                '0',
                '0'
            );
        });

        expect(result.current.error).toBe('Migration Failed');
        expect(result.current.isMigrating).toBe(false);
    });
});
