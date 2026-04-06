
import { describe, it, expect, vi } from 'vitest';
import { Token } from '@/config/dex/types';

// Mock Config
const MOCK_TOKEN_A: Token = { chainId: 3889, address: '0xA', decimals: 18, symbol: 'A', name: 'A', logoURI: '' };
const MOCK_TOKEN_B: Token = { chainId: 3889, address: '0xB', decimals: 18, symbol: 'B', name: 'B', logoURI: '' };

// Simulate the UI's calculateEnhancedPriceImpact function
const calculateEnhancedPriceImpactSimulated = async (
    quoteResult: any
) => {
    try {
        // Line 496 in SwapInterface.tsx:
        // const severity = parseFloat(quote.priceImpact.toString()) > 5 ...

        console.log("Processing Price Impact:", quoteResult.priceImpact);

        if (!quoteResult) throw new Error("No quote result");

        // This is the EXACT line causing crashes if priceImpact is missing/null matches usage in UI
        const impactString = quoteResult.priceImpact.toString();
        const impactNumber = parseFloat(impactString);

        const severity = impactNumber > 5 ? 'high' : impactNumber > 1 ? 'medium' : 'low';

        return {
            priceImpact: impactString,
            severity,
            warning: severity === 'high' ? 'High price impact' : null
        };
    } catch (e: any) {
        throw new Error(`UI Crash Logic: ${e.message}`);
    }
};

describe('SwapInterface Logic Reproduction', () => {
    it('should crash if priceImpact is undefined (simulating service failure)', async () => {
        const badQuote = {
            amountOut: '100',
            // priceImpact missing
        };

        await expect(calculateEnhancedPriceImpactSimulated(badQuote))
            .rejects.toThrow("Cannot read properties of undefined");
    });

    it('should pass with valid number priceImpact', async () => {
        const goodQuote = {
            amountOut: '100',
            priceImpact: 0.5
        };

        const result = await calculateEnhancedPriceImpactSimulated(goodQuote);
        expect(result.severity).toBe('low');
    });

    it('should pass with string number priceImpact', async () => {
        const stringQuote = {
            amountOut: '100',
            priceImpact: "0.5"
        };

        const result = await calculateEnhancedPriceImpactSimulated(stringQuote);
        expect(result.severity).toBe('low');
    });

    it('should handle zero price impact (0)', async () => {
        const zeroQuote = {
            amountOut: '100',
            priceImpact: 0
        };

        const result = await calculateEnhancedPriceImpactSimulated(zeroQuote);
        expect(result.severity).toBe('low');
    });
});
