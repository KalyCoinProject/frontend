'use client';

/**
 * useV3IncentiveAPR - Estimate APR for a V3 staking incentive
 *
 * Note: V3 concentrated liquidity makes exact APR calculation impossible since
 * each position earns different rewards based on its price range. This provides
 * an aggregate estimate based on total rewards distributed over total staked value.
 */

import { useMemo } from 'react';
import type { V3Incentive } from '@/services/dex/v3-staking-types';

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

interface UseV3IncentiveAPRResult {
    /** Estimated annualized percentage rate, or null if not calculable */
    apr: number | null;
    /** Always true — V3 APR is inherently an estimate due to concentrated liquidity */
    isEstimate: true;
}

/**
 * Calculate an approximate APR for a V3 staking incentive.
 *
 * Formula:
 *   APR = (rewardPerSecond * secondsPerYear * rewardTokenPriceUSD) / totalStakedValueUSD * 100
 *
 * @param incentive - The V3 incentive to calculate APR for
 * @param rewardTokenPriceUSD - Current USD price of the reward token
 * @param totalStakedValueUSD - Total USD value of all liquidity staked in this incentive
 * @param rewardTokenDecimals - Decimals of the reward token (default 18)
 */
export function useV3IncentiveAPR(
    incentive: V3Incentive | null,
    rewardTokenPriceUSD: number,
    totalStakedValueUSD: number = 0,
    rewardTokenDecimals: number = 18,
): UseV3IncentiveAPRResult {
    const apr = useMemo(() => {
        if (!incentive) return null;
        if (rewardTokenPriceUSD <= 0) return null;
        if (totalStakedValueUSD <= 0) return null;
        if (!incentive.isActive) return null;

        const startTime = Number(incentive.key.startTime);
        const endTime = Number(incentive.key.endTime);
        const duration = endTime - startTime;

        if (duration <= 0) return null;

        // Total reward unclaimed (in raw token units)
        const totalRewardRaw = incentive.totalRewardUnclaimed;
        if (totalRewardRaw <= 0n) return null;

        // Convert reward to human-readable number
        const divisor = 10 ** rewardTokenDecimals;
        const totalRewardHuman = Number(totalRewardRaw) / divisor;

        // Reward per second (based on remaining unclaimed rewards and remaining time)
        const now = Math.floor(Date.now() / 1000);
        const remainingTime = Math.max(1, endTime - now);
        const rewardPerSecond = totalRewardHuman / remainingTime;

        // Annual reward value in USD
        const annualRewardUSD = rewardPerSecond * SECONDS_PER_YEAR * rewardTokenPriceUSD;

        // APR as percentage
        const aprValue = (annualRewardUSD / totalStakedValueUSD) * 100;

        // Sanity cap: APRs above 100,000% are likely data errors
        if (aprValue > 100_000) return null;

        return aprValue;
    }, [incentive, rewardTokenPriceUSD, totalStakedValueUSD, rewardTokenDecimals]);

    return { apr, isEstimate: true };
}

export default useV3IncentiveAPR;
