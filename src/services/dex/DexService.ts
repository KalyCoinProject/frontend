import { CHAIN_IDS } from '@/config/chains';
// Main DEX service that routes to the appropriate DEX implementation
// This is the entry point for all DEX operations

import { IDexService, DexError } from './IDexService';
import { Token, QuoteResult, SwapParams, PairInfo, AddLiquidityParams, RemoveLiquidityParams, LiquidityPosition, isSupportedDexChain } from '@/config/dex/types';
import { getDexConfig } from '@/config/dex';
import type { PublicClient, WalletClient } from 'viem';

// Lazy imports to avoid circular dependencies
let KalySwapService: any;
let PancakeSwapService: any;
let UniswapV2Service: any;

export class DexService {
  private static instances: Map<number, IDexService> = new Map();

  /**
   * Get the appropriate DEX service for a chain
   */
  static async getDexService(chainId: number): Promise<IDexService> {
    if (!isSupportedDexChain(chainId)) {
      throw new DexError(`Chain ${chainId} is not supported for DEX operations`, 'UNSUPPORTED_CHAIN', 'DexService');
    }

    // Return cached instance if available
    if (this.instances.has(chainId)) {
      return this.instances.get(chainId)!;
    }

    // Create new instance based on chain
    let service: IDexService;

    switch (chainId) {
      case CHAIN_IDS.KALYCHAIN: // KalyChain (V2 for Mainnet currently)
        if (!KalySwapService) {
          const { KalySwapService: Service } = await import('./KalySwapService');
          KalySwapService = Service;
        }
        service = new KalySwapService();
        break;

      case CHAIN_IDS.KALYCHAIN_TESTNET: // KalyChain Testnet (V3)
        // Use the V3 Service for Testnet as configured
        const { getKalySwapV3Service } = await import('./KalySwapV3Service');
        // Cast to any/IDexService as we verified compatibility for key methods
        service = getKalySwapV3Service(chainId) as unknown as IDexService;
        break;

      case 56: // BSC
        if (!PancakeSwapService) {
          const { PancakeSwapService: Service } = await import('./PancakeSwapService');
          PancakeSwapService = Service;
        }
        service = new PancakeSwapService();
        break;

      case 42161: // Arbitrum
        if (!UniswapV2Service) {
          const { UniswapV2Service: Service } = await import('./UniswapV2Service');
          UniswapV2Service = Service;
        }
        service = new UniswapV2Service();
        break;

      default:
        throw new DexError(`No DEX service available for chain ${chainId}`, 'NO_SERVICE', 'DexService');
    }

    // Cache the instance
    this.instances.set(chainId, service);
    return service;
  }

  /**
   * Get a quote for swapping tokens on a specific chain
   */
  static async getQuote(
    chainId: number,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    publicClient: PublicClient
  ): Promise<QuoteResult> {
    const service = await this.getDexService(chainId);
    return service.getQuote(tokenIn, tokenOut, amountIn, publicClient);
  }

  /**
   * Execute a token swap on a specific chain
   */
  static async executeSwap(chainId: number, params: SwapParams, walletClient: WalletClient): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.executeSwap(params, walletClient);
  }

  /**
   * Get pair address for two tokens on a specific chain
   */
  static async getPairAddress(chainId: number, tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<string | null> {
    const service = await this.getDexService(chainId);
    return service.getPairAddress(tokenA, tokenB, publicClient);
  }

  /**
   * Get pair information for two tokens on a specific chain
   */
  static async getPairInfo(chainId: number, tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<PairInfo | null> {
    const service = await this.getDexService(chainId);
    return service.getPairInfo(tokenA, tokenB, publicClient);
  }

  /**
   * Get supported tokens for a specific chain
   */
  static async getTokenList(chainId: number): Promise<Token[]> {
    const service = await this.getDexService(chainId);
    return service.getTokenList();
  }

  /**
   * Get DEX name for a specific chain
   */
  static async getDexName(chainId: number): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.getName();
  }

  /**
   * Check if a token is supported on a specific chain
   */
  static async isTokenSupported(chainId: number, tokenAddress: string): Promise<boolean> {
    const service = await this.getDexService(chainId);
    return service.isTokenSupported(tokenAddress);
  }

  /**
   * Get the best swap route for tokens on a specific chain
   */
  static async getSwapRoute(chainId: number, tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
    const service = await this.getDexService(chainId);
    return service.getSwapRoute(tokenIn, tokenOut, publicClient);
  }

  /**
   * Calculate price impact for a swap on a specific chain
   */
  static async calculatePriceImpact(
    chainId: number,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    publicClient: PublicClient
  ): Promise<number> {
    const service = await this.getDexService(chainId);
    return service.calculatePriceImpact(tokenIn, tokenOut, amountIn, publicClient);
  }

  /**
   * Check if two tokens can be swapped directly on a specific chain
   */
  static async canSwapDirectly(chainId: number, tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<boolean> {
    const service = await this.getDexService(chainId);
    return service.canSwapDirectly(tokenA, tokenB, publicClient);
  }

  /**
   * Get all supported chain IDs
   */
  static getSupportedChains(): number[] {
    return [CHAIN_IDS.KALYCHAIN, 56, 42161]; // KalyChain, BSC, Arbitrum
  }

  /**
   * Clear cached instances (useful for testing or when switching networks)
   */
  static clearCache(): void {
    this.instances.clear();
  }

  // ===============================
  // Liquidity Operations
  // ===============================

  /**
   * Add liquidity to a token pair on a specific chain
   */
  static async addLiquidity(
    chainId: number,
    params: AddLiquidityParams,
    publicClient: PublicClient,
    walletClient: WalletClient
  ): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.addLiquidity(params, publicClient, walletClient);
  }

  /**
   * Remove liquidity from a token pair on a specific chain
   */
  static async removeLiquidity(
    chainId: number,
    params: RemoveLiquidityParams,
    publicClient: PublicClient,
    walletClient: WalletClient
  ): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.removeLiquidity(params, publicClient, walletClient);
  }

  /**
   * Get user's liquidity positions on a specific chain
   */
  static async getUserLiquidityPositions(
    chainId: number,
    userAddress: string,
    publicClient: PublicClient
  ): Promise<LiquidityPosition[]> {
    const service = await this.getDexService(chainId);
    return service.getUserLiquidityPositions(userAddress, publicClient);
  }

  /**
   * Calculate optimal amounts for adding liquidity
   */
  static async calculateOptimalLiquidityAmounts(
    chainId: number,
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    publicClient: PublicClient
  ): Promise<{ amountB: string; isNewPair: boolean }> {
    const service = await this.getDexService(chainId);
    return service.calculateOptimalLiquidityAmounts(tokenA, tokenB, amountA, publicClient);
  }

  /**
   * Approve token for router spending on a specific chain
   */
  static async approveToken(
    chainId: number,
    token: Token,
    amount: string,
    walletClient: WalletClient
  ): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.approveToken(token, amount, walletClient);
  }

  /**
   * Check token approval status on a specific chain
   */
  static async checkApproval(
    chainId: number,
    token: Token,
    owner: string,
    amount: string,
    publicClient: PublicClient
  ): Promise<boolean> {
    const service = await this.getDexService(chainId);
    return service.checkApproval(token, owner, amount, publicClient);
  }

  /**
   * Get the router address for a specific chain
   */
  static async getRouterAddress(chainId: number): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.getRouterAddress();
  }

  /**
   * Get the factory address for a specific chain
   */
  static async getFactoryAddress(chainId: number): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.getFactoryAddress();
  }

  /**
   * Get the wrapped native token address for a specific chain
   */
  static async getWethAddress(chainId: number): Promise<string> {
    const service = await this.getDexService(chainId);
    return service.getWethAddress();
  }
}

// Export for convenience
export default DexService;
