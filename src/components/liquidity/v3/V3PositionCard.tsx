'use client';

import { useState, useEffect } from 'react';
import { V3Position } from '@/services/dex/IV3DexService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUnits } from 'viem';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useAccount, usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { Wallet } from 'lucide-react';
import V3ManageModal from './V3ManageModal';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';

interface TokenIconProps {
    token: {
        symbol: string;
        address: string;
    };
    size?: 'sm' | 'md' | 'lg';
}

function TokenIcon({ token, size = 'md' }: TokenIconProps) {
    const [imageError, setImageError] = useState(false);

    const sizeClasses = {
        sm: 'w-6 h-6',
        md: 'w-8 h-8',
        lg: 'w-10 h-10'
    };

    if (imageError) {
        return (
            <div className={`${sizeClasses[size]} rounded-full bg-gray-100 flex items-center justify-center border border-gray-200`}>
                <span className="text-xs font-medium text-gray-600">{token.symbol.slice(0, 2)}</span>
            </div>
        );
    }

    // Use KLC logo for wKLC tokens
    const getTokenIconPath = (symbol: string) => {
        const lowerSymbol = symbol.toLowerCase();
        if (lowerSymbol === 'wklc') {
            return '/tokens/klc.png';
        }
        return `/tokens/${lowerSymbol}.png`;
    };

    return (
        <div className={`${sizeClasses[size]} rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-600`}>
            <img
                src={getTokenIconPath(token.symbol)}
                alt={token.symbol}
                className="w-full h-full object-cover token-icon"
                onError={() => setImageError(true)}
            />
        </div>
    );
}

interface V3PositionCardProps {
    position: V3Position;
    onUpdate?: () => void;
}

export default function V3PositionCard({ position, onUpdate }: V3PositionCardProps) {
    const { chainId } = useAccount();
    const publicClient = usePublicClient();
    const { tokens } = useTokenLists({ chainId: chainId || CHAIN_IDS.KALYCHAIN });

    const [isManageOpen, setIsManageOpen] = useState(false);
    const [initialTab, setInitialTab] = useState<'remove' | 'collect'>('remove');

    // Resolve token details
    const token0 = tokens.find(t => t.address.toLowerCase() === position.token0.toLowerCase()) || {
        symbol: '???',
        address: position.token0,
        decimals: 18
    };
    const token1 = tokens.find(t => t.address.toLowerCase() === position.token1.toLowerCase()) || {
        symbol: '???',
        address: position.token1,
        decimals: 18
    };

    const feePercent = (position.fee / 10000).toFixed(2);

    // Fetch current pool tick to determine if position is in range
    const [currentTick, setCurrentTick] = useState<number | null>(null);
    useEffect(() => {
        if (!publicClient || !chainId || position.liquidity === 0n) return;
        const fetchTick = async () => {
            try {
                const service = getKalySwapV3Service(chainId);
                if (!service) return;
                const poolInfo = await service.getV3PoolInfo(
                    { address: position.token0, decimals: 18, symbol: '', name: '', chainId, logoURI: '' },
                    { address: position.token1, decimals: 18, symbol: '', name: '', chainId, logoURI: '' },
                    position.fee,
                    publicClient
                );
                if (poolInfo) setCurrentTick(poolInfo.tick);
            } catch {
                // If pool fetch fails, leave as null (unknown)
            }
        };
        fetchTick();
    }, [position.token0, position.token1, position.fee, chainId, publicClient, position.liquidity]);

    const isInRange = currentTick !== null
        ? currentTick >= position.tickLower && currentTick < position.tickUpper
        : position.liquidity > 0n; // Assume in-range if tick unknown but has liquidity

    const handleOpenManage = (tab: 'remove' | 'collect') => {
        setInitialTab(tab);
        setIsManageOpen(true);
    };

    return (
        <>
            <Card className="pool-card user-position">
                <CardContent className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            {/* Token Icons */}
                            <div className="flex items-center -space-x-2">
                                <TokenIcon token={token0} size="md" />
                                <TokenIcon token={token1} size="md" />
                            </div>

                            {/* Pool Name */}
                            <div>
                                <div className="flex items-center space-x-2">
                                    <h3 className="font-semibold text-lg text-white">
                                        {token0.symbol}/{token1.symbol}
                                    </h3>
                                    <Badge variant="default" className="text-xs bg-blue-600 text-white">
                                        {feePercent}%
                                    </Badge>
                                    <Badge variant="outline" className={`text-xs ${isInRange ? 'text-green-400 border-green-400' : 'text-red-400 border-red-400'}`}>
                                        {isInRange ? 'In Range' : 'Out of Range'}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-300">
                                    ID: {position.tokenId.toString()}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Position Info */}
                    <div className="pool-info-card p-3 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <Wallet className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium text-white">Liquidity</span>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-semibold text-white">
                                    {position.liquidity.toString()}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Unclaimed Fees */}
                    <div className="space-y-2 mb-4">
                        <h4 className="text-sm font-medium text-white mb-2">Claimable Tokens</h4>
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center space-x-2">
                                <span className="text-gray-300">{token0.symbol}</span>
                            </div>
                            <span className="text-green-400 font-mono">
                                {formatUnits(position.tokensOwed0, token0.decimals || 18)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center space-x-2">
                                <span className="text-gray-300">{token1.symbol}</span>
                            </div>
                            <span className="text-green-400 font-mono">
                                {formatUnits(position.tokensOwed1, token1.decimals || 18)}
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-4 border-t border-gray-600">
                        <div className="flex space-x-2">
                            <Button
                                className="flex-1 bg-gray-900/30 text-blue-400 hover:bg-blue-900/30 border-blue-500/30"
                                size="sm"
                                onClick={() => handleOpenManage('collect')}
                            >
                                Collect
                            </Button>
                            <Button
                                className="flex-1 continue-button"
                                size="sm"
                                onClick={() => handleOpenManage('remove')}
                            >
                                Manage
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <V3ManageModal
                isOpen={isManageOpen}
                onClose={() => setIsManageOpen(false)}
                position={position}
                onUpdate={() => {
                    // call parent update
                    if (onUpdate) onUpdate();
                }}
                initialTab={initialTab}
            />
        </>
    );
}
