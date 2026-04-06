/**
 * V3 Staking Types
 * Type definitions for the Uniswap V3 Staker contract interactions
 */

export interface IncentiveKey {
    rewardToken: string;
    pool: string;
    startTime: bigint;
    endTime: bigint;
    refundee: string;
}

export interface V3Incentive {
    key: IncentiveKey;
    incentiveId: string; // keccak256 hash of encoded key
    totalRewardUnclaimed: bigint;
    totalSecondsClaimedX128: bigint;
    numberOfStakes: number;
    // UI-friendly fields
    poolToken0Symbol?: string;
    poolToken1Symbol?: string;
    poolFee?: number;
    rewardTokenSymbol?: string;
    rewardTokenDecimals?: number;
    isActive: boolean;
    timeRemaining: number;
}

export interface V3StakedPosition {
    tokenId: bigint;
    incentiveId: string;
    liquidity: bigint;
    secondsPerLiquidityInsideInitialX128: bigint;
    reward: bigint;
    secondsInsideX128: bigint;
}

export interface V3Deposit {
    tokenId: bigint;
    owner: string;
    numberOfStakes: number;
    tickLower: number;
    tickUpper: number;
}

export interface CreateIncentiveParams {
    rewardToken: string;
    pool: string;
    startTime: number;
    endTime: number;
    refundee: string;
    rewardAmount: string; // human-readable amount
    rewardTokenDecimals: number;
}
