'use client';

import { poolLogger } from '@/lib/logger';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Plus, Info, Wallet } from 'lucide-react';
import { usePools } from '@/hooks/usePools';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useTokenBalances } from '@/hooks/useTokenBalance';
import { formatUnits } from 'viem';
import { Token } from '@/config/dex/types';
import { calculateBothPrices } from '@/utils/price';
import { useProtocolVersion } from '@/contexts/ProtocolVersionContext';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { V3_DEFAULT_FEE_TIER, MIN_TICK, MAX_TICK, getTickSpacing } from '@/config/dex/v3-constants';
import { CHAIN_IDS } from '@/config/chains';
import { calculateSqrtPriceX96, sqrt } from '@/utils/v3-math';
import TickRangeSelector from '@/components/liquidity/v3/TickRangeSelector';

interface LiquidityFormProps {
  tokenA: Token;
  tokenB: Token;
  amountA: string;
  amountB: string;
  onAmountAChange: (amount: string) => void;
  onAmountBChange: (amount: string) => void;
  onBack: () => void;
}

export default function LiquidityForm({
  tokenA,
  tokenB,
  amountA,
  amountB,
  onAmountAChange,
  onAmountBChange,
  onBack
}: LiquidityFormProps) {
  // Wallet connection
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isV3 } = useProtocolVersion();

  // Token balances
  const tokens = [tokenA, tokenB];
  const { balances, getFormattedBalance, isLoading: balancesLoading } = useTokenBalances(tokens);

  const [isLoading, setIsLoading] = useState(false);
  const {
    getPairInfo,
    calculateOptimalAmounts,
    addLiquidity,
    createPair,
    loading: poolsLoading,
    error: poolsError,
    approveToken,
    ApprovalState
  } = usePools();

  const [pairExists, setPairExists] = useState<boolean | null>(null);
  const [marketPrice, setMarketPrice] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [userLPBalance, setUserLPBalance] = useState<string>('0');
  const [pairAddress, setPairAddress] = useState<string>('');

  // Simple approval state management
  const [approvalA, setApprovalA] = useState<typeof ApprovalState[keyof typeof ApprovalState]>(ApprovalState.NOT_APPROVED);
  const [approvalB, setApprovalB] = useState<typeof ApprovalState[keyof typeof ApprovalState]>(ApprovalState.NOT_APPROVED);

  // V3 State
  const [tickLower, setTickLower] = useState<number>(Math.ceil(MIN_TICK / getTickSpacing(V3_DEFAULT_FEE_TIER)) * getTickSpacing(V3_DEFAULT_FEE_TIER));
  const [tickUpper, setTickUpper] = useState<number>(Math.floor(MAX_TICK / getTickSpacing(V3_DEFAULT_FEE_TIER)) * getTickSpacing(V3_DEFAULT_FEE_TIER));

  // Determine token0/token1 order for V3 components
  const isToken0A = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const token0 = isToken0A ? tokenA : tokenB;
  const token1 = isToken0A ? tokenB : tokenA;

  // Use refs to store callback functions to prevent dependency issues
  const onAmountBChangeRef = useRef(onAmountBChange);
  const getPairInfoRef = useRef(getPairInfo);
  const calculateOptimalAmountsRef = useRef(calculateOptimalAmounts);

  // Update refs when props change
  useEffect(() => {
    onAmountBChangeRef.current = onAmountBChange;
    getPairInfoRef.current = getPairInfo;
    calculateOptimalAmountsRef.current = calculateOptimalAmounts;
  });

  // Check approval states when tokens change
  useEffect(() => {
    const checkApprovals = async () => {
      // Default to approved if native token
      let approvedA = tokenA.address === '0x0000000000000000000000000000000000000000';
      let approvedB = tokenB.address === '0x0000000000000000000000000000000000000000';

      if (isConnected && address && publicClient) {
        try {
          if (isV3) {
            const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
            if (!v3Service) return;
            if (!approvedA) {
              approvedA = await v3Service.checkApproval(tokenA, address, amountA || '0', publicClient);
            }
            if (!approvedB) {
              approvedB = await v3Service.checkApproval(tokenB, address, amountB || '0', publicClient);
            }
          }
          // For V2, we rely on the button click logic or we could add a check here too. 
          // But existing code just resets to NOT_APPROVED. 
          // Let's keep V2 behavior simple: reset to not approved unless native.
        } catch (e) {
          poolLogger.error('Error checking approvals', e);
        }
      }

      setApprovalA(approvedA ? ApprovalState.APPROVED : ApprovalState.NOT_APPROVED);
      setApprovalB(approvedB ? ApprovalState.APPROVED : ApprovalState.NOT_APPROVED);
    };

    checkApprovals();
  }, [tokenA.address, tokenB.address, isV3, isConnected, address, amountA, amountB, chainId, publicClient]);

  // Simple approval callbacks
  const approveACallback = async () => {
    if (tokenA.address === '0x0000000000000000000000000000000000000000') return;

    try {
      setApprovalA(ApprovalState.PENDING);

      if (isV3) {
        const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
        if (!v3Service) throw new Error('V3 not available on this chain');
        if (!walletClient) throw new Error('Wallet not connected');
        // Approve amountA or max uint256
        const amountToApprove = amountA && parseFloat(amountA) > 0 ? amountA : '115792089237316195423570985008687907853269984665640564039457';
        await v3Service.approveToken(tokenA, amountToApprove, walletClient);
      } else {
        await approveToken(tokenA.address);
      }

      setApprovalA(ApprovalState.APPROVED);
    } catch (err) {
      setApprovalA(ApprovalState.NOT_APPROVED);
      poolLogger.error('Error approving token A:', err);
    }
  };

  const approveBCallback = async () => {
    if (tokenB.address === '0x0000000000000000000000000000000000000000') return;

    try {
      setApprovalB(ApprovalState.PENDING);

      if (isV3) {
        const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
        if (!v3Service) throw new Error('V3 not available on this chain');
        if (!walletClient) throw new Error('Wallet not connected');
        // Approve amountB or max uint256
        const amountToApprove = amountB && parseFloat(amountB) > 0 ? amountB : '115792089237316195423570985008687907853269984665640564039457';
        await v3Service.approveToken(tokenB, amountToApprove, walletClient);
      } else {
        await approveToken(tokenB.address);
      }

      setApprovalB(ApprovalState.APPROVED);
    } catch (err) {
      setApprovalB(ApprovalState.NOT_APPROVED);
      poolLogger.error('Error approving token B:', err);
    }
  };

  // Check if pair exists and get market price
  useEffect(() => {
    const checkPair = async () => {
      if (tokenA && tokenB) {
        try {
          // V3 Logic
          if (isV3) {
            const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
            if (!v3Service || !publicClient) return;

            // Check if V3 pool exists
            const poolInfo = await v3Service.getV3PoolInfo(tokenA, tokenB, V3_DEFAULT_FEE_TIER, publicClient);
            const exists = !!poolInfo;
            setPairExists(exists);
            setPairAddress(poolInfo?.poolAddress || '');

            if (poolInfo) {
              // Determine price based on token order
              const isToken0 = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
              const price = isToken0 ? poolInfo.token1Price : poolInfo.token0Price;
              setMarketPrice(parseFloat(price).toFixed(6));
            } else {
              setMarketPrice(null);
            }
            return;
          }

          // V2 Logic
          const pairInfo = await getPairInfoRef.current(tokenA.address, tokenB.address);
          // Check the exists property, not just if pairInfo is truthy
          const exists = pairInfo?.exists || false;
          setPairExists(exists);
          setPairAddress(pairInfo?.address || '');

          poolLogger.debug(`Pair check for ${tokenA.symbol}/${tokenB.symbol}:`, {
            exists,
            pairAddress: pairInfo?.address,
            reserve0: pairInfo?.reserve0,
            reserve1: pairInfo?.reserve1
          });

          if (pairInfo && pairInfo.exists && pairInfo.reserve0 && pairInfo.reserve1) {
            // Use centralized price calculation - token0Price = how much token1 per token0
            // Note: pairInfo.token0/token1 are addresses (strings), not objects
            const prices = calculateBothPrices({
              token0: { id: pairInfo.token0 || tokenA.address },
              token1: { id: pairInfo.token1 || tokenB.address },
              reserve0: pairInfo.reserve0,
              reserve1: pairInfo.reserve1,
            });
            if (prices.token0Price > 0) {
              setMarketPrice(prices.token0Price.toFixed(6));
            }
          } else {
            setMarketPrice(null);
          }
        } catch (error) {
          poolLogger.error('Error checking pair:', error);
          setPairExists(false);
          setMarketPrice(null);
          setPairAddress('');
        }
      }
    };

    checkPair();
  }, [tokenA.address, tokenB.address, isV3, isConnected, chainId, publicClient]);

  useEffect(() => {
    const checkUserPosition = async () => {
      if (!address || (!pairAddress && !isV3) || (!pairExists && !isV3)) {
        setUserLPBalance('0');
        return;
      }

      try {
        if (!publicClient) return;

        // V3 Logic
        if (isV3) {
          const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
          if (!v3Service) return;
          // Get all positions
          const positions = await v3Service.getV3Positions(address!, publicClient);
          // Filter for current pair
          const pairPositions = positions.filter(p =>
            (p.token0.toLowerCase() === tokenA.address.toLowerCase() && p.token1.toLowerCase() === tokenB.address.toLowerCase()) ||
            (p.token0.toLowerCase() === tokenB.address.toLowerCase() && p.token1.toLowerCase() === tokenA.address.toLowerCase())
          );
          // Sum liquidity
          const totalLiquidity = pairPositions.reduce((acc, pos) => acc + pos.liquidity, 0n);
          setUserLPBalance(totalLiquidity.toString());
          return;
        }

        // V2 Logic
        // Get user's LP token balance from the pair contract
        const lpBalance = await publicClient.readContract({
          address: pairAddress as `0x${string}`,
          abi: [
            {
              "constant": true,
              "inputs": [{ "name": "_owner", "type": "address" }],
              "name": "balanceOf",
              "outputs": [{ "name": "balance", "type": "uint256" }],
              "type": "function"
            }
          ],
          functionName: 'balanceOf',
          args: [address!]
        });

        const formattedBalance = formatUnits(lpBalance as bigint, 18);
        setUserLPBalance(formattedBalance);

        poolLogger.debug(`User LP balance for ${tokenA.symbol}/${tokenB.symbol}:`, formattedBalance);
      } catch (error) {
        poolLogger.error('Error fetching user LP balance:', error);
        setUserLPBalance('0');
      }
    };

    checkUserPosition();
  }, [address, pairAddress, pairExists, tokenA.symbol, tokenB.symbol, isV3, isConnected, chainId, publicClient]);

  // Calculate optimal amounts when one amount changes (only for existing pools)
  useEffect(() => {
    const calculateAmounts = async () => {
      // Only calculate for existing pools, not new pools
      if (pairExists !== true || !amountA || isCalculating) return;

      setIsCalculating(true);
      try {
        // V3 Logic
        if (isV3) {
          const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
          if (!v3Service) return;
          if (publicClient) {
            const { amountB: calculatedAmountB } = await v3Service.calculateOptimalLiquidityAmounts(
              tokenA, tokenB, amountA, publicClient
            );

            if (calculatedAmountB && calculatedAmountB !== amountB) {
              onAmountBChangeRef.current(calculatedAmountB);
            }
          }
          return;
        }

        // V2 Logic
        const optimalAmounts = await calculateOptimalAmountsRef.current(
          tokenA.address,
          tokenB.address,
          amountA,
          'A'
        );

        if (optimalAmounts && optimalAmounts.amountB !== amountB) {
          onAmountBChangeRef.current(optimalAmounts.amountB);
        }
      } catch (error) {
        poolLogger.error('Error calculating optimal amounts:', error);
      } finally {
        setIsCalculating(false);
      }
    };

    calculateAmounts();
  }, [amountA, pairExists, tokenA.address, tokenB.address, amountB, isCalculating, isV3, isConnected, chainId, publicClient]);



  const handleAmountAChange = (value: string) => {
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      onAmountAChange(value);
    }
  };

  const handleAmountBChange = (value: string) => {
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      onAmountBChange(value);
    }
  };

  const handleAddLiquidity = async () => {
    if (!isConnected || !amountA || !amountB) return;

    setIsLoading(true);
    try {
      if (isV3) {
        // V3 Logic
        const v3Service = getKalySwapV3Service(isConnected ? chainId : undefined);
        if (!v3Service) throw new Error('V3 not available on this chain');

        if (!walletClient) throw new Error('Wallet not connected');

        // Use standard fee tier for now (0.3%)
        const fee = V3_DEFAULT_FEE_TIER;

        // Calculate full range ticks aligned to spacing
        // Use user selected ticks (or defaults)
        const minTick = tickLower;
        const maxTick = tickUpper;

        // Mint position (create pool if needed is handled by createAndInitializePoolIfNecessary logic or separate step)
        // For now, we assume pool exists or we are creating it.
        // BaseV3Service.mintV3Position handles minting.
        // But if pool doesn't exist, we might need to initialize it first.
        // The V2 form combines create + add. V3 usually separates them.

        // Check if pool exists first
        let poolAddress = await v3Service.getV3PoolAddress(tokenA, tokenB, fee, publicClient!);

        if (!poolAddress) {
          // Initialize pool first if it doesn't exist
          poolLogger.info('V3 Pool does not exist, initializing...');

          try {
            const sqrtPriceX96 = calculateSqrtPriceX96(
              amountA,
              amountB,
              tokenA.address,
              tokenB.address,
              tokenA.decimals,
              tokenB.decimals
            );

            const poolCreationTx = await v3Service.createAndInitializePool(
              tokenA,
              tokenB,
              fee,
              sqrtPriceX96,
              walletClient
            );

            poolLogger.info('V3 Pool initialized', poolCreationTx);

            // Wait for pool creation to be mined/indexed?
            // Ideally we wait, but verifying via RPC might be enough.
            // For now, let's assume it works and proceed to mint (which might fail if tx pending).
            // A delay or polling would be better.
            await publicClient!.waitForTransactionReceipt({ hash: poolCreationTx as `0x${string}` });

            // Refresh pool address
            poolAddress = await v3Service.getV3PoolAddress(tokenA, tokenB, fee, publicClient!);
          } catch (initError) {
            poolLogger.error('Failed to initialize V3 pool', initError);
            throw initError;
          }
        }

        // Apply slippage tolerance (0.5% default) to minimum amounts
        const SLIPPAGE_TOLERANCE = 0.005;
        const amount0Min = (parseFloat(amountA) * (1 - SLIPPAGE_TOLERANCE)).toString();
        const amount1Min = (parseFloat(amountB) * (1 - SLIPPAGE_TOLERANCE)).toString();

        const { txHash } = await v3Service.mintV3Position({
          token0: tokenA,
          token1: tokenB,
          fee,
          tickLower: minTick,
          tickUpper: maxTick,
          amount0Desired: amountA,
          amount1Desired: amountB,
          amount0Min,
          amount1Min,
          recipient: address!,
          deadline: 20, // 20 minutes
        }, publicClient!, walletClient);

        if (txHash) {
          onAmountAChange('');
          onAmountBChange('');
          poolLogger.debug('✅ V3 Liquidity minted successfully', txHash);
        }

      } else {
        // V2 Logic
        let result: boolean;

        if (pairExists) {
          result = await addLiquidity(
            tokenA.address,
            tokenB.address,
            amountA,
            amountB,
            tokenA.decimals,
            tokenB.decimals
          );
        } else {
          result = await createPair(
            tokenA.address,
            tokenB.address,
            amountA,
            amountB,
            tokenA.decimals,
            tokenB.decimals
          );
        }

        if (result) {
          // Reset form on success
          onAmountAChange('');
          onAmountBChange('');
          poolLogger.debug('✅ Liquidity operation completed successfully');
        }
      }
    } catch (error) {
      poolLogger.error('❌ Error in liquidity operation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const TokenIcon = ({ token }: { token: Token }) => {
    const [imageError, setImageError] = useState(false);

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
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold">
          {token.symbol.charAt(0)}
        </div>
      );
    }

    return (
      <img
        src={getTokenIconPath(token.symbol)}
        alt={token.symbol}
        className="w-8 h-8 rounded-full"
        onError={() => setImageError(true)}
      />
    );
  };

  // Check if form is valid (like old UI)
  const isValid = isConnected && amountA && amountB && !isLoading;

  // Check if we can add liquidity (all approvals complete)
  const canAddLiquidity = isValid &&
    approvalA === ApprovalState.APPROVED &&
    approvalB === ApprovalState.APPROVED;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="p-0 h-auto text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to token selection
      </Button>

      {/* Selected Pair Display */}
      <div className="flex items-center justify-center space-x-2">
        <div className="flex items-center space-x-2">
          <div className="flex items-center">
            <TokenIcon token={tokenA} />
          </div>
          <span className="font-medium">{tokenA.symbol}</span>
        </div>
        <div className="text-amber-400 bg-amber-500/20 rounded-full p-1">
          <Plus className="h-4 w-4" />
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center">
            <TokenIcon token={tokenB} />
          </div>
          <span className="font-medium">{tokenB.symbol}</span>
        </div>
        <div className="text-xs bg-amber-500/20 text-amber-200 px-2 py-1 rounded border border-amber-500/30">0.3%</div>
      </div>

      {/* V3 Tick Range Selector */}
      {isV3 && (
        <TickRangeSelector
          token0={token0}
          token1={token1}
          feeTier={V3_DEFAULT_FEE_TIER}
          currentPrice={marketPrice}
          onRangeChange={(min, max) => {
            setTickLower(min);
            setTickUpper(max);
          }}
        />
      )}

      {/* Market Price */}
      {marketPrice && (
        <div className="text-center text-sm text-gray-600">
          Market price: {marketPrice} {tokenB.symbol} per {tokenA.symbol}
        </div>
      )}

      {/* User Position Display (following Old_KalySwapUI pattern) */}
      {pairExists && parseFloat(userLPBalance) > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-blue-900 mb-1">Your Position</h4>
              <p className="text-sm text-blue-800">
                You have {parseFloat(userLPBalance).toFixed(6)} LP tokens in this pool.
                You can add more liquidity to your existing position.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Amounts */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Deposit tokens</h3>
        <p className="text-sm text-gray-600 mb-6">
          Specify the token amounts for your liquidity contribution.
        </p>

        <div className="space-y-4">
          {/* Token A Input */}
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Amount</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {balancesLoading ? (
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </span>
                  ) : (
                    <>
                      <span>Balance: {getFormattedBalance(tokenA.symbol)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const balance = getFormattedBalance(tokenA.symbol);
                          handleAmountAChange(balance);
                        }}
                        className="h-6 px-2 text-xs font-medium text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        MAX
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Input
                  type="text"
                  placeholder="0"
                  value={amountA}
                  onChange={(e) => handleAmountAChange(e.target.value)}
                  className="border-0 text-2xl font-medium p-0 h-auto focus-visible:ring-0"
                />
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="flex items-center">
                    <TokenIcon token={tokenA} />
                  </div>
                  <span className="font-medium">{tokenA.symbol}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plus Icon */}
          <div className="flex justify-center">
            <div className="w-8 h-8 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center">
              <Plus className="h-4 w-4 text-amber-400" />
            </div>
          </div>

          {/* Token B Input */}
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Amount</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {balancesLoading ? (
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </span>
                  ) : (
                    <>
                      <span>Balance: {getFormattedBalance(tokenB.symbol)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const balance = getFormattedBalance(tokenB.symbol);
                          handleAmountBChange(balance);
                        }}
                        className="h-6 px-2 text-xs font-medium text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        MAX
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Input
                  type="text"
                  placeholder="0"
                  value={amountB}
                  onChange={(e) => handleAmountBChange(e.target.value)}
                  className="border-0 text-2xl font-medium p-0 h-auto focus-visible:ring-0"
                  disabled={pairExists === true && isCalculating}
                />
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="flex items-center">
                    <TokenIcon token={tokenB} />
                  </div>
                  <span className="font-medium">{tokenB.symbol}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pool Status Info */}
      {pairExists === false && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-900 mb-1">New pool</h4>
              <p className="text-sm text-yellow-800">
                This pool doesn't exist yet. You'll be the first liquidity provider and set the initial price ratio.
                Enter any amounts for both tokens to establish the starting price.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {poolsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{poolsError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Approval Buttons (like old UI) */}
      {isConnected && (amountA || amountB) && (
        (approvalA === ApprovalState.NOT_APPROVED ||
          approvalA === ApprovalState.PENDING ||
          approvalB === ApprovalState.NOT_APPROVED ||
          approvalB === ApprovalState.PENDING) && (
          <div className="flex gap-3">
            {approvalA !== ApprovalState.APPROVED && amountA && (
              <Button
                onClick={approveACallback}
                disabled={approvalA === ApprovalState.PENDING}
                className={`flex-1 py-3 text-base font-medium ${approvalB !== ApprovalState.APPROVED && amountB ? 'w-1/2' : 'w-full'
                  }`}
                variant="outline"
              >
                {approvalA === ApprovalState.PENDING ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>Approving {tokenA.symbol}...</span>
                  </div>
                ) : (
                  `Approve ${tokenA.symbol}`
                )}
              </Button>
            )}
            {approvalB !== ApprovalState.APPROVED && amountB && (
              <Button
                onClick={approveBCallback}
                disabled={approvalB === ApprovalState.PENDING}
                className={`flex-1 py-3 text-base font-medium ${approvalA !== ApprovalState.APPROVED && amountA ? 'w-1/2' : 'w-full'
                  }`}
                variant="outline"
              >
                {approvalB === ApprovalState.PENDING ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>Approving {tokenB.symbol}...</span>
                  </div>
                ) : (
                  `Approve ${tokenB.symbol}`
                )}
              </Button>
            )}
          </div>
        )
      )}

      {/* Action Button */}
      {!isConnected ? (
        <Button
          className="w-full py-3 text-base font-medium bg-purple-600 hover:bg-purple-700"
          size="lg"
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet to Add Liquidity
        </Button>
      ) : (
        <Button
          onClick={handleAddLiquidity}
          disabled={!isValid || approvalA !== ApprovalState.APPROVED || approvalB !== ApprovalState.APPROVED}
          className="w-full py-3 text-base font-medium"
          size="lg"
        >
          {isLoading || poolsLoading ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>
                {poolsLoading ? 'Processing...' : 'Adding Liquidity...'}
              </span>
            </div>
          ) : pairExists ? (
            parseFloat(userLPBalance) > 0 ? 'Add More Liquidity' : 'Add Liquidity'
          ) : (
            'Create Pool & Add Liquidity'
          )}
        </Button>
      )}
    </div>
  );
}
