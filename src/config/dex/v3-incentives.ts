import { IncentiveKey } from '@/services/dex/v3-staking-types';

// Extended incentive config with UI metadata
export interface IncentiveConfig {
    key: IncentiveKey;
    poolToken0Symbol: string;
    poolToken1Symbol: string;
    poolFee: number;
    rewardTokenSymbol: string;
    rewardTokenDecimals: number;
}

// Known incentive keys — used as fallback when subgraph is unavailable
// Updated as new incentives are created via admin
export const KNOWN_INCENTIVES: IncentiveKey[] = [
    {
        rewardToken: '0x7659567Bc5057e7284856aAF331C4dea22AEd73E', // testnet KSWAP
        pool: '0xb1803e9f09d21221827db2ecdbcc6dc2d64dbde4',        // WKLC/BUSD 0.3%
        startTime: BigInt(1774876620),   // 2026-03-30 08:17 UTC
        endTime: BigInt(1774962720),     // 2026-03-31 08:12 UTC
        refundee: '0xaE51f2EfE70e57b994BE8F7f97C4dC824c51802a',
    },
];

// Full config with metadata for each known incentive
export const KNOWN_INCENTIVE_CONFIGS: IncentiveConfig[] = [
    {
        key: KNOWN_INCENTIVES[0],
        poolToken0Symbol: 'WKLC',
        poolToken1Symbol: 'BUSD',
        poolFee: 3000,
        rewardTokenSymbol: 'KSWAP',
        rewardTokenDecimals: 18,
    },
];

// Common reward tokens
export const REWARD_TOKENS = {
    KSWAP_TESTNET: '0x7659567Bc5057e7284856aAF331C4dea22AEd73E',
    KSWAP_MAINNET: '0xCC93b84cEed74Dc28c746b7697d6fA477ffFf65a',
} as const;
