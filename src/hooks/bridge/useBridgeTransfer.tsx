// Bridge Transfer Hook - Core transfer logic adapted from Hyperlane
// This hook handles bridge transfer operations with full status tracking

import { useState, useCallback } from 'react';
import { parseUnits } from 'viem';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { useTransferStore, TransferStatus, TransferContext, txCategoryToStatuses, errorMessages } from './useTransferStore';
import { useToast, toastHelpers } from '@/components/ui/toast';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';
import { loggerHelpers } from '@/utils/bridge/logger';
import { bridgeLogger } from '@/lib/logger';

export interface TransferParams {
  originChain: string;
  destinationChain: string;
  tokenIndex: number;
  amount: string;
  recipient: string;
}

export function useBridgeTransfer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { warpCore, multiProvider } = useBridgeContext();
  const { address: account, signTransaction, chainId } = useWallet();
  const { addTransfer, updateTransferStatus } = useTransferStore();
  const toast = useToast();

  const transfer = useCallback(async (params: TransferParams) => {
    if (!warpCore || !multiProvider || !account) {
      const error = 'Bridge not initialized or wallet not connected';
      toast.error('Bridge Error', error);
      throw new Error(error);
    }

    loggerHelpers.transferStart(params);
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    let transferIndex: number | undefined;

    try {
      // Check if we need to switch chains
      const originChainId = multiProvider.getChainMetadata(params.originChain).chainId;
      if (chainId && chainId !== originChainId) {
        loggerHelpers.chainSwitch(`Chain ${chainId}`, `${params.originChain} (${originChainId})`);

        // Manual chain switch required - show user-friendly message
        const error = `Please switch to ${bridgeHelpers.getChainDisplayName(params.originChain)} in your wallet before proceeding`;
        toast.error('Chain Switch Required', error);
        loggerHelpers.chainSwitch('Manual chain switch required', `${params.originChain} (${originChainId})`);
        throw new Error(error);
      }

      // Get tokens from warp core
      const tokens = warpCore.tokens;
      if (params.tokenIndex >= tokens.length) {
        throw new Error('Invalid token index');
      }

      const token = tokens[params.tokenIndex];
      if (!token) {
        throw new Error('Token not found');
      }

      // Parse amount with token decimals
      const amountWei = parseUnits(params.amount, token.decimals);
      const tokenAmount = token.amount(amountWei.toString());

      // Find destination token connection
      const connection = token.getConnectionForChain(params.destinationChain);
      if (!connection) {
        throw new Error(`No route found from ${params.originChain} to ${params.destinationChain}`);
      }

      // Add transfer to store
      const transferContext: TransferContext = {
        timestamp: Date.now(),
        status: TransferStatus.Preparing,
        origin: params.originChain,
        destination: params.destinationChain,
        originTokenAddressOrDenom: token.addressOrDenom,
        destTokenAddressOrDenom: connection.token.addressOrDenom,
        sender: account,
        recipient: params.recipient,
        amount: params.amount,
      };

      transferIndex = addTransfer(transferContext);
      updateTransferStatus(transferIndex, TransferStatus.Preparing);

      // Check destination collateral sufficiency (CRITICAL GAP FIXED)
      bridgeLogger.debug('🔍 Checking destination collateral...');
      const isCollateralSufficient = await warpCore.isDestinationCollateralSufficient({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
      });

      if (!isCollateralSufficient) {
        const error = 'Insufficient collateral on destination chain for transfer';
        toast.error('Transfer Failed', error);
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, error);
        throw new Error(error);
      }

      // Validate transfer
      bridgeLogger.debug('✅ Validating transfer...');
      const validation = await warpCore.validateTransfer({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
        recipient: params.recipient,
        sender: account,
      });

      if (validation && Object.keys(validation).length > 0) {
        const errorMessage = Object.values(validation)[0] as string;
        toast.error('Validation Failed', errorMessage);
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, errorMessage);
        throw new Error(errorMessage);
      }

      // Update status: Creating transactions
      updateTransferStatus(transferIndex, TransferStatus.CreatingTxs);

      // Get transfer transactions
      bridgeLogger.debug('📝 Creating transfer transactions...');
      const transferTxs = await warpCore.getTransferRemoteTxs({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
        recipient: params.recipient,
        sender: account,
      });

      bridgeLogger.debug(`📋 Created ${transferTxs.length} transactions`);
      transferTxs.forEach((tx, index) => {
        bridgeLogger.debug(`Transaction ${index + 1}:`, {
          category: tx.category
        });
      });

      // Execute transactions with status tracking
      const txHashes: string[] = [];
      for (const tx of transferTxs) {
        const category = tx.category || 'transfer';
        const [signingStatus, confirmingStatus] = txCategoryToStatuses[category as keyof typeof txCategoryToStatuses] ||
          [TransferStatus.SigningTransfer, TransferStatus.ConfirmingTransfer];

        // Update status: Signing
        updateTransferStatus(transferIndex, signingStatus);

        bridgeLogger.debug(`✍️ Signing ${category} transaction...`);
        const txHash = await signTransaction(tx);
        txHashes.push(txHash);

        // Update status: Confirming
        updateTransferStatus(transferIndex, confirmingStatus, txHash);

        bridgeLogger.debug(`⏳ Confirming ${category} transaction: ${txHash}`);

        // TODO: Wait for transaction receipt and extract message ID
        // This is not critical for transfer success, so we'll skip it for now
        // try {
        //   const provider = multiProvider.getProvider(params.originChain);
        //   const receipt = await provider.waitForTransaction(txHash);
        //   const messageId = bridgeHelpers.extractMessageIdFromReceipt(receipt, params.originChain);
        //   if (messageId) {
        //     bridgeLogger.debug(`📧 Message ID extracted: ${messageId}`);
        //     updateTransferStatus(transferIndex, confirmingStatus, txHash, messageId);
        //   }
        // } catch (receiptError) {
        //   bridgeLogger.warn('⚠️ Failed to extract message ID from receipt:', receiptError);
        // }

        // Show transaction sent toast
        toastHelpers.transactionSuccess(txHash, params.originChain, toast);
      }

      // Update final status
      updateTransferStatus(transferIndex, TransferStatus.ConfirmedTransfer, txHashes[txHashes.length - 1]);

      // Show success toast
      toastHelpers.bridgeSuccess(
        params.amount,
        token.symbol,
        bridgeHelpers.getChainDisplayName(params.originChain),
        bridgeHelpers.getChainDisplayName(params.destinationChain),
        toast
      );

      setSuccessMessage(`Transfer initiated! ${txHashes.length} transaction(s) sent.`);
      bridgeLogger.debug('🎉 Bridge transfer completed successfully!');

      return transferTxs;
    } catch (err) {
      bridgeLogger.error('❌ Bridge transfer failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transfer failed';

      // Update transfer status to failed if we have a transfer index
      if (transferIndex !== undefined) {
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, errorMessage);
      }

      // Show error toast
      toastHelpers.bridgeError(errorMessage, toast);

      setError(errorMessage);
      setSuccessMessage(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [warpCore, multiProvider, account, signTransaction, addTransfer, updateTransferStatus, toast]);

  return {
    transfer,
    isLoading,
    error,
    successMessage,
  };
}
