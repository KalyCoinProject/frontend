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
