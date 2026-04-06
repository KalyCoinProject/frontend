/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import V3Migration from '../V3Migration';
import { useV3Migration } from '@/hooks/v3/useV3Migration';
import { useUserPositions } from '@/hooks/useUserPositions';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Token } from '@/config/dex/types';

// Mock wagmi hooks used by V3Migration component
vi.mock('wagmi', () => ({
    usePublicClient: () => ({}),
    useAccount: () => ({ address: '0xUser', chainId: 3889 }),
    useWalletClient: () => ({ data: {} }),
}));

// Mock hooks and components
vi.mock('@/hooks/v3/useV3Migration');
vi.mock('@/hooks/useUserPositions');
vi.mock('../TickRangeSelector', () => ({
    default: () => <div data-testid="tick-range-selector">Tick Range Selector</div>
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
    Button: (props: any) => <button {...props}>{props.children}</button>
}));
vi.mock('@/components/ui/card', () => ({
    Card: ({ children }: any) => <div>{children}</div>
}));

describe('V3Migration Component', () => {
    const token0: Token = { address: '0x1', decimals: 18, symbol: 'T0', name: 'Token 0', chainId: 1, logoURI: '' };
    const token1: Token = { address: '0x2', decimals: 18, symbol: 'T1', name: 'Token 1', chainId: 1, logoURI: '' };
    const pairAddress = '0xPair';

    // Default mock returns
    const mockApproveV2LP = vi.fn();
    const mockMigrate = vi.fn();
    const mockGetPosition = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        (useV3Migration as any).mockReturnValue({
            approveV2LP: mockApproveV2LP,
            migrate: mockMigrate,
            checkPoolExists: vi.fn().mockResolvedValue(true),
            createPool: vi.fn(),
            isApproving: false,
            isMigrating: false,
            error: null
        });

        (useUserPositions as any).mockReturnValue({
            getPosition: mockGetPosition,
            loading: false
        });
    });

    it('displays loading state', () => {
        (useUserPositions as any).mockReturnValue({
            getPosition: mockGetPosition,
            loading: true // Loading
        });

        render(<V3Migration v2PairAddress={pairAddress} token0={token0} token1={token1} />);
        expect(screen.getByText('Loading V2 Position...')).toBeDefined();
    });

    it('displays no position state', () => {
        mockGetPosition.mockReturnValue(null); // No position

        render(<V3Migration v2PairAddress={pairAddress} token0={token0} token1={token1} />);
        expect(screen.getByText('No liquidity found in this V2 pool.')).toBeDefined();
    });

    it('displays position details and controls', () => {
        mockGetPosition.mockReturnValue({
            hasPosition: true,
            lpTokenBalance: '100.0',
            lpTokenBalanceRaw: 100000000000000000000n,
            token0Amount: '50.0',
            token1Amount: '50.0'
        });

        render(<V3Migration v2PairAddress={pairAddress} token0={token0} token1={token1} />);

        expect(screen.getByText('V2 Balance:')).toBeDefined();
        expect(screen.getByText('100.0 LP')).toBeDefined();
        expect(screen.getByText('Approve V2 LP')).toBeDefined();
        expect(screen.getByText('Migrate to V3')).toBeDefined();
    });

    it('handles approval flow', async () => {
        mockGetPosition.mockReturnValue({
            hasPosition: true,
            lpTokenBalance: '100.0',
            lpTokenBalanceRaw: 100000000000000000000n,
            token0Amount: '50.0',
            token1Amount: '50.0'
        });

        mockApproveV2LP.mockResolvedValue('0xApproveTx');

        render(<V3Migration v2PairAddress={pairAddress} token0={token0} token1={token1} />);

        const approveButton = screen.getByText('Approve V2 LP');
        fireEvent.click(approveButton);

        await waitFor(() => {
            expect(mockApproveV2LP).toHaveBeenCalledWith(pairAddress, '100000000000000000000');
        });
    });

    it('handles migration flow', async () => {
        mockGetPosition.mockReturnValue({
            hasPosition: true,
            lpTokenBalance: '100.0',
            lpTokenBalanceRaw: 100000000000000000000n,
            token0Amount: '50.0',
            token1Amount: '50.0'
        });

        // Simulate approval done state
        // In a real test we'd click approve then migrate, but state is internal.
        // We can test that migrate is disabled initially?
        // Actually, the button is disabled based on `approvalDone` which is local state set after approve.

        mockApproveV2LP.mockResolvedValue('already-approved');

        render(<V3Migration v2PairAddress={pairAddress} token0={token0} token1={token1} />);

        // Click approve first to set state
        const approveButton = screen.getByText('Approve V2 LP');
        fireEvent.click(approveButton);

        await waitFor(() => {
            expect(screen.getByText('Approved')).toBeDefined();
        });

        // Now click migrate
        const migrateButton = screen.getByText('Migrate to V3');
        expect((migrateButton as HTMLButtonElement).disabled).toBe(false);

        fireEvent.click(migrateButton);

        await waitFor(() => {
            expect(mockMigrate).toHaveBeenCalledWith(
                pairAddress,
                '100000000000000000000',
                100, // Default percentage
                -887220, // Default ticks
                887220,
                '0',
                '0',
                20
            );
        });
    });
});
