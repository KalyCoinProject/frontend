import { describe, it, expect } from 'vitest';
import {
    getSqrtRatioAtTick,
    getAmount0ForLiquidity,
    getAmount1ForLiquidity,
    getAmountsForLiquidity,
    getPositionTokenAmounts,
    getLiquidityForAmount0,
    getLiquidityForAmount1,
    getPairedAmount,
    MIN_TICK,
    MAX_TICK,
} from '../v3-math';

// Reference values produced from the canonical Uniswap V3 TickMath /
// LiquidityAmounts implementations (verified against the published
// MIN_SQRT_RATIO / MAX_SQRT_RATIO constants).
describe('getSqrtRatioAtTick', () => {
    it('returns 2^96 at tick 0', () => {
        expect(getSqrtRatioAtTick(0)).toBe(79228162514264337593543950336n);
    });

    it('matches MIN_SQRT_RATIO at MIN_TICK', () => {
        expect(getSqrtRatioAtTick(MIN_TICK)).toBe(4295128739n);
    });

    it('matches MAX_SQRT_RATIO at MAX_TICK', () => {
        expect(getSqrtRatioAtTick(MAX_TICK)).toBe(
            1461446703485210103287273052203988822378723970342n
        );
    });

    it('is monotonic around zero', () => {
        expect(getSqrtRatioAtTick(60)).toBe(79466191966197645195421774833n);
        expect(getSqrtRatioAtTick(-60)).toBe(78990846045029531151608375686n);
        expect(getSqrtRatioAtTick(60)).toBeGreaterThan(getSqrtRatioAtTick(0));
        expect(getSqrtRatioAtTick(-60)).toBeLessThan(getSqrtRatioAtTick(0));
    });

    it('handles a large positive tick', () => {
        expect(getSqrtRatioAtTick(23028)).toBe(250553947533412109193337304115n);
    });

    it('throws when tick is out of bounds', () => {
        expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).toThrow();
        expect(() => getSqrtRatioAtTick(MIN_TICK - 1)).toThrow();
    });
});

describe('getAmount0ForLiquidity / getAmount1ForLiquidity', () => {
    const sa = getSqrtRatioAtTick(-60);
    const sb = getSqrtRatioAtTick(60);
    const L = 10n ** 18n;

    it('computes amount0 across the full range', () => {
        // Below the range, all liquidity is in token0.
        expect(getAmount0ForLiquidity(sa, sb, L)).toBe(5999709018652706n);
    });

    it('computes amount1 across the full range', () => {
        // Above the range, all liquidity is in token1.
        expect(getAmount1ForLiquidity(sa, sb, L)).toBe(5999709018652706n);
    });

    it('is order-independent for the two ratio bounds', () => {
        expect(getAmount0ForLiquidity(sb, sa, L)).toBe(getAmount0ForLiquidity(sa, sb, L));
        expect(getAmount1ForLiquidity(sb, sa, L)).toBe(getAmount1ForLiquidity(sa, sb, L));
    });
});

describe('getAmountsForLiquidity', () => {
    const sa = getSqrtRatioAtTick(-60);
    const sb = getSqrtRatioAtTick(60);
    const L = 10n ** 18n;

    it('splits both tokens when price is in range', () => {
        const sp = getSqrtRatioAtTick(0);
        const { amount0, amount1 } = getAmountsForLiquidity(sp, sa, sb, L);
        expect(amount0).toBe(2995354955910780n);
        expect(amount1).toBe(2995354955910780n);
    });

    it('holds only token0 when price is below the range', () => {
        const sp = getSqrtRatioAtTick(-120);
        const { amount0, amount1 } = getAmountsForLiquidity(sp, sa, sb, L);
        expect(amount0).toBe(5999709018652706n);
        expect(amount1).toBe(0n);
    });

    it('holds only token1 when price is above the range', () => {
        const sp = getSqrtRatioAtTick(120);
        const { amount0, amount1 } = getAmountsForLiquidity(sp, sa, sb, L);
        expect(amount0).toBe(0n);
        expect(amount1).toBe(5999709018652706n);
    });

    it('returns zero amounts for zero liquidity', () => {
        const sp = getSqrtRatioAtTick(0);
        const { amount0, amount1 } = getAmountsForLiquidity(sp, sa, sb, 0n);
        expect(amount0).toBe(0n);
        expect(amount1).toBe(0n);
    });
});

describe('getLiquidityForAmount0 / getLiquidityForAmount1', () => {
    const sL = getSqrtRatioAtTick(-60);
    const sP = getSqrtRatioAtTick(0);
    const sU = getSqrtRatioAtTick(60);
    const oneToken = 10n ** 18n;

    it('derives liquidity from amount0 (in-range upper leg)', () => {
        expect(getLiquidityForAmount0(sP, sU, oneToken)).toBe(333850249709699449134n);
    });

    it('derives liquidity from amount1 (in-range lower leg)', () => {
        expect(getLiquidityForAmount1(sL, sP, oneToken)).toBe(333850249709699449134n);
    });

    it('is order-independent for the ratio bounds', () => {
        expect(getLiquidityForAmount0(sU, sP, oneToken)).toBe(getLiquidityForAmount0(sP, sU, oneToken));
        expect(getLiquidityForAmount1(sP, sL, oneToken)).toBe(getLiquidityForAmount1(sL, sP, oneToken));
    });
});

describe('getPairedAmount', () => {
    const oneToken = 10n ** 18n;

    it('pairs token0 -> token1 in a symmetric in-range position', () => {
        const { pairedAmount, rangeStatus } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(0),
            tickLower: -60,
            tickUpper: 60,
            inputSide: 'token0',
            inputAmount: oneToken,
        });
        expect(rangeStatus).toBe('in-range');
        expect(pairedAmount).toBe(999999999999999999n);
    });

    it('pairs token1 -> token0 symmetrically (inverse direction)', () => {
        const { pairedAmount } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(0),
            tickLower: -60,
            tickUpper: 60,
            inputSide: 'token1',
            inputAmount: oneToken,
        });
        expect(pairedAmount).toBe(999999999999999999n);
    });

    it('pairs correctly for an asymmetric range', () => {
        const { pairedAmount } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(0),
            tickLower: -120,
            tickUpper: 240,
            inputSide: 'token0',
            inputAmount: oneToken,
        });
        expect(pairedAmount).toBe(501499920505690742n);
    });

    it('reports "below" range and pairs to zero (price below tickLower)', () => {
        const { pairedAmount, rangeStatus } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(-200),
            tickLower: -60,
            tickUpper: 60,
            inputSide: 'token0',
            inputAmount: oneToken,
        });
        expect(rangeStatus).toBe('below');
        expect(pairedAmount).toBe(0n);
    });

    it('reports "above" range and pairs to zero (price above tickUpper)', () => {
        const { pairedAmount, rangeStatus } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(200),
            tickLower: -60,
            tickUpper: 60,
            inputSide: 'token1',
            inputAmount: oneToken,
        });
        expect(rangeStatus).toBe('above');
        expect(pairedAmount).toBe(0n);
    });

    it('returns zero paired amount for zero input in range', () => {
        const { pairedAmount } = getPairedAmount({
            sqrtPriceX96: getSqrtRatioAtTick(0),
            tickLower: -60,
            tickUpper: 60,
            inputSide: 'token0',
            inputAmount: 0n,
        });
        expect(pairedAmount).toBe(0n);
    });
});

describe('getPositionTokenAmounts', () => {
    it('derives amounts from raw position fields (in range)', () => {
        const sqrtPriceX96 = getSqrtRatioAtTick(0);
        const { amount0, amount1 } = getPositionTokenAmounts(
            10n ** 18n,
            sqrtPriceX96,
            -60,
            60
        );
        expect(amount0).toBe(2995354955910780n);
        expect(amount1).toBe(2995354955910780n);
    });

    it('returns zeros for an empty position', () => {
        const sqrtPriceX96 = getSqrtRatioAtTick(0);
        const { amount0, amount1 } = getPositionTokenAmounts(0n, sqrtPriceX96, -60, 60);
        expect(amount0).toBe(0n);
        expect(amount1).toBe(0n);
    });
});
