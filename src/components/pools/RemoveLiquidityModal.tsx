'use client';

import { poolLogger } from '@/lib/logger';

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ArrowDown, Plus, X } from 'lucide-react';
import { PoolData } from '@/hooks/usePoolDiscovery';
import { usePools } from '@/hooks/usePools';
import { useWallet } from '@/hooks/useWallet';
import { formatUnits, parseUnits } from 'viem';

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

  // Use KLC logo for wKLC tokens
  const getTokenIconPath = (symbol: string) => {
    const lowerSymbol = symbol.toLowerCase();
    if (lowerSymbol === 'wklc') {
      return '/tokens/klc.png';
    }
    return `/tokens/${lowerSymbol}.png`;
  };

  if (imageError) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gray-100 flex items-center justify-center border border-gray-200`}>
        <span className="text-xs font-medium text-gray-600">{token.symbol.slice(0, 2)}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200`}>
      <img
        src={getTokenIconPath(token.symbol)}
        alt={token.symbol}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

interface RemoveLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: PoolData;
}

export default function RemoveLiquidityModal({ isOpen, onClose, pool }: RemoveLiquidityModalProps) {
  const [percentage, setPercentage] = useState(25);
  const [isLoading, setIsLoading] = useState(false);
  const { removeLiquidity, loading, error } = usePools();
  const { isConnected } = useWallet();

  // Calculate amounts based on percentage
  const calculatedAmounts = useMemo(() => {
    if (!pool.userLpBalance || !pool.userToken0Amount || !pool.userToken1Amount) {
      return {
        lpAmount: '0',
        token0Amount: '0',
        token1Amount: '0'
      };
    }

    const lpAmount = (parseFloat(pool.userLpBalance) * percentage / 100).toString();
    const token0Amount = (parseFloat(pool.userToken0Amount) * percentage / 100).toString();
    const token1Amount = (parseFloat(pool.userToken1Amount) * percentage / 100).toString();

    return {
      lpAmount,
      token0Amount,
      token1Amount
    };
  }, [pool, percentage]);

  const handleRemoveLiquidity = async () => {
    if (!isConnected || !pool.userHasPosition) return;

    setIsLoading(true);
    try {
      // Calculate minimum amounts with 0.5% slippage tolerance
      const slippageTolerance = 0.005; // 0.5%
      const amountAMin = (parseFloat(calculatedAmounts.token0Amount) * (1 - slippageTolerance)).toString();
      const amountBMin = (parseFloat(calculatedAmounts.token1Amount) * (1 - slippageTolerance)).toString();

      const result = await removeLiquidity(
        pool.token0.address,
        pool.token1.address,
        calculatedAmounts.lpAmount,
        amountAMin,
        amountBMin,
        pool.token0.decimals || 18,
        pool.token1.decimals || 18
      );

      if (result) {
        poolLogger.debug('✅ Liquidity removed successfully');
        onClose();
      }
    } catch (error) {
      poolLogger.error('❌ Error removing liquidity:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (value: string, decimals: number = 4) => {
    const num = parseFloat(value);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    return num.toFixed(decimals);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md !bg-stone-950 backdrop-blur-md border-white/20">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-white">
            Remove Liquidity
            <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10">
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount Selection */}
          <Card className="!bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Amount</span>
                </div>

                {/* Percentage Display */}
                <div className="text-center">
                  <span className="text-4xl font-bold text-white">{percentage}%</span>
                </div>

                {/* Slider */}
                <div className="px-2">
                  <Slider
                    value={percentage}
                    onChange={setPercentage}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>

                {/* Preset Buttons */}
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-white/20 text-white hover:bg-white/20"
                    onClick={() => setPercentage(25)}
                  >
                    25%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-white/20 text-white hover:bg-white/20"
                    onClick={() => setPercentage(50)}
                  >
                    50%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-white/20 text-white hover:bg-white/20"
                    onClick={() => setPercentage(75)}
                  >
                    75%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-white/20 text-white hover:bg-white/20"
                    onClick={() => setPercentage(100)}
                  >
                    MAX
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow Down */}
          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4 text-blue-400" />
          </div>

          {/* Output Amounts */}
          <Card className="!bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-4">
              <div className="space-y-3">
                {/* Token A */}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-white">
                    {formatNumber(calculatedAmounts.token0Amount)}
                  </span>
                  <div className="flex items-center space-x-2">
                    <TokenIcon token={pool.token0} size="sm" />
                    <span className="font-medium text-white">{pool.token0.symbol}</span>
                  </div>
                </div>

                {/* Plus Icon */}
                <div className="flex justify-center">
                  <Plus className="h-4 w-4 text-amber-400" />
                </div>

                {/* Token B */}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-white">
                    {formatNumber(calculatedAmounts.token1Amount)}
                  </span>
                  <div className="flex items-center space-x-2">
                    <TokenIcon token={pool.token1} size="sm" />
                    <span className="font-medium text-white">{pool.token1.symbol}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Price Information */}
          {pool.reserve0 && pool.reserve1 && (
            <div className="text-xs space-y-1 px-2" style={{ color: '#fef3c7' }}>
              <div className="flex justify-between">
                <span>Price:</span>
                <span>
                  1 {pool.token0.symbol} = {(parseFloat(pool.reserve1) / parseFloat(pool.reserve0)).toFixed(6)} {pool.token1.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span></span>
                <span>
                  1 {pool.token1.symbol} = {(parseFloat(pool.reserve0) / parseFloat(pool.reserve1)).toFixed(6)} {pool.token0.symbol}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/20 p-2 rounded">
              {error}
            </div>
          )}

          {/* Remove Button */}
          <Button
            onClick={handleRemoveLiquidity}
            disabled={!isConnected || !pool.userHasPosition || isLoading || loading || percentage === 0}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading || loading ? 'Removing...' : 'Remove Liquidity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
