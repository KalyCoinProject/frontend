// Bridge Validation Hook - Form validation for bridge transfers
// This hook handles validation for bridge transfer forms

import { useState, useCallback } from 'react';
import { isAddress, parseUnits } from 'viem';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { bridgeLogger } from '@/lib/logger';

export interface BridgeFormValues {
  originChain: string;
  destinationChain: string;
  tokenIndex: number | null;
  amount: string;
  recipient: string;
}

export interface ValidationErrors {
  originChain?: string;
  destinationChain?: string;
  tokenIndex?: string;
  amount?: string;
  recipient?: string;
  form?: string;
}

export function useBridgeValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isValidating, setIsValidating] = useState(false);
  const { warpCore } = useBridgeContext();
  const { address: account } = useWallet();

  const validate = useCallback(async (values: BridgeFormValues): Promise<ValidationErrors> => {
    const newErrors: ValidationErrors = {};

    try {
      setIsValidating(true);

      // Basic field validation
      if (!values.originChain) {
        newErrors.originChain = 'Origin chain is required';
      }

      if (!values.destinationChain) {
        newErrors.destinationChain = 'Destination chain is required';
      }

      if (values.originChain === values.destinationChain) {
        newErrors.destinationChain = 'Destination chain must be different from origin chain';
      }

      if (values.tokenIndex === null) {
        newErrors.tokenIndex = 'Token selection is required';
      }

      if (!values.amount || values.amount === '0') {
        newErrors.amount = 'Amount is required';
      } else if (isNaN(Number(values.amount)) || Number(values.amount) <= 0) {
        newErrors.amount = 'Amount must be a positive number';
      }

      if (!values.recipient) {
        newErrors.recipient = 'Recipient address is required';
      } else if (!isAddress(values.recipient)) {
        newErrors.recipient = 'Invalid recipient address';
      }

      // If basic validation fails, return early
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return newErrors;
      }

      // Advanced validation with Hyperlane SDK
      if (warpCore && account && values.tokenIndex !== null) {
        try {
          const tokens = warpCore.tokens;
          if (values.tokenIndex >= tokens.length) {
            newErrors.tokenIndex = 'Invalid token selection';
            setErrors(newErrors);
            return newErrors;
          }

          const token = tokens[values.tokenIndex];
          if (!token) {
            newErrors.tokenIndex = 'Token not found';
            setErrors(newErrors);
            return newErrors;
          }

          // Parse amount with token decimals
          const amountWei = parseUnits(values.amount, token.decimals);
          const tokenAmount = token.amount(amountWei.toString());

          // Validate with Hyperlane SDK
          const validation = await warpCore.validateTransfer({
            originTokenAmount: tokenAmount,
            destination: values.destinationChain,
            recipient: values.recipient,
            sender: account,
          });

          // Map Hyperlane validation errors to our error format
          // The validation result can be null/undefined if no errors
          if (validation) {
            if (validation.amount) newErrors.amount = validation.amount;
            if (validation.recipient) newErrors.recipient = validation.recipient;
            if (validation.form) newErrors.form = validation.form;
          }

        } catch (err) {
          bridgeLogger.error('Validation error:', err);
          newErrors.form = err instanceof Error ? err.message : 'Validation failed';
        }
      }

      setErrors(newErrors);
      return newErrors;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Validation failed';
      const validationErrors = { form: errorMessage };
      setErrors(validationErrors);
      return validationErrors;
    } finally {
      setIsValidating(false);
    }
  }, [warpCore, account]);

  const isValid = Object.keys(errors).length === 0;

  return {
    validate,
    isValid,
    isValidating,
    errors,
  };
}
