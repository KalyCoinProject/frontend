import { useState } from 'react';
import { Token } from '@/config/dex/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useV3AddLiquidity } from '@/hooks/v3/useV3AddLiquidity';
import TickRangeSelector from './TickRangeSelector';
import { V3_DEFAULT_FEE_TIER } from '@/config/dex/v3-constants';

interface V3AddLiquidityProps {
    token0: Token;
    token1: Token;
    fee?: number;
    tokenId?: bigint;
    onSuccess?: () => void;
}

export default function V3AddLiquidity({
    token0,
    token1,
    fee = V3_DEFAULT_FEE_TIER,
    tokenId,
    onSuccess
}: V3AddLiquidityProps) {
    const [amount0, setAmount0] = useState('');
    const [amount1, setAmount1] = useState('');
    const [tickLower, setTickLower] = useState<number>(-887220);
    const [tickUpper, setTickUpper] = useState<number>(887220);

    const { addLiquidity, isLoading, error } = useV3AddLiquidity({
        token0,
        token1,
        fee,
        tokenId
    });

    const handleAdd = async () => {
        if (!amount0 || !amount1) return;

        const txHash = await addLiquidity(
            amount0,
            amount1,
            tokenId ? undefined : tickLower,
            tokenId ? undefined : tickUpper
        );

        if (txHash && onSuccess) {
            onSuccess();
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium">Add Liquidity (V3)</h3>

            {/* Amount Inputs */}
            <div className="grid gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">{token0.symbol} Amount</label>
                    <Input
                        placeholder="0.0"
                        value={amount0}
                        onChange={(e: any) => setAmount0(e.target.value)}
                        className="v3-amount0-input"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">{token1.symbol} Amount</label>
                    <Input
                        placeholder="0.0"
                        value={amount1}
                        onChange={(e: any) => setAmount1(e.target.value)}
                        className="v3-amount1-input"
                    />
                </div>
            </div>

            {/* Range Selector (Only for Minting) */}
            {!tokenId && (
                <div className="mt-4 border p-4 rounded-md">
                    <h4 className="text-sm font-medium mb-2">Set Price Range</h4>
                    <p className="text-xs text-gray-500 mb-2">Full range selected by default (Stub)</p>
                    <TickRangeSelector
                        token0={token0}
                        token1={token1}
                        feeTier={fee}
                        currentPrice={null}
                        onRangeChange={(min, max) => {
                            setTickLower(min);
                            setTickUpper(max);
                        }}
                    />
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}

            <Button
                onClick={handleAdd}
                disabled={isLoading || !amount0 || !amount1}
                className="w-full v3-add-liquidity-btn"
            >
                {isLoading ? 'Adding...' : 'Add Liquidity'}
            </Button>
        </div>
    );
}
