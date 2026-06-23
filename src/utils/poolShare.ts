/**
 * Pool-share math for V2 liquidity positions.
 *
 * A user's underlying token amounts are their share of the pool's total LP
 * supply applied to each reserve. This mirrors the calculation used by the
 * pool-discovery (Browse) page so both surfaces agree.
 *
 * Working in human-readable units (already formatted reserves / LP balances)
 * keeps this independent of token decimals — important because pairs that mix a
 * 6-decimal token (USDC) with an 18-decimal token (KUSD) produce a microscopic
 * raw LP-token quantity that is meaningless to display directly.
 */
import { parseUnits, formatUnits } from 'viem';

/**
 * Compute the LP-token amount for a percentage of a formatted LP balance,
 * returned as a plain decimal string safe for `parseUnits`.
 *
 * Done with bigint math rather than `parseFloat * pct`: a microscopic LP
 * balance (e.g. the ~1e-8 supply of a USDC-6 / KUSD-18 pool) turns into
 * scientific notation under `Number.toString()` (e.g. "5.001933903e-9"), which
 * `parseUnits` rejects with "is not a valid decimal number". `formatUnits`
 * always yields a plain decimal, and at 100% the result equals the input
 * balance exactly — so MAX removes the whole position with no dust or overshoot.
 */
export function lpAmountForPercentage(formattedLpBalance: string, percentage: number): string {
	if (!formattedLpBalance || !(percentage > 0)) return '0';
	const wei = parseUnits(formattedLpBalance as `${number}`, 18);
	const portion = (wei * BigInt(Math.round(percentage))) / 100n;
	return formatUnits(portion, 18);
}

export interface UserPositionAmounts {
	/** Fraction of the pool the user owns, 0..1. */
	share: number;
	token0Amount: number;
	token1Amount: number;
}

export function computeUserPositionAmounts(
	userLpBalance: number,
	totalSupply: number,
	reserve0: number,
	reserve1: number,
): UserPositionAmounts {
	const zero: UserPositionAmounts = { share: 0, token0Amount: 0, token1Amount: 0 };

	if (
		!Number.isFinite(userLpBalance) ||
		!Number.isFinite(totalSupply) ||
		!Number.isFinite(reserve0) ||
		!Number.isFinite(reserve1) ||
		totalSupply <= 0 ||
		userLpBalance <= 0
	) {
		return zero;
	}

	const share = userLpBalance / totalSupply;
	return {
		share,
		token0Amount: reserve0 * share,
		token1Amount: reserve1 * share,
	};
}
