/**
 * KalySwapV3Service - KalyChain-specific V3 DEX implementation
 * Extends BaseV3Service with KalyChain-specific configurations
 */

import { CHAIN_IDS } from '@/config/chains';
import { BaseV3Service } from './BaseV3Service';
import { SwapFailedError } from './IDexService';
import { V3MigrateParams } from './IV3DexService';
import { KALYSWAP_V3_TESTNET_CONFIG, getV3Config } from '@/config/dex/v3-config';
import { Token, SwapParams } from '@/config/dex/types';
import { V3_FEE_TIERS, V3_DEFAULT_FEE_TIER } from '@/config/dex/v3-constants';
import type { PublicClient, WalletClient } from 'viem';
import { parseUnits, formatUnits, encodeFunctionData, createPublicClient, http } from 'viem';
import { getRpcUrl, kalychain, kalychainTestnet } from '@/config/chains';
import { dexLogger as logger } from '@/lib/logger';

/**
 * KalySwap V3 Service for KalyChain
 */
export class KalySwapV3Service extends BaseV3Service {
    private chainId: number;

    constructor(chainId: number = CHAIN_IDS.KALYCHAIN_TESTNET) {
        const config = getV3Config(chainId);
        super(config);
        this.chainId = chainId;
    }

    getName(): string {
        return 'KalySwap V3';
    }

    getChainId(): number {
        return this.chainId;
    }

    /**
     * Execute a swap using the V2-compatible interface
     * This is called by DexService.executeSwap
     * Tries direct single-hop swaps first, then falls back to multi-hop routing.
     */
    async executeSwap(params: SwapParams, walletClient: WalletClient): Promise<string> {
        try {
            logger.debug('KalySwap V3: Executing swap', {
                tokenIn: params.tokenIn.symbol,
                tokenOut: params.tokenOut.symbol,
                amountIn: params.amountIn,
                slippage: params.slippageTolerance,
            });

            // Create a robust public client for reading state
            const rpcUrl = getRpcUrl(this.chainId);
            const chain = this.chainId === CHAIN_IDS.KALYCHAIN_TESTNET ? kalychainTestnet : kalychain;

            const publicClient = createPublicClient({
                chain,
                transport: http(rpcUrl)
            });

            // Use findBestRoute to find the optimal path (direct or multi-hop)
            const bestRoute = await this.findBestRoute(
                params.tokenIn,
                params.tokenOut,
                params.amountIn,
                publicClient
            );

            if (!bestRoute) {
                throw new Error('No V3 route found for this token pair (tried direct and multi-hop)');
            }

            const { route, quote } = bestRoute;
            const amountOutMinimum = this.getAmountOutMin(quote.amountOut, params.slippageTolerance);

            // Single-hop: use exactInputSingle (existing path)
            if (route.tokenPath.length === 2) {
                logger.debug('KalySwap V3: Using direct single-hop swap', {
                    fee: route.fees[0],
                    expectedOut: quote.amountOut,
                });

                return await this.executeV3Swap(
                    {
                        tokenIn: params.tokenIn,
                        tokenOut: params.tokenOut,
                        fee: route.fees[0],
                        recipient: params.to,
                        amountIn: params.amountIn,
                        amountOutMinimum,
                        deadline: params.deadline,
                    },
                    publicClient,
                    walletClient
                );
            }

            // Multi-hop: use exactInput with encoded path
            logger.debug('KalySwap V3: Using multi-hop swap', {
                path: route.tokenPath,
                fees: route.fees,
                expectedOut: quote.amountOut,
            });

            return await this.executeV3MultiHopSwap(
                {
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    route,
                    recipient: params.to,
                    amountIn: params.amountIn,
                    amountOutMinimum,
                    deadline: params.deadline,
                },
                publicClient,
                walletClient
            );
        } catch (error) {
            logger.error('KalySwap V3: Swap failed', error);
            throw new SwapFailedError(
                this.getName(),
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Get the native token wrapping address (wKLC)
     */
    getWrappedNativeToken(): Token {
        return {
            chainId: this.chainId,
            symbol: 'wKLC',
            name: 'Wrapped KLC',
            address: this.getWethAddress(),
            decimals: 18,
            logoURI: 'https://raw.githubusercontent.com/kalycoinproject/sdk/main/src/images/chains/kaly.png',
            isNative: false,
        };
    }

    /**
     * Get the native token (KLC)
     */
    getNativeToken(): Token {
        return {
            chainId: this.chainId,
            symbol: 'KLC',
            name: 'KalyCoin',
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            logoURI: 'https://raw.githubusercontent.com/kalycoinproject/sdk/main/src/images/chains/kaly.png',
            isNative: true,
        };
    }

    /**
     * Check if a swap involves the native token
     */
    isNativeSwap(tokenIn: Token, tokenOut: Token): { isNativeIn: boolean; isNativeOut: boolean } {
        return {
            isNativeIn: tokenIn.isNative === true,
            isNativeOut: tokenOut.isNative === true,
        };
    }

    /**
     * Get the optimal fee tier for a token pair
     * Returns the fee tier with highest liquidity
     */
    async getOptimalFeeTier(
        tokenA: Token,
        tokenB: Token,
        publicClient: PublicClient
    ): Promise<number> {
        let bestFeeTier: number = V3_DEFAULT_FEE_TIER;
        let highestLiquidity = 0n;

        for (const fee of Object.values(V3_FEE_TIERS)) {
            const poolInfo = await this.getV3PoolInfo(tokenA, tokenB, fee, publicClient);
            if (poolInfo && poolInfo.liquidity > highestLiquidity) {
                highestLiquidity = poolInfo.liquidity;
                bestFeeTier = fee;
            }
        }

        return bestFeeTier;
    }

    /**
     * Helper: Get price from pool for a token pair
     */
    async getTokenPrice(
        tokenIn: Token,
        tokenOut: Token,
        publicClient: PublicClient
    ): Promise<string> {
        const poolInfo = await this.getV3PoolInfo(tokenIn, tokenOut, V3_DEFAULT_FEE_TIER, publicClient);
        if (!poolInfo) {
            return '0';
        }

        // Determine which price to return based on token order
        if (tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase()) {
            return poolInfo.token1Price; // tokenIn is token0, so price is token1 per token0
        } else {
            return poolInfo.token0Price; // tokenIn is token1, so price is token0 per token1
        }
    }

    /**
     * Create pool and initialize with starting price (if pool doesn't exist)
     * Note: This requires special permissions or is only for first-time setup
     */
    async createAndInitializePool(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        sqrtPriceX96: bigint,
        walletClient: WalletClient
    ): Promise<string> {
        const positionManagerAddress = this.getPositionManagerAddress();

        // Sort tokens
        const [token0, token1] = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
            ? [tokenA, tokenB]
            : [tokenB, tokenA];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const txHash = await walletClient.writeContract({
            address: positionManagerAddress as `0x${string}`,
            abi: this.config.positionManagerABI,
            functionName: 'createAndInitializePoolIfNecessary',
            args: [
                token0.address as `0x${string}`,
                token1.address as `0x${string}`,
                fee,
                sqrtPriceX96,
            ],
            gas: 6000000n, // UPDATED: Explicit high gas limit for heavy deployment
        } as any);

        return txHash;
    }

    /**
     * Migrate V2 liquidity to V3
     */
    async migrateLiquidity(
        params: V3MigrateParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        const migratorAddress = this.config.migrator;
        if (!migratorAddress) throw new Error('V3 Migrator address not configured');

        // Note: tokens in params are already sorted by caller if needed, 
        // but verify token0/token1 match parameter structure requirements
        // Migration params typically expect token0 < token1

        const migrateParams = {
            pair: params.pair as `0x${string}`,
            liquidityToMigrate: BigInt(params.liquidityToMigrate),
            percentageToMigrate: params.percentageToMigrate,
            token0: params.token0.address as `0x${string}`,
            token1: params.token1.address as `0x${string}`,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            amount0Min: BigInt(params.amount0Min),
            amount1Min: BigInt(params.amount1Min),
            recipient: params.recipient as `0x${string}`,
            deadline: BigInt(params.deadline),
            refundAsETH: params.refundAsETH
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const { request } = await publicClient.simulateContract({
            address: migratorAddress as `0x${string}`,
            abi: this.config.migratorABI,
            functionName: 'migrate',
            args: [migrateParams],
            account: walletClient.account
        } as any);

        const txHash = await walletClient.writeContract(request as any);
        return txHash;
    }
}

// Export singleton factory
// Export singleton factory with caching by chainId
const v3ServiceInstances: Map<number, KalySwapV3Service> = new Map();

export function getKalySwapV3Service(chainId: number = CHAIN_IDS.KALYCHAIN_TESTNET): KalySwapV3Service {
    if (!v3ServiceInstances.has(chainId)) {
        v3ServiceInstances.set(chainId, new KalySwapV3Service(chainId));
    }
    return v3ServiceInstances.get(chainId)!;
}
