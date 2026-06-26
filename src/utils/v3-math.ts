import { parseUnits } from 'viem';

/**
 * Calculates the square root of a BigInt
 * @param value The value to calculate the square root of
 * @returns The square root as a BigInt
 */
export function sqrt(value: bigint): bigint {
    if (value < 0n) {
        throw new Error('Square root of negative number');
    }

    if (value < 2n) {
        return value;
    }

    let z = value;
    let x = value / 2n + 1n;

    while (x < z) {
        z = x;
        x = (value / x + x) / 2n;
    }

    return z;
}

/**
 * Encodes the sqrtRatioX96 from two amounts.
 * This is used to initialize a V3 pool with a starting price.
 * 
 * Price = amount1 / amount0
 * sqrtPriceX96 = sqrt(price) * 2^96
 * 
 * @param amount0 The amount of token0
 * @param amount1 The amount of token1
 * @returns The sqrtRatioX96 as a BigInt
 */
export function encodeSqrtRatioX96(amount0: bigint, amount1: bigint): bigint {
    if (amount0 === 0n || amount1 === 0n) {
        throw new Error('Amounts must be greater than 0');
    }

    const numerator = amount1 << 192n;
    const ratio = numerator / amount0;

    return sqrt(ratio);
}

/**
 * Calculates sqrtRatioX96 from user input strings and decimals
 */
export function calculateSqrtPriceX96(
    amountA: string,
    amountB: string,
    tokenAAddress: string,
    tokenBAddress: string,
    tokenADecimals: number,
    tokenBDecimals: number
): bigint {
    // Sort tokens to determine which is token0 and token1
    const isTokenAToken0 = tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase();

    const token0Amount = isTokenAToken0 ? amountA : amountB;
    const token1Amount = isTokenAToken0 ? amountB : amountA;
    const token0Decimals = isTokenAToken0 ? tokenADecimals : tokenBDecimals;
    const token1Decimals = isTokenAToken0 ? tokenBDecimals : tokenADecimals;

    const amount0Big = parseUnits(token0Amount, token0Decimals);
    const amount1Big = parseUnits(token1Amount, token1Decimals);

    return encodeSqrtRatioX96(amount0Big, amount1Big);
}

// Q96 constant for price math
const Q96 = 2n ** 96n;

/**
 * Converts a tick to a price
 */
export function tickToPrice(tick: number, token0Decimals: number, token1Decimals: number): number {
    const sqrtRatioX96 = Math.pow(1.0001, tick);
    const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
    return sqrtRatioX96 * decimalAdjustment;
}

/**
 * Converts a price to the nearest tick
 */
export function priceToTick(price: number, token0Decimals: number, token1Decimals: number): number {
    if (price === 0) return -887272; // Min tick approximation

    const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
    const adjustedPrice = price / decimalAdjustment;

    // log(price) / log(1.0001)
    return Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
}

/**
 * Snap a tick to the nearest valid tick spacing
 */
export function snapTickToSpacing(tick: number, tickSpacing: number): number {
    const baseVerification = Math.floor(tick / tickSpacing) * tickSpacing;
    return baseVerification;
}

// --- Concentrated-liquidity math (Uniswap V3 TickMath / LiquidityAmounts) ---

/** Minimum/maximum ticks usable in a V3 pool. */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

/**
 * Computes sqrt(1.0001^tick) * 2^96.
 *
 * Direct BigInt port of Uniswap's `TickMath.getSqrtRatioAtTick`. The result is
 * exact (rounded up in the final shift, matching the reference implementation)
 * so it can be fed back into the on-chain pricing math without drift.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
    if (!Number.isInteger(tick)) {
        throw new Error('Tick must be an integer');
    }
    if (tick < MIN_TICK || tick > MAX_TICK) {
        throw new Error(`Tick ${tick} out of bounds`);
    }

    const absTick = BigInt(tick < 0 ? -tick : tick);

    let ratio = (absTick & 0x1n) !== 0n
        ? 0xfffcb933bd6fad37aa2d162d1a594001n
        : 0x100000000000000000000000000000000n;

    const factors: [bigint, bigint][] = [
        [0x2n, 0xfff97272373d413259a46990580e213an],
        [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
        [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
        [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
        [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
        [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
        [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
        [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
        [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
        [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
        [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
        [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
        [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
        [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
        [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
        [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
        [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
        [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
        [0x80000n, 0x48a170391f7dc42444e8fa2n],
    ];

    for (const [bit, factor] of factors) {
        if ((absTick & bit) !== 0n) {
            ratio = (ratio * factor) >> 128n;
        }
    }

    if (tick > 0) {
        const MAX_UINT256 = (1n << 256n) - 1n;
        ratio = MAX_UINT256 / ratio;
    }

    // Q128.128 -> Q128.96, rounding up.
    const remainder = ratio & ((1n << 32n) - 1n);
    return (ratio >> 32n) + (remainder === 0n ? 0n : 1n);
}

/**
 * Amount of token0 represented by `liquidity` between two sqrt-price bounds.
 * Port of Uniswap's `LiquidityAmounts.getAmount0ForLiquidity`.
 */
export function getAmount0ForLiquidity(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint
): bigint {
    const [lower, upper] = sqrtRatioAX96 > sqrtRatioBX96
        ? [sqrtRatioBX96, sqrtRatioAX96]
        : [sqrtRatioAX96, sqrtRatioBX96];

    if (lower === 0n) return 0n;

    return (((liquidity << 96n) * (upper - lower)) / upper) / lower;
}

/**
 * Amount of token1 represented by `liquidity` between two sqrt-price bounds.
 * Port of Uniswap's `LiquidityAmounts.getAmount1ForLiquidity`.
 */
export function getAmount1ForLiquidity(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint
): bigint {
    const [lower, upper] = sqrtRatioAX96 > sqrtRatioBX96
        ? [sqrtRatioBX96, sqrtRatioAX96]
        : [sqrtRatioAX96, sqrtRatioBX96];

    return (liquidity * (upper - lower)) / Q96;
}

/**
 * Splits `liquidity` into its token0/token1 amounts given the current price and
 * the position's price bounds. Port of `LiquidityAmounts.getAmountsForLiquidity`.
 */
export function getAmountsForLiquidity(
    sqrtRatioX96: bigint,
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint
): { amount0: bigint; amount1: bigint } {
    const [lower, upper] = sqrtRatioAX96 > sqrtRatioBX96
        ? [sqrtRatioBX96, sqrtRatioAX96]
        : [sqrtRatioAX96, sqrtRatioBX96];

    if (sqrtRatioX96 <= lower) {
        return { amount0: getAmount0ForLiquidity(lower, upper, liquidity), amount1: 0n };
    }
    if (sqrtRatioX96 < upper) {
        return {
            amount0: getAmount0ForLiquidity(sqrtRatioX96, upper, liquidity),
            amount1: getAmount1ForLiquidity(lower, sqrtRatioX96, liquidity),
        };
    }
    return { amount0: 0n, amount1: getAmount1ForLiquidity(lower, upper, liquidity) };
}

/**
 * Convenience wrapper: derive the underlying token0/token1 amounts held by a
 * V3 position from its raw on-chain fields (`liquidity`, current pool
 * `sqrtPriceX96`, and the position's tick range).
 */
export function getPositionTokenAmounts(
    liquidity: bigint,
    sqrtPriceX96: bigint,
    tickLower: number,
    tickUpper: number
): { amount0: bigint; amount1: bigint } {
    if (liquidity === 0n) {
        return { amount0: 0n, amount1: 0n };
    }
    const sqrtRatioAX96 = getSqrtRatioAtTick(tickLower);
    const sqrtRatioBX96 = getSqrtRatioAtTick(tickUpper);
    return getAmountsForLiquidity(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, liquidity);
}

/**
 * Liquidity obtainable from a given amount of token0 between two sqrt-price
 * bounds. Port of Uniswap's `LiquidityAmounts.getLiquidityForAmount0`.
 */
export function getLiquidityForAmount0(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    amount0: bigint
): bigint {
    const [lower, upper] = sqrtRatioAX96 > sqrtRatioBX96
        ? [sqrtRatioBX96, sqrtRatioAX96]
        : [sqrtRatioAX96, sqrtRatioBX96];
    if (upper === lower) return 0n;
    const intermediate = (lower * upper) / Q96;
    return (amount0 * intermediate) / (upper - lower);
}

/**
 * Liquidity obtainable from a given amount of token1 between two sqrt-price
 * bounds. Port of Uniswap's `LiquidityAmounts.getLiquidityForAmount1`.
 */
export function getLiquidityForAmount1(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    amount1: bigint
): bigint {
    const [lower, upper] = sqrtRatioAX96 > sqrtRatioBX96
        ? [sqrtRatioBX96, sqrtRatioAX96]
        : [sqrtRatioAX96, sqrtRatioBX96];
    if (upper === lower) return 0n;
    return (amount1 * Q96) / (upper - lower);
}

/**
 * Given one side of a V3 deposit, compute the required amount of the other side
 * for the position's range at the current price. Mirrors what the Uniswap UI
 * does when you type into one field.
 *
 * Returns `rangeStatus`:
 *  - `below`     — price below range: position is 100% token0; only token0 is
 *                  deposited (paired token1 is 0; a token1 input pairs to 0).
 *  - `above`     — price above range: position is 100% token1; only token1.
 *  - `in-range`  — both tokens required in a fixed ratio.
 */
export function getPairedAmount(opts: {
    sqrtPriceX96: bigint;
    tickLower: number;
    tickUpper: number;
    inputSide: 'token0' | 'token1';
    inputAmount: bigint;
}): { pairedAmount: bigint; rangeStatus: 'below' | 'in-range' | 'above' } {
    const { sqrtPriceX96, tickLower, tickUpper, inputSide, inputAmount } = opts;
    const sLower = getSqrtRatioAtTick(tickLower);
    const sUpper = getSqrtRatioAtTick(tickUpper);
    const sP = sqrtPriceX96;

    if (sP <= sLower) {
        // Below range: only token0 is used; the other side is always 0.
        return { pairedAmount: 0n, rangeStatus: 'below' };
    }
    if (sP >= sUpper) {
        // Above range: only token1 is used; the other side is always 0.
        return { pairedAmount: 0n, rangeStatus: 'above' };
    }

    if (inputAmount <= 0n) {
        return { pairedAmount: 0n, rangeStatus: 'in-range' };
    }

    if (inputSide === 'token0') {
        const liquidity = getLiquidityForAmount0(sP, sUpper, inputAmount);
        return {
            pairedAmount: getAmount1ForLiquidity(sLower, sP, liquidity),
            rangeStatus: 'in-range',
        };
    }
    const liquidity = getLiquidityForAmount1(sLower, sP, inputAmount);
    return {
        pairedAmount: getAmount0ForLiquidity(sP, sUpper, liquidity),
        rangeStatus: 'in-range',
    };
}
