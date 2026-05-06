'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePools } from '@/hooks/usePools';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/toast';
import { useProtocolVersion } from '@/contexts/ProtocolVersionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getKalyChainTokenByAddress } from '@/config/dex/tokens/kalychain';
import { Token } from '@/config/dex/types';
import V3Migration from '@/components/liquidity/v3/V3Migration';
import { formatUnits } from 'viem';
import { ConnectWalletButton } from '@/components/wallet/ConnectWallet';
import MainLayout from '@/components/layout/MainLayout';

// Temporary type for positions from userPools hook
interface V2Position {
    id: string; // pairAddress-userAddress or similar
    liquidityTokenBalance: string;
    pair: {
        id: string;
        token0: { id: string; symbol: string; decimals?: number };
        token1: { id: string; symbol: string; decimals?: number };
        totalSupply: string;
        reserve0: string;
        reserve1: string;
    };
}

export default function MigrateWithFallback() {
    const { getUserPools } = usePools();
    const { address, isConnected } = useAccount();
    const [rawPositions, setRawPositions] = useState<V2Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<V2Position | null>(null);
    // Pair addresses the user just migrated in this session. The subgraph
    // lags the chain by several seconds so `getUserPools` can still return
    // the (now-zero) position right after a successful migration. Hide it
    // client-side so the user doesn't see their already-migrated pair as if
    // it still needs action.
    const [recentlyMigrated, setRecentlyMigrated] = useState<Set<string>>(() => new Set());
    const router = useRouter();
    const toast = useToast();
    const { setProtocolVersion } = useProtocolVersion();

    // Drop any position whose LP balance is now 0 or that was migrated in
    // this session but hasn't cleared from the subgraph yet.
    const positions = useMemo(
        () =>
            rawPositions.filter((p) => {
                if (recentlyMigrated.has(p.pair.id.toLowerCase())) return false;
                const bal = parseFloat(p.liquidityTokenBalance || '0');
                return Number.isFinite(bal) && bal > 0;
            }),
        [rawPositions, recentlyMigrated],
    );

    useEffect(() => {
        if (isConnected && address) {
            setLoading(true);
            getUserPools(address)
                .then((data: any) => {
                    setRawPositions(data);
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [isConnected, address, getUserPools]);

    const handleSuccess = () => {
        // Remember the migrated pair so we hide it immediately, even if the
        // subgraph hasn't caught up yet.
        const justMigrated = selectedPosition?.pair?.id?.toLowerCase();
        if (justMigrated) {
            setRecentlyMigrated((prev) => {
                const next = new Set(prev);
                next.add(justMigrated);
                return next;
            });
        }
        toast.success(
            'Migration complete',
            'Your V2 liquidity is now a V3 position. Redirecting to your V3 positions…',
        );
        // Switch the pools view to V3 so the user lands on the page showing
        // their newly-minted V3 NFT position, not the V2 list.
        setProtocolVersion('v3');
        setSelectedPosition(null);
        // Brief pause so the toast is visible before we navigate.
        setTimeout(() => router.push('/pools/browse'), 900);
    };

    // Helper to construct Token objects for V3Migration
    const getTokenObject = (t: { id: string; symbol: string }): Token => {
        const known = getKalyChainTokenByAddress(t.id);
        if (known) return known;

        return {
            chainId: 1, // Fallback
            address: t.id,
            decimals: 18, // Fallback
            name: t.symbol,
            symbol: t.symbol,
            logoURI: '',
        };
    };

    // Memoize tokens to prevent infinite loops in V3Migration hook dependencies.
    // IMPORTANT: these useMemo calls MUST run before the early `!isConnected`
    // return below. Hooks cannot be called conditionally — when wagmi transitions
    // from disconnected → connected mid-session (e.g., after the Thirdweb→wagmi
    // bridge retries a failed initial sync), the next render would otherwise
    // invoke more hooks than the previous one and crash React.
    const selectedToken0 = useMemo(() => {
        if (!selectedPosition) return null;
        return getTokenObject(selectedPosition.pair.token0);
    }, [selectedPosition]);

    const selectedToken1 = useMemo(() => {
        if (!selectedPosition) return null;
        return getTokenObject(selectedPosition.pair.token1);
    }, [selectedPosition]);

    if (!isConnected) {
        return (
            <MainLayout>
                <div className="min-h-screen py-8 pools-container">
                    <div className="max-w-2xl mx-auto px-4">
                        <div className="mb-8">
                            <h1 className="text-2xl font-bold text-white">Migrate Liquidity</h1>
                            <p className="text-gray-300">Connect your wallet to start migrating</p>
                        </div>
                        <Card className="pools-card border-gray-800 bg-gray-900/50 text-white p-12 text-center">
                            <h2 className="text-xl font-bold mb-4 text-white">Wallet Not Connected</h2>
                            <p className="text-gray-400 mb-8">Please connect your wallet to view your V2 positions.</p>
                            <div className="flex justify-center">
                                <ConnectWalletButton />
                            </div>
                        </Card>
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen py-8 pools-container">
                <div className="max-w-2xl mx-auto px-4">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-4 mb-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.history.back()}
                                className="p-2 text-white hover:bg-gray-800/50"
                            >
                                ←
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Migrate Liquidity</h1>
                                <p className="text-gray-300">Move your V2 position to V3 active liquidity</p>
                            </div>
                        </div>
                        {/* Breadcrumb */}
                        <div className="text-sm text-gray-400 ml-12">
                            <span>Pools</span>
                            <span className="mx-2">/</span>
                            <span className="text-white">Migrate</span>
                        </div>
                    </div>

                    {!selectedPosition ? (
                        /* List View */
                        <Card className="pools-card border-gray-800 bg-gray-900/50 text-white">
                            <CardContent className="p-6 space-y-4">
                                <p className="text-gray-300 mb-4">
                                    Select a V2 position to migrate to V3 concentrated liquidity.
                                </p>

                                {loading ? (
                                    <div className="text-center py-8 text-blue-400">Scanning for V2 positions...</div>
                                ) : positions.length === 0 ? (
                                    <div className="text-center py-12 border border-dashed border-gray-700 rounded-lg">
                                        <p className="text-gray-400 mb-2">No V2 liquidity positions found.</p>
                                        <p className="text-sm text-gray-500">
                                            (Used fallback discovery for testnet pairs)
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-4 border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700"
                                            onClick={() => {
                                                setLoading(true);
                                                if (address) {
                                                    getUserPools(address).then((data: any) => setRawPositions(data)).finally(() => setLoading(false));
                                                }
                                            }}
                                        >
                                            Refresh
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid gap-4">
                                        {positions.map((pos) => {
                                            const t0 = pos.pair.token0.symbol;
                                            const t1 = pos.pair.token1.symbol;
                                            return (
                                                <div
                                                    key={pos.id}
                                                    className="p-4 rounded-lg bg-gray-800 border border-gray-700 hover:border-blue-500 cursor-pointer transition-colors flex justify-between items-center"
                                                    onClick={() => setSelectedPosition(pos)}
                                                >
                                                    <div>
                                                        <h3 className="font-bold text-lg text-white">{t0} / {t1}</h3>
                                                        <p className="text-sm text-gray-400">
                                                            Balance: {parseFloat(pos.liquidityTokenBalance).toFixed(6)} LP
                                                        </p>
                                                    </div>
                                                    <Button variant="secondary" size="sm">Select</Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        /* Detail View */
                        <div>
                            <Button
                                variant="ghost"
                                className="mb-4 pl-0 text-gray-400 hover:text-white hover:bg-transparent"
                                onClick={() => setSelectedPosition(null)}
                            >
                                ← Back to Positions
                            </Button>

                            <Card className="pools-card border-gray-800 bg-gray-900/50 text-white p-6">
                                <V3Migration
                                    v2PairAddress={selectedPosition.pair.id}
                                    token0={selectedToken0!}
                                    token1={selectedToken1!}
                                    onSuccess={handleSuccess}
                                />
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
