import { useState, useCallback } from 'react';
import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { V3MigrateParams } from '@/services/dex/IV3DexService';
import { Token } from '@/config/dex/types';
import { poolLogger } from '@/lib/logger';
import { getContract, encodeFunctionData, maxUint256 } from 'viem';
import { PAIR_ABI } from '@/config/abis';

export interface UseV3MigrationParams {
    token0: Token;
    token1: Token;
    fee: number;
}

export const useV3Migration = ({
    token0,
    token1,
    fee
}: UseV3MigrationParams) => {
    const [isApproving, setIsApproving] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { address, chainId } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();

    const approveV2LP = useCallback(async (pairAddress: string, amount: string) => {
        setIsApproving(true);
        setError(null);
        try {
            if (!address || !walletClient || !publicClient || !chainId) {
                throw new Error('Wallet not connected');
            }

            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) throw new Error('V3 not available on this chain');
            const migratorAddress = v3Service.getMigratorAddress();

            const pairContract = getContract({
                address: pairAddress as `0x${string}`,
                abi: PAIR_ABI,
                client: publicClient
            });

            // Check allowance first
            const allowance = await pairContract.read.allowance([address, migratorAddress]);

            if (allowance as bigint >= BigInt(amount)) {
                return 'already-approved';
            }

            const { request } = await publicClient.simulateContract({
                address: pairAddress as `0x${string}`,
                abi: PAIR_ABI,
                functionName: 'approve',
                args: [migratorAddress, maxUint256], // Approve max for convenience
                account: address
            });

            const txHash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash: txHash });
            return txHash;

        } catch (err: any) {
            console.error('Approve Error:', err);
            setError(err instanceof Error ? err.message : 'Approval failed');
            return null;
        } finally {
            setIsApproving(false);
        }
    }, [address, chainId, publicClient, walletClient]);

    const migrate = useCallback(async (
        pairAddress: string,
        liquidityToMigrate: string,
        percentageToMigrate: number,
        tickLower: number,
        tickUpper: number,
        amount0Min: string,
        amount1Min: string,
        deadlineMinutes: number = 20
    ) => {
        setIsMigrating(true);
        setError(null);

        try {
            if (!address || !walletClient || !publicClient || !chainId) {
                throw new Error('Wallet not connected');
            }

            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) throw new Error('V3 not available on this chain');

            // Construct params
            const params: V3MigrateParams = {
                pair: pairAddress,
                liquidityToMigrate,
                percentageToMigrate,
                token0,
                token1,
                fee,
                tickLower,
                tickUpper,
                amount0Min,
                amount1Min,
                recipient: address,
                deadline: Math.floor(Date.now() / 1000) + (deadlineMinutes * 60),
                refundAsETH: false // Default to false for now, can expose if needed
            };

            const txHash = await v3Service.migrateLiquidity(params, publicClient, walletClient);
            return txHash;

        } catch (err: any) {
            console.error('Migration Error:', err);
            setError(err instanceof Error ? err.message : 'Migration failed');
            return null;
        } finally {
            setIsMigrating(false);
        }
    }, [address, chainId, publicClient, walletClient, token0, token1, fee]);

    const checkPoolExists = useCallback(async () => {
        if (!publicClient || !chainId) return false;
        try {
            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) return false;
            const poolInfo = await v3Service.getV3PoolInfo(token0, token1, fee, publicClient);
            return !!poolInfo;
        } catch (err) {
            console.error('Error checking pool:', err);
            return false;
        }
    }, [token0, token1, fee, publicClient, chainId]);

    const createPool = useCallback(async (startPrice: string) => {
        setIsMigrating(true);
        setError(null);
        try {
            if (!address || !walletClient || !chainId) throw new Error('Wallet not connected');

            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) throw new Error('V3 not available on this chain');

            // Convert price to sqrtPriceX96 format required by V3 pool initialization
            const sqrtPriceX96 = v3Service.calculateSqrtPriceX96(startPrice, token0, token1);

            const txHash = await v3Service.createAndInitializePool(
                token0,
                token1,
                fee,
                sqrtPriceX96,
                walletClient
            );

            await publicClient?.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
            return txHash;

        } catch (err: any) {
            console.error('Pool Creation Error:', err);
            setError(err instanceof Error ? err.message : 'Pool creation failed');
            return null;
        } finally {
            setIsMigrating(false);
        }
    }, [token0, token1, fee, address, walletClient, chainId, publicClient]);

    return {
        approveV2LP,
        migrate,
        checkPoolExists,
        createPool,
        isApproving,
        isMigrating,
        error
    };
};
