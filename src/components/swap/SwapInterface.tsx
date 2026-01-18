'use client';

import { CHAIN_IDS } from '@/config/chains';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUpDown, Settings, Info, Wallet, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react';
import TokenSelectorModal from './TokenSelectorModal';
import SwapConfirmationModal from './SwapConfirmationModal';
import ErrorDisplay from './ErrorDisplay';
import { useSwapErrorHandler } from '@/hooks/useSwapErrorHandler';
import { SwapErrorType } from '@/utils/swapErrors';
import { useSwapTransactions } from '@/hooks/useSwapTransactions';
import { internalWalletUtils } from '@/connectors/internalWallet';
import { useTokenLists } from '@/hooks/useTokenLists';

// Wagmi imports for contract interaction
import { useAccount, usePublicClient, useWalletClient, useConfig, useConnectorClient } from 'wagmi';
import { parseEther, formatEther, getContract, parseUnits, formatUnits, encodeFunctionData } from 'viem';

// Contract configuration imports
import { getContractAddress, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { ROUTER_ABI, ERC20_ABI, WKLC_ABI } from '@/config/abis';

// DEX Service for quotes and swaps
import { DexService } from '@/services/dex';

// Custom hooks
import { useTokenBalances } from '@/hooks/useTokenBalance';

// Price impact utilities
import { calculatePriceImpact, formatPriceImpact, getPriceImpactColor } from '@/utils/priceImpact';

// Token type from centralized types
import { Token } from '@/config/dex/types';
import { swapLogger as logger } from '@/lib/logger';

// Props interface for SwapInterface
interface SwapInterfaceProps {
  fromToken?: Token | null;
  toToken?: Token | null;
  onTokenChange?: (fromToken: Token | null, toToken: Token | null) => void;
}

// Helper functions for wrap/unwrap detection
const isWrapOperation = (fromToken: Token | null, toToken: Token | null): boolean => {
  if (!fromToken || !toToken) return false;

  // Check if wrapping KLC to WKLC
  // Use case-insensitive symbol check and also verify WKLC address
  const WKLC_ADDRESS = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
  const isToWKLC = toToken.symbol.toUpperCase() === 'WKLC' ||
                   toToken.address.toLowerCase() === WKLC_ADDRESS.toLowerCase();

  return (fromToken.isNative === true) && isToWKLC;
};

const isUnwrapOperation = (fromToken: Token | null, toToken: Token | null): boolean => {
  if (!fromToken || !toToken) return false;

  // Check if unwrapping WKLC to KLC
  // Use case-insensitive symbol check and also verify WKLC address
  const WKLC_ADDRESS = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
  const isFromWKLC = fromToken.symbol.toUpperCase() === 'WKLC' ||
                     fromToken.address.toLowerCase() === WKLC_ADDRESS.toLowerCase();

  return isFromWKLC && (toToken.isNative === true);
};

const isWrapOrUnwrapOperation = (fromToken: Token | null, toToken: Token | null): boolean => {
  return isWrapOperation(fromToken, toToken) || isUnwrapOperation(fromToken, toToken);
};

// Swap state interface
interface SwapState {
  fromToken: Token | null;
  toToken: Token | null;
  fromAmount: string;
  toAmount: string;
  slippage: string;
  deadline: string;
}

export default function SwapInterface({ fromToken: propFromToken, toToken: propToToken, onTokenChange }: SwapInterfaceProps = {}) {
  // Wagmi hooks for wallet interaction
  const { address, isConnected, connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Get dynamic token list
  const { tokens: availableTokens } = useTokenLists({ chainId: DEFAULT_CHAIN_ID });

  // Token balances
  const { balances, getFormattedBalance, isLoading: balancesLoading, refreshBalances } = useTokenBalances(availableTokens);

  // Create wrapper function to convert address to symbol for TokenSelectorModal
  const getFormattedBalanceByAddress = (tokenAddress: string): string => {
    const token = availableTokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
    return token ? getFormattedBalance(token.symbol) : '0';
  };

  // Get default tokens from the available tokens list
  const defaultFromToken = availableTokens.find(t => t.isNative || t.symbol === 'KLC') || availableTokens[0] || null;
  const defaultToToken = availableTokens.find(t => t.symbol === 'USDT') || availableTokens[1] || null;

  // Component state - use props if provided, otherwise use defaults
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: propFromToken || defaultFromToken,
    toToken: propToToken || defaultToToken,
    fromAmount: '',
    toAmount: '',
    slippage: '0.5',
    deadline: '20'
  });

  // Update internal state when props change
  useEffect(() => {
    if (propFromToken !== undefined || propToToken !== undefined) {
      setSwapState(prev => ({
        ...prev,
        fromToken: propFromToken !== undefined ? propFromToken : prev.fromToken,
        toToken: propToToken !== undefined ? propToToken : prev.toToken,
      }));
    }
  }, [propFromToken, propToToken]);



  const [isSwapping, setIsSwapping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'swapping' | 'complete'>('idle');

  // Check if user is using internal wallet and if it's on the correct chain
  const isUsingInternalWallet = () => connector?.id === 'kalyswap-internal';
  const internalWalletState = isUsingInternalWallet() ? internalWalletUtils.getState() : null;
  const isWrongChain = isUsingInternalWallet() && internalWalletState?.activeWallet?.chainId !== CHAIN_IDS.KALYCHAIN;
  const [currentTransactionHash, setCurrentTransactionHash] = useState<string | null>(null);

  // Enhanced error handling
  const {
    error,
    isRetrying,
    hasError,
    handleError,
    handleValidationError,
    clearError,
    reset,
    retry,
    validateSwap,
    executeWithErrorHandling,
    setRetryOperation
  } = useSwapErrorHandler({
    maxRetries: 3,
    onRetrySuccess: () => {
      logger.debug('✅ Retry successful');
    },
    onRetryFailed: (error) => {
      logger.error('❌ Retry failed after max attempts:', error);
    }
  });

  // Transaction tracking
  const {
    addTransaction,
    updateTransactionStatus
  } = useSwapTransactions({
    userAddress: address,
    autoRefresh: true
  });

  // Get wallet ID for transaction tracking
  const getWalletId = () => {
    // Check if using internal wallet
    const internalWalletState = internalWalletUtils.getState();
    if (internalWalletState.isConnected && internalWalletState.activeWallet) {
      return internalWalletState.activeWallet.id;
    }

    // For external wallets, use a default ID or create one based on address
    return `external-${address?.slice(0, 10)}` || 'external-default';
  };



  // Helper function to prompt for password (similar to dashboard)
  const promptForPassword = (): Promise<string | null> => {
    return new Promise((resolve) => {
      // Create password prompt modal
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
          <p class="text-sm text-gray-600 mb-4">Enter your internal wallet password to authorize this transaction.</p>
          <input
            type="password"
            placeholder="Enter your wallet password"
            class="w-full p-3 border rounded-lg mb-4 password-input"
            autofocus
          />
          <div class="flex gap-2">
            <button class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg confirm-btn">Confirm</button>
            <button class="flex-1 px-4 py-2 bg-gray-200 rounded-lg cancel-btn">Cancel</button>
          </div>
        </div>
      `;

      const passwordInput = modal.querySelector('.password-input') as HTMLInputElement;
      const confirmBtn = modal.querySelector('.confirm-btn') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.cancel-btn') as HTMLButtonElement;

      const handleConfirm = () => {
        const password = passwordInput.value;
        document.body.removeChild(modal);
        resolve(password || null);
      };

      const handleCancel = () => {
        document.body.removeChild(modal);
        resolve(null);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleConfirm();
      });

      document.body.appendChild(modal);
    });
  };

  // Helper function to execute contract calls with proper internal wallet handling
  const executeContractCall = async (contractAddress: string, functionName: string, args: any[], value?: bigint, abi = ROUTER_ABI) => {
    if (isUsingInternalWallet()) {
      // For internal wallets, use direct GraphQL call like dashboard
      const internalWalletState = internalWalletUtils.getState();
      if (!internalWalletState.activeWallet) {
        throw new Error('No internal wallet connected');
      }

      // Ensure we're using a KalyChain wallet for swaps
      if (internalWalletState.activeWallet.chainId !== CHAIN_IDS.KALYCHAIN) {
        throw new Error('Swaps are only available on KalyChain. Please switch to a KalyChain wallet.');
      }

      // Get password from user
      const password = await promptForPassword();
      if (!password) {
        throw new Error('Password required for transaction signing');
      }

      // Encode the function data
      const data = encodeFunctionData({
        abi,
        functionName,
        args
      });

      logger.debug('🔐 Sending contract transaction via GraphQL:', {
        to: contractAddress,
        data: data.slice(0, 10) + '...',
        value: value?.toString() || '0',
      });

      // Get auth token
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Call backend directly like dashboard does
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation SendContractTransaction($input: SendContractTransactionInput!) {
              sendContractTransaction(input: $input) {
                id
                hash
                status
              }
            }
          `,
          variables: {
            input: {
              walletId: internalWalletState.activeWallet.id,
              toAddress: contractAddress,
              value: value?.toString() || '0',
              data: data,
              password: password,
              chainId: CHAIN_IDS.KALYCHAIN, // Force KalyChain for swaps
              gasLimit: '300000'
            }
          }
        }),
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return result.data.sendContractTransaction.hash as `0x${string}`;
    } else {
      // For external wallets, use the standard writeContract method
      if (!walletClient) throw new Error('Wallet client not available');

      return await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi,
        functionName,
        args,
        value,
        gas: BigInt(300000),
      });
    }
  };
  const [priceImpact, setPriceImpact] = useState<string | null>(null);

  // Token selector modal state
  const [showFromTokenModal, setShowFromTokenModal] = useState(false);
  const [showToTokenModal, setShowToTokenModal] = useState(false);

  // Swap confirmation modal state
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState<string>('');
  const [priceImpactResult, setPriceImpactResult] = useState<{
    priceImpact: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    warning: string | null;
  }>({ priceImpact: '0', severity: 'low', warning: null });

  // Get quote using DexService
  const getQuote = async (inputAmount: string, fromToken: Token, toToken: Token) => {
    if (!publicClient || !inputAmount || !fromToken || !toToken) return null;

    try {
      // Check if this is a wrap or unwrap operation
      if (isWrapOrUnwrapOperation(fromToken, toToken)) {
        // For wrap/unwrap operations, return 1:1 ratio
        logger.debug('🔄 Wrap/Unwrap operation detected - returning 1:1 ratio');
        return inputAmount;
      }

      logger.debug('🔍 Getting quote via DexService', {
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        inputAmount,
        chainId: DEFAULT_CHAIN_ID
      });

      // Use DexService for quote - it handles routing internally
      const quoteResult = await DexService.getQuote(
        DEFAULT_CHAIN_ID,
        fromToken,
        toToken,
        inputAmount,
        publicClient
      );

      logger.debug('✅ Quote received from DexService', {
        amountOut: quoteResult.amountOut,
        priceImpact: quoteResult.priceImpact,
        route: quoteResult.route,
        price: `${parseFloat(quoteResult.amountOut) / parseFloat(inputAmount)} ${toToken.symbol} per ${fromToken.symbol}`
      });

      return quoteResult.amountOut;
    } catch (error) {
      logger.error('❌ Error getting quote from DexService:', error);
      return null;
    }
  };

  // Handle amount input change with quote fetching
  const handleFromAmountChange = async (value: string) => {
    setSwapState(prev => ({ ...prev, fromAmount: value }));

    if (value && !isNaN(parseFloat(value)) && swapState.fromToken && swapState.toToken) {
      try {
        // Clear any quote-related errors when getting new quotes
        if (hasError && error?.type === SwapErrorType.INSUFFICIENT_LIQUIDITY) {
          clearError();
        }

        const quote = await getQuote(value, swapState.fromToken, swapState.toToken);
        if (quote) {
          setSwapState(prev => ({ ...prev, toAmount: quote }));
        } else {
          setSwapState(prev => ({ ...prev, toAmount: '' }));
        }
      } catch (err) {
        logger.error('Error fetching quote:', err);
        setSwapState(prev => ({ ...prev, toAmount: '' }));
        // Only show error for quote fetching if it's a significant error
        // Minor quote errors shouldn't interrupt the user experience
      }
    } else {
      setSwapState(prev => ({ ...prev, toAmount: '' }));
    }
  };

  // Handle token swap in the interface
  const handleSwapTokens = () => {
    setSwapState(prev => {
      const newState = {
        ...prev,
        fromToken: prev.toToken,
        toToken: prev.fromToken,
        fromAmount: prev.toAmount,
        toAmount: prev.fromAmount
      };

      // Notify parent component of token change
      if (onTokenChange) {
        onTokenChange(newState.fromToken, newState.toToken);
      }

      return newState;
    });
  };

  // Enhanced price impact calculation using actual pool reserves
  const calculateEnhancedPriceImpact = async (inputAmount: string, fromToken: Token, toToken: Token) => {
    if (!publicClient || !inputAmount || !fromToken || !toToken) {
      return { priceImpact: '0', severity: 'low' as const, warning: null };
    }

    // Skip price impact calculation for wrap/unwrap operations
    if (isWrapOrUnwrapOperation(fromToken, toToken)) {
      return { priceImpact: '0', severity: 'low' as const, warning: null };
    }

    try {
      return await calculatePriceImpact(publicClient, inputAmount, fromToken, toToken);
    } catch (error) {
      logger.error('Error calculating enhanced price impact:', error);
      return { priceImpact: '0', severity: 'low' as const, warning: 'Error calculating price impact' };
    }
  };

  // Estimate gas cost for the transaction
  const estimateGasCost = async () => {
    if (!publicClient) return '0.001';

    try {
      // Get current gas price
      const gasPrice = await publicClient.getGasPrice();
      // Estimate gas units (typical swap uses ~150k-300k gas)
      const estimatedGasUnits = BigInt(250000);
      const totalGasCost = gasPrice * estimatedGasUnits;

      // Convert to KLC (18 decimals)
      const gasCostInKLC = formatUnits(totalGasCost, 18);
      return parseFloat(gasCostInKLC).toFixed(4);
    } catch (error) {
      logger.error('Error estimating gas:', error);
      return '0.001';
    }
  };

  // Handle swap button click - show confirmation modal
  const handleSwapClick = async () => {
    // Clear any previous errors
    clearError();

    // Validate swap parameters
    const validationError = validateSwap({
      isConnected,
      fromToken: swapState.fromToken,
      toToken: swapState.toToken,
      fromAmount: swapState.fromAmount,
      balance: swapState.fromToken ? getFormattedBalance(swapState.fromToken.symbol) : undefined
    });

    if (validationError) {
      return; // Validation error is already handled by the hook
    }

    try {
      // Calculate enhanced price impact and estimate gas
      const priceImpactData = await calculateEnhancedPriceImpact(swapState.fromAmount, swapState.fromToken!, swapState.toToken!);
      const gasEstimate = await estimateGasCost();

      setPriceImpactResult(priceImpactData);
      setEstimatedGas(gasEstimate);
      setShowConfirmationModal(true);
    } catch (err) {
      logger.error('Error preparing swap confirmation:', err);
      handleError(err);
    }
  };



  // Execute the actual swap
  const executeSwap = async () => {
    // Validate again before execution
    const validationError = validateSwap({
      isConnected,
      fromToken: swapState.fromToken,
      toToken: swapState.toToken,
      fromAmount: swapState.fromAmount,
      balance: swapState.fromToken ? getFormattedBalance(swapState.fromToken.symbol) : undefined
    });

    if (validationError) {
      return;
    }

    if (!walletClient || !publicClient) {
      handleValidationError(SwapErrorType.WALLET_NOT_CONNECTED);
      return;
    }

    // Set up retry operation for error handling
    const swapOperation = async () => {
      setIsSwapping(true);
      clearError();
      setCurrentStep('approving');
      // Close confirmation modal when starting execution
      setShowConfirmationModal(false);

      // Ensure tokens are not null (should be validated before this point)
      if (!swapState.fromToken || !swapState.toToken) {
        throw new Error('Tokens not selected');
      }

      const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);
      const amountIn = parseUnits(swapState.fromAmount, swapState.fromToken.decimals);
      const amountOutMin = parseUnits(swapState.toAmount, swapState.toToken.decimals);

      // Calculate slippage
      const slippageMultiplier = (100 - parseFloat(swapState.slippage)) / 100;
      const amountOutMinWithSlippage = BigInt(Math.floor(Number(amountOutMin) * slippageMultiplier));

      // Calculate deadline (current time + minutes)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + (parseInt(swapState.deadline) * 60));

      // Get swap route using DexService (handles routing automatically)
      logger.debug('🔍 Getting swap route from DexService...');
      const path = await DexService.getSwapRoute(
        DEFAULT_CHAIN_ID,
        swapState.fromToken,
        swapState.toToken,
        publicClient
      );

      if (path.length === 0) {
        throw new Error('No valid swap route found');
      }

      logger.debug('✅ Swap route determined:', path);

      // Check if this is a wrap or unwrap operation
      const isWrap = isWrapOperation(swapState.fromToken, swapState.toToken);
      const isUnwrap = isUnwrapOperation(swapState.fromToken, swapState.toToken);

      // Declare swapHash at function scope
      let swapHash: `0x${string}`;

      if (isWrap || isUnwrap) {
        logger.debug(`🔄 Executing ${isWrap ? 'wrap' : 'unwrap'} operation:`, {
          fromToken: swapState.fromToken.symbol,
          toToken: swapState.toToken.symbol,
          amount: swapState.fromAmount,
          operation: isWrap ? 'KLC → wKLC' : 'wKLC → KLC'
        });

        // Skip approval step for wrap/unwrap operations
        setCurrentStep('swapping');

        const wklcAddress = getContractAddress('WKLC', DEFAULT_CHAIN_ID);

        if (isWrap) {
          // KLC → wKLC: Call deposit() with KLC value
          logger.debug('🔄 Wrapping KLC to wKLC...');
          swapHash = await executeContractCall(
            wklcAddress,
            'deposit',
            [],
            amountIn,
            WKLC_ABI
          );
        } else {
          // wKLC → KLC: First approve, then call withdraw()
          logger.debug('📝 Approving wKLC for unwrap...');

          let approveHash: `0x${string}`;
          if (isUsingInternalWallet()) {
            approveHash = await executeContractCall(
              wklcAddress,
              'approve',
              [wklcAddress, amountIn],
              BigInt(0),
              WKLC_ABI
            );
          } else {
            const wklcContract = getContract({
              address: wklcAddress as `0x${string}`,
              abi: WKLC_ABI,
              client: walletClient,
            });
            approveHash = await wklcContract.write.approve([wklcAddress, amountIn]);
          }

          logger.debug(`📝 wKLC approval hash: ${approveHash}`);
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          logger.debug('✅ wKLC approved for unwrap');

          // Now unwrap wKLC → KLC
          logger.debug('🔄 Unwrapping wKLC to KLC...');
          swapHash = await executeContractCall(
            wklcAddress,
            'withdraw',
            [amountIn],
            BigInt(0),
            WKLC_ABI
          );
        }
      } else {
        // Regular DEX swap logic
        logger.debug('🚀 Executing swap:', {
          fromToken: swapState.fromToken.symbol,
          toToken: swapState.toToken.symbol,
          amountIn: swapState.fromAmount,
          amountOutMin: swapState.toAmount,
          path,
          deadline: swapState.deadline + ' minutes'
        });

        // Step 1: Approve token if not native
        if (swapState.fromToken.isNative !== true) {
          logger.debug('📝 Approving token...');

          let approveHash: `0x${string}`;

          if (isUsingInternalWallet()) {
            // For internal wallets, use our helper function with ERC20 ABI
            approveHash = await executeContractCall(
              swapState.fromToken.address,
              'approve',
              [routerAddress, amountIn],
              BigInt(0),
              ERC20_ABI
            );
          } else {
            // For external wallets, use the standard approach
            const tokenContract = getContract({
              address: swapState.fromToken.address as `0x${string}`,
              abi: ERC20_ABI,
              client: walletClient,
            });

            approveHash = await tokenContract.write.approve([routerAddress, amountIn]);
          }

          logger.debug(`📝 Approval transaction hash: ${approveHash}`);
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          logger.debug('✅ Token approved');
        }

        // Step 2: Execute swap
        setCurrentStep('swapping');
        logger.debug('🔄 Executing swap...');

        if (swapState.fromToken.isNative === true) {
          // KLC to Token
          swapHash = await executeContractCall(
            routerAddress,
            'swapExactKLCForTokens',
            [amountOutMinWithSlippage, path, address, deadline],
            amountIn
          );
        } else if (swapState.toToken.isNative === true) {
          // Token to KLC
          swapHash = await executeContractCall(
            routerAddress,
            'swapExactTokensForKLC',
            [amountIn, amountOutMinWithSlippage, path, address, deadline]
          );
        } else {
          // Token to Token
          swapHash = await executeContractCall(
            routerAddress,
            'swapExactTokensForTokens',
            [amountIn, amountOutMinWithSlippage, path, address, deadline]
          );
        }
      }

      logger.debug(`🔄 Swap transaction hash: ${swapHash}`);
      logger.debug('⏳ Waiting for transaction confirmation...');

      // Store transaction hash for error handling
      setCurrentTransactionHash(swapHash);

      // Track the transaction immediately after submission
      const trackedTransaction = addTransaction({
        hash: swapHash,
        status: 'pending',
        type: 'SWAP',
        fromToken: {
          symbol: swapState.fromToken.symbol,
          address: swapState.fromToken.address,
          decimals: swapState.fromToken.decimals,
          logoURI: swapState.fromToken.logoURI
        },
        toToken: {
          symbol: swapState.toToken.symbol,
          address: swapState.toToken.address,
          decimals: swapState.toToken.decimals,
          logoURI: swapState.toToken.logoURI
        },
        fromAmount: swapState.fromAmount,
        toAmount: swapState.toAmount,
        fromAmountFormatted: swapState.fromAmount,
        toAmountFormatted: swapState.toAmount,
        slippage: swapState.slippage,
        priceImpact: priceImpactResult.priceImpact,
        gasUsed: estimatedGas,
        gasFee: estimatedGas,
        userAddress: address!,
        walletId: getWalletId()
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
      logger.debug(`✅ Swap confirmed in block ${receipt.blockNumber}`);

      // Update transaction status to confirmed
      updateTransactionStatus(swapHash, 'confirmed', Number(receipt.blockNumber));
      setCurrentTransactionHash(null);

      setCurrentStep('complete');

      // Refresh balances after successful swap
      refreshBalances();

      // Reset form
      setSwapState(prev => ({
        ...prev,
        fromAmount: '',
        toAmount: ''
      }));

      logger.debug('🎉 Swap completed successfully!');
    };

    // Execute with error handling and retry capability
    try {
      setRetryOperation(swapOperation);
      await executeWithErrorHandling(swapOperation, { autoRetry: true });
    } catch (err) {
      logger.error('❌ Error executing swap:', err);

      // Mark transaction as failed if we have a hash
      if (currentTransactionHash) {
        updateTransactionStatus(currentTransactionHash, 'failed');
        setCurrentTransactionHash(null);
      }

      setCurrentStep('idle');
    } finally {
      setIsSwapping(false);
    }
  };

  // Token selector button component
  const TokenSelectorButton = ({
    selectedToken,
    onClick,
    label
  }: {
    selectedToken: Token | null;
    onClick: () => void;
    label: string;
  }) => {
    const [imageError, setImageError] = useState(false);

    return (
      <Button
        variant="outline"
        onClick={onClick}
        className="min-w-[140px] justify-between h-12 px-3 bg-gray-900/30 text-white hover:bg-gray-800/50"
        style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
      >
        {selectedToken ? (
          <div className="flex items-center gap-2">
            {!imageError ? (
              <img
                src={selectedToken.logoURI}
                alt={selectedToken.symbol}
                className="w-5 h-5 rounded-full"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                {selectedToken.symbol.charAt(0)}
              </div>
            )}
            <span className="font-medium">{selectedToken.symbol}</span>
          </div>
        ) : (
          <span className="text-gray-500 text-sm">Select token</span>
        )}
        <ChevronDown className="h-4 w-4 text-gray-400 ml-1" />
      </Button>
    );
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Swap</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Wrong chain warning */}
        {isWrongChain && (
          <div className="p-4 border rounded-lg bg-red-900/20 backdrop-blur-sm border-red-500/30">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="font-medium">Wrong Network</span>
            </div>
            <p className="text-sm text-red-300 mt-2">
              Swaps are only available on KalyChain. Please switch to a KalyChain wallet to use the swap feature.
            </p>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="p-4 border rounded-lg bg-gray-900/50 backdrop-blur-sm border-amber-500/30">
            <h4 className="font-medium mb-3 text-white">Transaction Settings</h4>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Slippage Tolerance (%)</Label>
                <Input
                  type="number"
                  value={swapState.slippage}
                  onChange={(e) => setSwapState(prev => ({ ...prev, slippage: e.target.value }))}
                  placeholder="0.5"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Transaction Deadline (minutes)</Label>
                <Input
                  type="number"
                  value={swapState.deadline}
                  onChange={(e) => setSwapState(prev => ({ ...prev, deadline: e.target.value }))}
                  placeholder="20"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* From token */}
        <div className="space-y-3">
          {/* Header with balance and token selector */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-white">From</Label>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              {balancesLoading ? (
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </span>
              ) : swapState.fromToken ? (
                <>
                  <span>Balance: {getFormattedBalance(swapState.fromToken.symbol)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const balance = getFormattedBalance(swapState.fromToken!.symbol);
                      handleFromAmountChange(balance);
                    }}
                    className="h-6 px-2 text-xs font-medium text-amber-400 border-amber-400/30 hover:bg-amber-500/20 bg-amber-500/10"
                  >
                    MAX
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {/* Amount input and token selector row */}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="0.0"
              value={swapState.fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              className="flex-1 text-lg h-12 bg-gray-900/30 text-white placeholder:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
            />
            <TokenSelectorButton
              selectedToken={swapState.fromToken}
              onClick={() => setShowFromTokenModal(true)}
              label=""
            />
          </div>
        </div>

        {/* Swap button */}
        <div className="flex justify-center -my-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSwapTokens}
            className="rounded-full p-2 h-8 w-8"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>

        {/* To token */}
        <div className="space-y-3">
          {/* Header with balance */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-white">To</Label>
            <div className="text-xs text-gray-300">
              {balancesLoading ? (
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </span>
              ) : swapState.toToken ? (
                <span>Balance: {getFormattedBalance(swapState.toToken.symbol)}</span>
              ) : null}
            </div>
          </div>

          {/* Amount input and token selector row */}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="0.0"
              value={(() => {
                if (!swapState.toAmount || swapState.toAmount === '0.0') return '';
                const num = parseFloat(swapState.toAmount);
                if (isNaN(num)) return '';
                if (num >= 1000000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
                if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 2 });
                if (num >= 0.0001) return num.toFixed(6);
                if (num > 0) return num.toFixed(10).replace(/\.?0+$/, '');
                return '0.0';
              })()}
              readOnly
              className="flex-1 text-lg h-12 bg-gray-900/30 text-white placeholder:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
            />
            <TokenSelectorButton
              selectedToken={swapState.toToken}
              onClick={() => setShowToTokenModal(true)}
              label=""
            />
          </div>
        </div>

        {/* Price info */}
        {swapState.fromAmount && swapState.toAmount && (
          <div className="p-2 bg-gray-900/30 border rounded-lg" style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}>
            <div className="flex items-center gap-1 text-xs text-gray-300">
              <Info className="h-3 w-3" />
              <span>
                1 {swapState.fromToken?.symbol} = {(() => {
                  const rate = parseFloat(swapState.toAmount) / parseFloat(swapState.fromAmount);
                  if (rate >= 1) return rate.toFixed(6);
                  if (rate >= 0.0001) return rate.toFixed(6);
                  return rate.toFixed(10).replace(/\.?0+$/, '');
                })()} {swapState.toToken?.symbol}
              </span>
            </div>
          </div>
        )}

        {/* Enhanced Error Display */}
        {hasError && error && (
          <ErrorDisplay
            error={error}
            onRetry={retry}
            onAdjust={() => setShowSettings(true)}
            onReset={reset}
            onConnectWallet={() => {
              // This will be handled by the existing wallet connection logic
              logger.debug('Connect wallet requested');
            }}
            isRetrying={isRetrying}
          />
        )}

        {/* Progress Display */}
        {isSwapping && (
          <div className="flex items-start gap-3 p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400 mt-0.5 flex-shrink-0"></div>
            <div className="flex-1">
              <h4 className="font-medium text-white mb-2">
                Processing {
                  isWrapOperation(swapState.fromToken, swapState.toToken) ? 'Wrap' :
                  isUnwrapOperation(swapState.fromToken, swapState.toToken) ? 'Unwrap' :
                  'Swap'
                }
              </h4>
              <div className="space-y-2">
                {/* Show approval step only for regular swaps and unwrap operations */}
                {(!isWrapOperation(swapState.fromToken, swapState.toToken)) && (
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'text-amber-300 font-medium' : currentStep === 'swapping' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-300'}`}>
                    {currentStep === 'swapping' || currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'approving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-400"></div>
                    )}
                    <span>1. Approve token</span>
                  </div>
                )}
                <div className={`flex items-center gap-2 text-sm ${currentStep === 'swapping' ? 'text-amber-300 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-300'}`}>
                  {currentStep === 'complete' ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : currentStep === 'swapping' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-400"></div>
                  )}
                  <span>
                    {isWrapOperation(swapState.fromToken, swapState.toToken) ? '1' : '2'}. Execute {
                      isWrapOperation(swapState.fromToken, swapState.toToken) ? 'wrap' :
                      isUnwrapOperation(swapState.fromToken, swapState.toToken) ? 'unwrap' :
                      'swap'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Swap button */}
        <Button
          onClick={handleSwapClick}
          disabled={isSwapping || !isConnected || !swapState.fromAmount || !swapState.toAmount || isWrongChain}
          className="w-full h-11 text-base font-medium"
        >
          {isSwapping ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {currentStep === 'approving' && 'Approving...'}
              {currentStep === 'swapping' && (
                isWrapOperation(swapState.fromToken, swapState.toToken) ? 'Wrapping...' :
                isUnwrapOperation(swapState.fromToken, swapState.toToken) ? 'Unwrapping...' :
                'Swapping...'
              )}
            </div>
          ) : !isConnected ? (
            <>
              <Wallet className="h-4 w-4 mr-2" />
              Connect Wallet to {
                isWrapOperation(swapState.fromToken, swapState.toToken) ? 'Wrap' :
                isUnwrapOperation(swapState.fromToken, swapState.toToken) ? 'Unwrap' :
                'Swap'
              }
            </>
          ) : isWrongChain ? (
            'Switch to KalyChain'
          ) : (
            isWrapOperation(swapState.fromToken, swapState.toToken) ? 'Wrap' :
            isUnwrapOperation(swapState.fromToken, swapState.toToken) ? 'Unwrap' :
            'Swap'
          )}
        </Button>
      </CardContent>

      {/* Token Selector Modals */}
      <TokenSelectorModal
        isOpen={showFromTokenModal}
        onClose={() => setShowFromTokenModal(false)}
        onTokenSelect={(token) => {
          setSwapState(prev => ({ ...prev, fromToken: token }));
          // Notify parent component of token change
          if (onTokenChange) {
            onTokenChange(token, swapState.toToken);
          }
        }}
        selectedToken={swapState.fromToken}
        tokens={availableTokens}
        title="Select a token"
        getFormattedBalance={getFormattedBalance}
      />

      <TokenSelectorModal
        isOpen={showToTokenModal}
        onClose={() => setShowToTokenModal(false)}
        onTokenSelect={(token) => {
          setSwapState(prev => ({ ...prev, toToken: token }));
          // Notify parent component of token change
          if (onTokenChange) {
            onTokenChange(swapState.fromToken, token);
          }
        }}
        selectedToken={swapState.toToken}
        tokens={availableTokens}
        title="Select a token"
        getFormattedBalance={getFormattedBalance}
      />

      {/* Swap Confirmation Modal */}
      <SwapConfirmationModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        onConfirm={executeSwap}
        fromToken={swapState.fromToken}
        toToken={swapState.toToken}
        fromAmount={swapState.fromAmount}
        toAmount={swapState.toAmount}
        slippage={swapState.slippage}
        priceImpact={priceImpactResult.priceImpact}
        priceImpactSeverity={priceImpactResult.severity}
        priceImpactWarning={priceImpactResult.warning}
        estimatedGas={estimatedGas}
        isLoading={isSwapping}
      />
    </Card>
  );
}
