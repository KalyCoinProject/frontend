import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import { computeUserPositionAmounts, lpAmountForPercentage } from '../poolShare';

describe('computeUserPositionAmounts', () => {
	it('splits reserves by the user share of total supply', () => {
		const r = computeUserPositionAmounts(5, 10, 100, 200);
		expect(r.share).toBeCloseTo(0.5, 12);
		expect(r.token0Amount).toBeCloseTo(50, 12);
		expect(r.token1Amount).toBeCloseTo(100, 12);
	});

	it('handles 100% ownership of a microscopic-LP pool (USDC 6dec / KUSD 18dec case)', () => {
		// The whole pool LP supply is ~9.5e-6; the user owns all of it. The raw LP
		// number is meaningless, but the token amounts must come out as the real
		// reserves (9.56 USDC / 9.43 KUSD) — this is the bug we are fixing.
		const r = computeUserPositionAmounts(9.5e-6, 9.5e-6, 9.56, 9.43);
		expect(r.share).toBeCloseTo(1, 12);
		expect(r.token0Amount).toBeCloseTo(9.56, 9);
		expect(r.token1Amount).toBeCloseTo(9.43, 9);
	});

	it('returns zeros when total supply is zero', () => {
		expect(computeUserPositionAmounts(5, 0, 100, 200)).toEqual({
			share: 0,
			token0Amount: 0,
			token1Amount: 0,
		});
	});

	it('returns zeros when the user has no balance', () => {
		expect(computeUserPositionAmounts(0, 10, 100, 200)).toEqual({
			share: 0,
			token0Amount: 0,
			token1Amount: 0,
		});
	});

	it('treats non-finite / invalid inputs as no position', () => {
		expect(computeUserPositionAmounts(NaN, 10, 100, 200).share).toBe(0);
		expect(computeUserPositionAmounts(5, NaN, 100, 200).share).toBe(0);
	});
});

describe('lpAmountForPercentage', () => {
	it('never returns scientific notation for a microscopic LP balance (the remove bug)', () => {
		// This is the exact failure: a ~1e-8 LP balance, 50% of which is ~5e-9.
		// (parseFloat(bal) * 50 / 100).toString() === "5.001933903e-9", which
		// viem's parseUnits rejects. The helper must return a plain decimal.
		const balance = '0.000000010003867806';
		const out = lpAmountForPercentage(balance, 50);
		expect(out).not.toMatch(/e/i);
		// And it must be parseable by viem (round-trips through parseUnits).
		expect(() => parseUnits(out as `${number}`, 18)).not.toThrow();
		expect(out).toBe('0.000000005001933903');
	});

	it('returns the full balance exactly at 100% (MAX must not leave dust or overshoot)', () => {
		const balance = '0.000000010003867806';
		expect(lpAmountForPercentage(balance, 100)).toBe(balance);
	});

	it('halves a normal balance', () => {
		expect(lpAmountForPercentage('10.0', 50)).toBe('5');
	});

	it('returns 0 for zero percentage or empty balance', () => {
		expect(lpAmountForPercentage('1.23', 0)).toBe('0');
		expect(lpAmountForPercentage('', 50)).toBe('0');
	});
});
