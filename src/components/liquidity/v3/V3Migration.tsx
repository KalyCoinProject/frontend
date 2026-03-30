import { useState, useEffect, useMemo } from 'react';
import { Token } from '@/config/dex/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUserPositions } from '@/hooks/useUserPositions';
import { useV3Migration } from '@/hooks/v3/useV3Migration';
import { V3_DEFAULT_FEE_TIER, V3_FEE_TIERS, V3_FEE_TIER_LABELS } from '@/config/dex/v3-constants';
import TickRangeSelector from './TickRangeSelector';
import { formatUnits, getContract } from 'viem';
import { usePublicClient } from 'wagmi';
import { PAIR_ABI } from '@/config/abis';

interface V3MigrationProps {
    // Ideally passed from a parent that knows about V2 pairs, 
    // or we fetch them here if we have a list of all pairs
    v2PairAddress: string;
    token0: Token;
    token1: Token;
    onSuccess?: () => void;
}

export default function V3Migration({
    v2PairAddress,
    token0,
    token1,
    onSuccess
}: V3MigrationProps) {
    // 1. Fetch V2 Position
    const { getPosition, loading: loadingPosition } = useUserPositions([v2PairAddress]);
    const position = getPosition(v2PairAddress);

    // 2. Migration Configuration
    const [fee, setFee] = useState<number>(V3_DEFAULT_FEE_TIER);
    const [percentage, setPercentage] = useState(100);
    const [tickLower, setTickLower] = useState<number>(-887220);
    const [tickUpper, setTickUpper] = useState<number>(887220);

    const [approvalDone, setApprovalDone] = useState(false);
    const [poolExists, setPoolExists] = useState<boolean | null>(null);
    const [startPrice, setStartPrice] = useState<string>('1.0');
    const [isCheckingPool, setIsCheckingPool] = useState(false);

    // Check pool existence
    const publicClient = usePublicClient();
    const {
        approveV2LP,
        migrate,
        checkPoolExists,
        createPool,
        isApproving,
        isMigrating,
        error
    } = useV3Migration({
        token0,
        token1,
        fee
    });

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            setIsCheckingPool(true);
            const exists = await checkPoolExists();

            if (mounted) {
                setPoolExists(exists);

                // If V3 pool doesn't exist, calculate Start Price from V2 Reserves
                if (!exists && v2PairAddress && publicClient) {
                    try {
                        const pairContract = getContract({
                            address: v2PairAddress as `0x${string}`,
                            abi: PAIR_ABI,
                            client: publicClient
                        });

                        const [reserve0Raw, reserve1Raw] = await pairContract.read.getReserves([]) as [bigint, bigint, number];
                        const v2Token0Address = await pairContract.read.token0([]) as string;

                        // Normalize to match component's token0
                        const isDirect = v2Token0Address.toLowerCase() === token0.address.toLowerCase();

                        // Reserves are typically raw bigints. We need to format them with correct decimals.
                        // If direct: reserve0 is token0Amt, reserve1 is token1Amt
                        // If inverted: reserve0 is token1Amt, reserve1 is token0Amt

                        let r0Val = 0;
                        let r1Val = 0;


                        if (isDirect) {
                            r0Val = parseFloat(formatUnits(reserve0Raw, token0.decimals));
                            r1Val = parseFloat(formatUnits(reserve1Raw, token1.decimals));
                        } else {
                            // Reserve0 is actually Token1
                            r0Val = parseFloat(formatUnits(reserve1Raw, token0.decimals)); // reserve1 is Token0
                            r1Val = parseFloat(formatUnits(reserve0Raw, token1.decimals)); // reserve0 is Token1 
                        }

                        // Price = Token1 / Token0
                        if (r0Val > 0) {
                            const p = r1Val / r0Val;
                            setStartPrice(p.toPrecision(6));
                        }

                    } catch (e) {
                        console.error("Failed to auto-calculate price", e);
                    }
                }
                setIsCheckingPool(false);
            }
        };
        check();
        return () => { mounted = false; };
    }, [checkPoolExists, position, fee, token0, token1, v2PairAddress, publicClient]);

    // Derived values
    const liquidityToMigrate = useMemo(() => {
        if (!position) return 0n;
        return (position.lpTokenBalanceRaw * BigInt(percentage)) / 100n;
    }, [position, percentage]);

    const handleApprove = async () => {
        if (!liquidityToMigrate) return;
        const result = await approveV2LP(v2PairAddress, liquidityToMigrate.toString());
        if (result) {
            setApprovalDone(true);
        }
    };

    const handleInitialize = async () => {
        if (!createPool) return;
        const result = await createPool(startPrice);
        if (result) {
            setPoolExists(true);
        }
    }

    const handleMigrate = async () => {
        if (!liquidityToMigrate) return;

        const txHash = await migrate(
            v2PairAddress,
            liquidityToMigrate.toString(),
            percentage,
            tickLower,
            tickUpper,
            '0', // amount0Min - slippage calculation omitted for MVP
            '0', // amount1Min
            20 // deadline
        );

        if (txHash && onSuccess) {
            onSuccess();
        }
    };

    if (loadingPosition) {
        return <div className="p-4 text-center">Loading V2 Position...</div>;
    }

    if (!position || !position.hasPosition) {
        return (
            <Card className="p-6 text-center text-gray-500">
                No liquidity found in this V2 pool.
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-blue-900 mb-2">Migrate V2 Liquidity</h3>
                <div className="flex justify-between text-sm text-blue-800">
                    <span>V2 Balance:</span>
                    <span>{position.lpTokenBalance} LP</span>
                </div>
                <div className="flex justify-between text-sm text-blue-800 mt-1">
                    <span>Est. {token0.symbol}:</span>
                    <span>{position.token0Amount}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-800">
                    <span>Est. {token1.symbol}:</span>
                    <span>{position.token1Amount}</span>
                </div>
            </div>

            {/* Configuration */}
            <div className="space-y-4">
                {/* Fee Tier Selection */}
                <div>
                    <label className="text-sm font-medium mb-2 block">V3 Fee Tier</label>
                    <div className="grid grid-cols-4 gap-2">
                        {Object.values(V3_FEE_TIERS).map((tier) => (
                            <button
                                key={tier}
                                onClick={() => setFee(tier)}
                                className={`p-2 text-sm rounded border ${fee === tier
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {V3_FEE_TIER_LABELS[tier]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Percentage Slider */}
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium">Amount to Migrate</label>
                        <span className="text-sm font-bold">{percentage}%</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={percentage}
                        onChange={(e) => setPercentage(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                {/* Price Range */}
                <div className="border p-4 rounded-md">
                    <h4 className="text-sm font-medium mb-2">Set Price Range</h4>
                    <p className="text-xs text-gray-500 mb-2">Select the price range for your V3 position.</p>
                    <TickRangeSelector
                        token0={token0}
                        token1={token1}
                        feeTier={fee}
                        currentPrice={null} // TODO: Pass real price
                        onRangeChange={(min, max) => {
                            setTickLower(min);
                            setTickUpper(max);
                        }}
                    />
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}

            {/* Hidden auto-init message (optional, or just show nothing) */}
            {poolExists === false && !isCheckingPool && (
                <div className="text-sm text-gray-500 italic mb-2">
                    * New V3 Pool will be initialized at {startPrice} {token1.symbol} per {token0.symbol}
                </div>
            )}

            <div className="flex gap-4">
                <Button
                    onClick={handleApprove}
                    disabled={isApproving || approvalDone || isMigrating}
                    className="flex-1"
                    variant={approvalDone ? "outline" : "default"}
                >
                    {isApproving ? 'Approving...' : approvalDone ? 'Approved' : 'Approve V2 LP'}
                </Button>

                {poolExists === false ? (
                    <Button
                        onClick={handleInitialize}
                        disabled={isMigrating || isCheckingPool}
                        className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                        {isMigrating ? 'Initializing...' : 'Initialize Pool'}
                    </Button>
                ) : (
                    <Button
                        onClick={handleMigrate}
                        disabled={!approvalDone || isMigrating || !poolExists}
                        className="flex-1"
                    >
                        {isMigrating ? 'Migrating...' : 'Migrate to V3'}
                    </Button>
                )}
            </div>
        </div>
    );
}
