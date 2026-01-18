// Token Approval Hook - Check if token approval is required for bridge transfers
// Adapted from hyperlane-warp-ui/src/features/tokens/approval.ts

import { useState, useEffect } from 'react';
import { parseUnits } from 'viem';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { loggerHelpers } from '@/utils/bridge/logger';
import { bridgeLogger } from '@/lib/logger';

interface UseTokenApprovalParams {
  tokenIndex: number | null;
  amount: string;
  enabled?: boolean;
}

export function useTokenApproval({ tokenIndex, amount, enabled = true }: UseTokenApprovalParams) {
  const [isLoading, setIsLoading] = useState(false);
  const [isApproveRequired, setIsApproveRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { warpCore } = useBridgeContext();
  const { address: account } = useWallet();

  useEffect(() => {
    const checkApproval = async () => {
      if (!enabled || !warpCore || !account || tokenIndex === null || !amount) {
        setIsApproveRequired(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tokens = warpCore.tokens;
        const token = tokens[tokenIndex];
        
        if (!token) {
          setIsApproveRequired(false);
          return;
        }

        // Parse amount with token decimals
        const amountWei = parseUnits(amount, token.decimals);

        // Check if approval is required
        // This is a simplified check - in production, you'd check the actual allowance
        const isCollateralToken = token.standard === 'EvmHypCollateral';
        const isNativeToken = token.standard === 'EvmHypNative';
        
        // Native tokens don't require approval
        if (isNativeToken) {
          setIsApproveRequired(false);
          loggerHelpers.validation('Token approval not required for native token', { token: token.symbol });
          return;
        }

        // Check if approval is required using Hyperlane SDK
        const tokenAmount = token.amount(amountWei.toString());
        bridgeLogger.debug('🔍 Checking approval for:', {
          token: token.symbol,
          standard: token.standard,
          amount: amount,
          collateralAddress: token.collateralAddressOrDenom,
          account: account
        });

        const isApprovalRequired = await warpCore.isApproveRequired({
          originTokenAmount: tokenAmount,
          owner: account
        });

        bridgeLogger.debug('✅ Approval check result:', isApprovalRequired);
        setIsApproveRequired(isApprovalRequired);

        if (isApprovalRequired) {
          loggerHelpers.validation('Token approval required', {
            token: token.symbol,
            amount: amount,
            tokenStandard: token.standard,
            collateralAddress: token.collateralAddressOrDenom
          });
        } else {
          loggerHelpers.validation('Token approval not required', {
            token: token.symbol,
            tokenStandard: token.standard
          });
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to check token approval';
        setError(errorMessage);
        loggerHelpers.validationError('Token approval check failed', { error: err, tokenIndex, amount });
        setIsApproveRequired(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkApproval();
  }, [warpCore, account, tokenIndex, amount, enabled]);

  return {
    isLoading,
    isApproveRequired,
    error,
  };
}

// Note: Token approval execution is handled automatically by the Hyperlane SDK
// as part of the transfer transaction flow in useBridgeTransfer.tsx.
// The getTransferRemoteTxs() method returns an array of transactions that
// includes approval transactions when needed.
