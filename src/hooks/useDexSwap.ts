// Custom hook for DEX swap operations with proper client injection
// Handles both external wallets (MetaMask) and internal wallets

import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { encodeFunctionData, parseUnits, getContract, maxUint256 } from 'viem';
import { Token, QuoteResult, SwapParams } from '@/config/dex/types';
import { DexService } from '@/services/dex/DexService';
import { ERC20_ABI } from '@/config/abis';
import { useState, useCallback } from 'react';
import { swapLogger } from '@/lib/logger';
import { WKLC_ABI } from '@/config/abis';

// Helper to check if tokens are Native <-> Wrapped Native
const isWrapOperation = (tokenIn: Token, tokenOut: Token, wethAddress: string) => {
  const isNativeIn = tokenIn.isNative;
  const isWethIn = tokenIn.address.toLowerCase() === wethAddress.toLowerCase();
  const isNativeOut = tokenOut.isNative;
  const isWethOut = tokenOut.address.toLowerCase() === wethAddress.toLowerCase();

  return (isNativeIn && isWethOut) || (isWethIn && isNativeOut);
};

interface UseDexSwapReturn {
  getQuote: (tokenIn: Token, tokenOut: Token, amountIn: string) => Promise<QuoteResult>;
  executeSwap: (params: SwapParams) => Promise<string>;
  checkApproval: (token: Token, amount: string, spender: string) => Promise<boolean>;
  approveToken: (token: Token, spender: string, amount?: string) => Promise<string>;
  isInternalWallet: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useDexSwap(chainId: number): UseDexSwapReturn {
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const { connector } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if using internal wallet
  const isInternalWallet = connector?.id === 'kalyswap-internal';

  /**
   * Get a quote for swapping tokens
   */
  const getQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<QuoteResult> => {
    try {
      setError(null);

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const service = await DexService.getDexService(chainId);

      // Check for Wrap/Unwrap operation first
      const wethAddress = await service.getWethAddress();
      if (isWrapOperation(tokenIn, tokenOut, wethAddress)) {
        return {
          amountOut: amountIn, // 1:1 ratio
          priceImpact: 0,
          route: [tokenIn.address, tokenOut.address],
          fee: 0,
          gasEstimate: 50000n
        };
      }

      const quote = await service.getQuote(tokenIn, tokenOut, amountIn, publicClient);

      return quote;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to get quote';
      setError(errorMessage);
      throw err;
    }
  }, [chainId, publicClient]);

  /**
   * Execute a swap using internal wallet (via GraphQL backend)
   */
  const executeInternalWalletSwap = useCallback(async (params: SwapParams): Promise<string> => {
    try {
      // Import internal wallet utilities
      const { internalWalletUtils } = await import('@/connectors/internalWallet');
      const internalWalletState = internalWalletUtils.getState();

      if (!internalWalletState.activeWallet) {
        throw new Error('No internal wallet connected');
      }

      // Prompt for password
      const password = prompt('Enter your wallet password to sign this transaction:');
      if (!password) {
        throw new Error('Password required for transaction signing');
      }

      // Get service and router address
      const service = await DexService.getDexService(chainId);
      const routerAddress = service.getRouterAddress();

      // Get or calculate route
      let route = params.route;
      if (!route && publicClient) {
        route = await service.getSwapRoute(params.tokenIn, params.tokenOut, publicClient);
      }
      if (!route || route.length === 0) {
        throw new Error('No swap route available');
      }

      // Encode swap function call
      const { parseUnits } = await import('viem');
      const amountIn = parseUnits(params.amountIn, params.tokenIn.decimals);
      const amountOutMin = parseUnits(params.amountOutMin, params.tokenOut.decimals);
      const deadline = Math.floor(Date.now() / 1000) + (params.deadline * 60);

      let functionName: string;
      let args: any[];
      let value = '0';

      // Determine which router function to call based on token types
      if (params.tokenIn.isNative) {
        // Swapping native token (KLC/BNB/ETH) for tokens
        functionName = 'swapExactETHForTokens';
        args = [amountOutMin, route, params.to, BigInt(deadline)];
        value = amountIn.toString();
      } else if (params.tokenOut.isNative) {
        // Swapping tokens for native token
        functionName = 'swapExactTokensForETH';
        args = [amountIn, amountOutMin, route, params.to, BigInt(deadline)];
      } else {
        // Swapping tokens for tokens
        functionName = 'swapExactTokensForTokens';
        args = [amountIn, amountOutMin, route, params.to, BigInt(deadline)];
      }

      // Encode function data
      const data = encodeFunctionData({
        abi: service.getRouterABI(),
        functionName,
        args
      });

      // Call backend GraphQL mutation
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: `
            mutation SendContractTransaction($input: SendContractTransactionInput!) {
              sendContractTransaction(input: $input) {
                hash
              }
            }
          `,
          variables: {
            input: {
              walletId: internalWalletState.activeWallet.id,
              toAddress: routerAddress,
              value: value,
              data: data,
              password: password,
              chainId: chainId,
              gasLimit: '300000'
            }
          }
        })
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return result.data.sendContractTransaction.hash;
    } catch (err: any) {
      swapLogger.error('Internal wallet swap error:', err);
      throw err;
    }
  }, [chainId, publicClient]);

  /**
   * Check if token is approved for spending
   */
  const checkApproval = useCallback(async (
    token: Token,
    amount: string,
    spender: string
  ): Promise<boolean> => {
    try {
      if (!publicClient || !walletClient) {
        return false;
      }

      // Native tokens don't need approval
      if (token.isNative) {
        return true;
      }

      const account = walletClient.account;
      if (!account) {
        return false;
      }

      const tokenContract = getContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        client: publicClient,
      });

      const allowance = await tokenContract.read.allowance([
        account.address,
        spender as `0x${string}`
      ]) as bigint;

      const amountBigInt = parseUnits(amount, token.decimals);

      return allowance >= amountBigInt;
    } catch (err: any) {
      swapLogger.error('Check approval error:', err);
      return false;
    }
  }, [publicClient, walletClient]);

  /**
   * Approve token for spending
   */
  const approveToken = useCallback(async (
    token: Token,
    spender: string,
    amount?: string
  ): Promise<string> => {
    try {
      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      // Native tokens don't need approval
      if (token.isNative) {
        throw new Error('Native tokens do not require approval');
      }

      const tokenContract = getContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        client: walletClient,
      });

      // Use max uint256 for unlimited approval if no amount specified
      const approvalAmount = amount
        ? parseUnits(amount, token.decimals)
        : maxUint256;

      swapLogger.debug(`Approving ${token.symbol} for ${spender}...`);

      const txHash = await tokenContract.write.approve([
        spender as `0x${string}`,
        approvalAmount
      ]) as string;

      swapLogger.debug(`Approval transaction sent: ${txHash}`);

      // Wait for transaction confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        swapLogger.debug(`Approval confirmed: ${txHash}`);
      }

      return txHash;
    } catch (err: any) {
      swapLogger.error('Approve token error:', err);
      throw err;
    }
  }, [walletClient, publicClient]);

  /**
   * Execute a swap using external wallet (MetaMask, etc.)
   */
  const executeExternalWalletSwap = useCallback(async (params: SwapParams): Promise<string> => {
    try {
      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      const service = await DexService.getDexService(chainId);
      const routerAddress = service.getRouterAddress();

      // Check for Wrap/Unwrap
      const wethAddress = await service.getWethAddress();
      if (isWrapOperation(params.tokenIn, params.tokenOut, wethAddress)) {
        const isWrap = params.tokenIn.isNative;
        const amountWei = parseUnits(params.amountIn, params.tokenIn.decimals);

        if (isWrap) {
          // Deposit (Wrap)
          return await walletClient.writeContract({
            address: wethAddress as `0x${string}`,
            abi: WKLC_ABI,
            functionName: 'deposit',
            value: amountWei,
            gas: 100000n,
          });
        } else {
          // Withdraw (Unwrap)
          return await walletClient.writeContract({
            address: wethAddress as `0x${string}`,
            abi: WKLC_ABI,
            functionName: 'withdraw',
            args: [amountWei],
            gas: 100000n,
          });
        }
      }

      // Check and handle approval for non-native tokens
      if (!params.tokenIn.isNative) {
        const isApproved = await checkApproval(params.tokenIn, params.amountIn, routerAddress);

        if (!isApproved) {
          swapLogger.debug(`Token not approved. Requesting approval for ${params.tokenIn.symbol}...`);
          await approveToken(params.tokenIn, routerAddress);
          swapLogger.debug(`Approval successful for ${params.tokenIn.symbol}`);
        }
      }

      // Get or calculate route
      let route = params.route;
      if (!route && publicClient) {
        route = await service.getSwapRoute(params.tokenIn, params.tokenOut, publicClient);
      }

      // Add route to params
      const paramsWithRoute = { ...params, route };

      const txHash = await service.executeSwap(paramsWithRoute, walletClient);
      return txHash;
    } catch (err: any) {
      swapLogger.error('External wallet swap error:', err);
      throw err;
    }
  }, [chainId, walletClient, publicClient, checkApproval, approveToken]);

  /**
   * Execute a token swap (routes to internal or external wallet)
   */
  const executeSwap = useCallback(async (params: SwapParams): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);

      let txHash: string;

      if (isInternalWallet) {
        txHash = await executeInternalWalletSwap(params);
      } else {
        txHash = await executeExternalWalletSwap(params);
      }

      return txHash;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to execute swap';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInternalWallet, executeInternalWalletSwap, executeExternalWalletSwap]);

  return {
    getQuote,
    executeSwap,
    checkApproval,
    approveToken,
    isInternalWallet,
    isLoading,
    error
  };
}

