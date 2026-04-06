'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, getContract } from 'viem';
import { getContractAddress, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { ROUTER_ABI, FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '@/config/abis';
import { DexService, Token as DexToken } from '@/services/dex';
import { poolLogger } from '@/lib/logger';

export enum ApprovalState {
  UNKNOWN = 'UNKNOWN',
  NOT_APPROVED = 'NOT_APPROVED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED'
}

interface PairInfo {
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  exists: boolean;
  // Enhanced with subgraph data
  reserveUSD?: string;
  volumeUSD?: string;
  txCount?: string;
  token0Price?: string;
  token1Price?: string;
}

interface OptimalAmounts {
  amountA: string;
  amountB: string;
}

interface ApprovalInfo {
  state: ApprovalState;
  approve: () => Promise<void>;
}

export function usePools() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalStates, setApprovalStates] = useState<{ [key: string]: ApprovalState }>({});

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Helper function to execute contract calls via standard Wagmi writeContract
  const executeContractCall = async (contractAddress: string, functionName: string, args: any[], value?: bigint, abi = ROUTER_ABI) => {
    if (!walletClient) throw new Error('Wallet client not available');

    poolLogger.debug('Executing contract call:', {
      address: contractAddress,
      functionName,
      args,
      value: value?.toString()
    });

    try {
      const result = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi,
        functionName,
        args,
        value,
      });

      poolLogger.debug('Contract call successful:', result);
      return result;
    } catch (err) {
      poolLogger.error('Contract call failed:', err);
      throw err;
    }
  };

  // Simple approval function (not a hook to avoid infinite re-renders)
  const approveToken = useCallback(async (
    tokenAddress: string,
    routerAddress?: string
  ): Promise<void> => {
    const spenderAddress = routerAddress || getContractAddress('ROUTER', DEFAULT_CHAIN_ID);

    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (!walletClient) {
      throw new Error('Wallet client not available');
    }

    try {
      poolLogger.debug('Starting approval process...', { tokenAddress, spenderAddress, userAddress: address });

      // Use MaxUint256 for approval like the old UI
      const maxAmount = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

      poolLogger.debug('Calling executeContractCall...');
      const approveHash = await executeContractCall(
        tokenAddress,
        'approve',
        [spenderAddress, maxAmount],
        BigInt(0),
        ERC20_ABI
      );

      poolLogger.debug('Approval hash:', approveHash);
      await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      poolLogger.debug('Token approved successfully');
    } catch (err) {
      poolLogger.error('Error approving token:', err);
      throw err;
    }
  }, [executeContractCall, publicClient, address, walletClient]);

  // New function to get pair info from subgraph
  const getPairInfoFromSubgraph = useCallback(async (tokenA: string, tokenB: string): Promise<PairInfo | null> => {
    try {
      poolLogger.debug('Fetching pair info from subgraph for:', tokenA, tokenB);

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetPairInfo($token0: String!, $token1: String!) {
              pairs(where: {
                or: [
                  { and: [{ token0: $token0 }, { token1: $token1 }] },
                  { and: [{ token0: $token1 }, { token1: $token0 }] }
                ]
              }) {
                id
                token0 {
                  id
                  symbol
                  decimals
                }
                token1 {
                  id
                  symbol
                  decimals
                }
                reserve0
                reserve1
                totalSupply
                reserveUSD
                volumeUSD
                txCount
                token0Price
                token1Price
              }
            }
          `,
          variables: {
            token0: tokenA.toLowerCase(),
            token1: tokenB.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        poolLogger.debug('Subgraph pair response:', result);

        if (result.errors) {
          poolLogger.error('GraphQL errors:', result.errors);
          throw new Error(result.errors[0].message);
        }

        if (result.data?.pairs && result.data.pairs.length > 0) {
          const pair = result.data.pairs[0];

          return {
            address: pair.id,
            token0: pair.token0.id,
            token1: pair.token1.id,
            reserve0: pair.reserve0,
            reserve1: pair.reserve1,
            totalSupply: pair.totalSupply,
            exists: true,
            // Enhanced subgraph data
            reserveUSD: pair.reserveUSD,
            volumeUSD: pair.volumeUSD,
            txCount: pair.txCount,
            token0Price: pair.token0Price,
            token1Price: pair.token1Price
          };
        } else {
          // Pair doesn't exist in subgraph
          return {
            address: '',
            token0: tokenA,
            token1: tokenB,
            reserve0: '0',
            reserve1: '0',
            totalSupply: '0',
            exists: false
          };
        }
      } else {
        poolLogger.warn('Failed to fetch pair from subgraph, falling back to contract call');
        return null; // Will trigger fallback to contract call
      }
    } catch (err) {
      poolLogger.error('Error fetching pair from subgraph:', err);
      return null; // Will trigger fallback to contract call
    }
  }, []);

  const getPairInfo = useCallback(async (tokenA: string, tokenB: string): Promise<PairInfo | null> => {
    // First try to get pair info from subgraph (faster and more data)
    const subgraphResult = await getPairInfoFromSubgraph(tokenA, tokenB);
    if (subgraphResult !== null) {
      poolLogger.debug('Using subgraph data for pair:', tokenA, tokenB);
      return subgraphResult;
    }

    // Fallback to contract calls if subgraph fails
    poolLogger.warn('Falling back to contract calls for pair:', tokenA, tokenB);
    if (!publicClient) return null;

    try {
      const factoryAddress = getContractAddress('FACTORY', DEFAULT_CHAIN_ID);
      const factoryContract = getContract({
        address: factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        client: publicClient,
      });

      // Get pair address from factory
      const pairAddress = await factoryContract.read.getPair([tokenA, tokenB]);

      // Check if pair exists (address is not zero)
      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        return {
          address: '',
          token0: tokenA,
          token1: tokenB,
          reserve0: '0',
          reserve1: '0',
          totalSupply: '0',
          exists: false
        };
      }

      // Get pair contract to fetch reserves
      const pairContract = getContract({
        address: pairAddress as `0x${string}`,
        abi: PAIR_ABI,
        client: publicClient,
      });

      // Get reserves and total supply
      const [reserves, totalSupply, token0Address, token1Address] = await Promise.all([
        pairContract.read.getReserves([]),
        pairContract.read.totalSupply([]),
        pairContract.read.token0([]),
        pairContract.read.token1([])
      ]);

      // Get token decimals for proper formatting
      let token0Decimals = 18;
      let token1Decimals = 18;

      try {
        // Try to get decimals from token contracts
        const token0Contract = getContract({
          address: token0Address as `0x${string}`,
          abi: ERC20_ABI,
          client: publicClient,
        });
        const token1Contract = getContract({
          address: token1Address as `0x${string}`,
          abi: ERC20_ABI,
          client: publicClient,
        });

        const decimalsResults = await Promise.all([
          token0Contract.read.decimals([]),
          token1Contract.read.decimals([])
        ]);
        token0Decimals = decimalsResults[0] as number;
        token1Decimals = decimalsResults[1] as number;
      } catch (err) {
        poolLogger.warn('Could not fetch token decimals, using 18 as default');
      }

      const reservesArray = reserves as [bigint, bigint, number];
      return {
        address: pairAddress as string,
        token0: token0Address as string,
        token1: token1Address as string,
        reserve0: formatUnits(reservesArray[0], token0Decimals),
        reserve1: formatUnits(reservesArray[1], token1Decimals),
        totalSupply: formatUnits(totalSupply as bigint, 18),
        exists: true
      };
    } catch (err) {
      poolLogger.error('Error fetching pair info:', err);
      return null;
    }
  }, [publicClient, getPairInfoFromSubgraph]);

  const calculateOptimalAmounts = useCallback(async (
    tokenA: string,
    tokenB: string,
    amount: string,
    inputToken: 'A' | 'B'
  ): Promise<OptimalAmounts | null> => {
    try {
      const pairInfo = await getPairInfo(tokenA, tokenB);

      if (!pairInfo || !pairInfo.exists) {
        // For new pools, user can set any ratio
        return null;
      }

      const reserve0 = parseFloat(pairInfo.reserve0);
      const reserve1 = parseFloat(pairInfo.reserve1);
      const inputAmount = parseFloat(amount);

      if (reserve0 === 0 || reserve1 === 0 || inputAmount === 0) {
        return null;
      }

      let amountA: string, amountB: string;

      // Determine which token is token0 and token1
      const isTokenAFirst = tokenA.toLowerCase() === pairInfo.token0.toLowerCase();

      if (inputToken === 'A') {
        amountA = amount;
        if (isTokenAFirst) {
          // tokenA is token0, calculate token1 amount
          amountB = ((inputAmount * reserve1) / reserve0).toFixed(6);
        } else {
          // tokenA is token1, calculate token0 amount
          amountB = ((inputAmount * reserve0) / reserve1).toFixed(6);
        }
      } else {
        amountB = amount;
        if (isTokenAFirst) {
          // tokenB is token1, calculate token0 amount
          amountA = ((inputAmount * reserve0) / reserve1).toFixed(6);
        } else {
          // tokenB is token0, calculate token1 amount
          amountA = ((inputAmount * reserve1) / reserve0).toFixed(6);
        }
      }

      return { amountA, amountB };
    } catch (err) {
      poolLogger.error('Error calculating optimal amounts:', err);
      return null;
    }
  }, [getPairInfo]);



  // Forward declaration for addLiquidity function
  const addLiquidityRef = useRef<any>(null);

  const addLiquidity = useCallback(async (
    tokenA: string,
    tokenB: string,
    amountA: string,
    amountB: string,
    tokenADecimals: number = 18,
    tokenBDecimals: number = 18
  ): Promise<boolean> => {
    if (!publicClient || !address) {
      setError('Wallet not connected');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);
      const wklcAddress = getContractAddress('WKLC', DEFAULT_CHAIN_ID);

      // Convert amounts to proper decimals
      const amountADesired = parseUnits(amountA, tokenADecimals);
      const amountBDesired = parseUnits(amountB, tokenBDecimals);

      // Set minimum amounts (with 0.5% slippage tolerance)
      const amountAMin = (amountADesired * BigInt(995)) / BigInt(1000);
      const amountBMin = (amountBDesired * BigInt(995)) / BigInt(1000);

      // Calculate deadline (current time + 20 minutes)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + (20 * 60));

      poolLogger.debug('Adding liquidity:', {
        tokenA,
        tokenB,
        amountA,
        amountB,
        amountADesired: amountADesired.toString(),
        amountBDesired: amountBDesired.toString()
      });

      // Check if either token is native KLC
      const isTokenANative = tokenA === '0x0000000000000000000000000000000000000000';
      const isTokenBNative = tokenB === '0x0000000000000000000000000000000000000000';

      if (isTokenANative || isTokenBNative) {
        // Handle KLC + Token liquidity
        const token = isTokenANative ? tokenB : tokenA;
        const tokenAmount = isTokenANative ? amountBDesired : amountADesired;
        const tokenAmountMin = isTokenANative ? amountBMin : amountAMin;
        const klcAmount = isTokenANative ? amountADesired : amountBDesired;
        const klcAmountMin = isTokenANative ? amountAMin : amountBMin;

        // Note: Token approval should be handled by the UI before calling this function
        poolLogger.debug('Adding KLC + Token liquidity...');
        const liquidityHash = await executeContractCall(
          routerAddress,
          'addLiquidityKLC',
          [token, tokenAmount, tokenAmountMin, klcAmountMin, address, deadline],
          klcAmount
        );

        poolLogger.debug('Add liquidity hash:', liquidityHash);
        await publicClient.waitForTransactionReceipt({ hash: liquidityHash });
        poolLogger.debug('Liquidity added successfully');
      } else {
        // Handle Token + Token liquidity
        // Note: Approvals should be handled by the UI before calling this function
        poolLogger.debug('Adding Token + Token liquidity...');
        const liquidityHash = await executeContractCall(
          routerAddress,
          'addLiquidity',
          [tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, address, deadline]
        );

        poolLogger.debug('Add liquidity hash:', liquidityHash);
        await publicClient.waitForTransactionReceipt({ hash: liquidityHash });
        poolLogger.debug('Liquidity added successfully');
      }

      return true;
    } catch (err) {
      poolLogger.error('Error adding liquidity:', err);
      setError(`Failed to add liquidity: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, executeContractCall]);

  // Update the ref with the addLiquidity function
  addLiquidityRef.current = addLiquidity;

  const createPair = useCallback(async (
    tokenA: string,
    tokenB: string,
    amountA: string,
    amountB: string,
    tokenADecimals: number = 18,
    tokenBDecimals: number = 18
  ): Promise<boolean> => {
    if (!publicClient || !address) {
      setError('Wallet not connected');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const factoryAddress = getContractAddress('FACTORY', DEFAULT_CHAIN_ID);

      poolLogger.debug('Creating pair and adding liquidity:', {
        tokenA,
        tokenB,
        amountA,
        amountB
      });

      // Step 1: Check if pair already exists
      const existingPair = await getPairInfo(tokenA, tokenB);
      if (existingPair && existingPair.exists) {
        poolLogger.warn('Pair already exists, adding liquidity to existing pair');
        return await addLiquidityRef.current(tokenA, tokenB, amountA, amountB, tokenADecimals, tokenBDecimals);
      }

      // Step 2: Create the pair
      poolLogger.debug('Creating new pair...');
      const createPairHash = await executeContractCall(
        factoryAddress,
        'createPair',
        [tokenA, tokenB],
        BigInt(0),
        FACTORY_ABI
      );

      poolLogger.debug('Create pair hash:', createPairHash);
      await publicClient.waitForTransactionReceipt({ hash: createPairHash });
      poolLogger.debug('Pair created successfully');

      // Step 3: Add initial liquidity to the new pair
      poolLogger.debug('Adding initial liquidity to new pair...');
      const liquidityResult = await addLiquidityRef.current(tokenA, tokenB, amountA, amountB, tokenADecimals, tokenBDecimals);

      if (liquidityResult) {
        poolLogger.debug('Pair created and liquidity added successfully!');
      }

      return liquidityResult;
    } catch (err) {
      poolLogger.error('Error creating pair:', err);
      setError(`Failed to create pair: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, executeContractCall, getPairInfo]);

  const removeLiquidity = useCallback(async (
    tokenA: string,
    tokenB: string,
    liquidity: string,
    amountAMin: string,
    amountBMin: string,
    tokenADecimals: number = 18,
    tokenBDecimals: number = 18
  ): Promise<boolean> => {
    if (!publicClient || !address) {
      setError('Wallet not connected');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);
      const wklcAddress = getContractAddress('WKLC', DEFAULT_CHAIN_ID);

      poolLogger.debug('Removing liquidity:', {
        tokenA,
        tokenB,
        liquidity,
        amountAMin,
        amountBMin
      });

      // Convert amounts to proper decimals
      const liquidityAmount = parseUnits(liquidity, 18); // LP tokens are always 18 decimals
      const amountAMinBN = parseUnits(amountAMin, tokenADecimals);
      const amountBMinBN = parseUnits(amountBMin, tokenBDecimals);

      // Get pair address for LP token approval
      const factoryAddress = getContractAddress('FACTORY', DEFAULT_CHAIN_ID);
      const pairAddress = await publicClient.readContract({
        address: factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenA, tokenB]
      });

      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Pair does not exist');
      }

      // Step 1: Approve LP tokens for router
      poolLogger.debug('Approving LP tokens for router...');
      const approveHash = await executeContractCall(
        pairAddress as string,
        'approve',
        [routerAddress, liquidityAmount],
        BigInt(0),
        ERC20_ABI
      );

      poolLogger.debug('LP token approval hash:', approveHash);
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      poolLogger.debug('LP tokens approved');

      // Step 2: Remove liquidity
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes from now
      const isKLCPair = tokenA === wklcAddress || tokenB === wklcAddress;

      if (isKLCPair) {
        // Handle KLC pairs (removeLiquidityKLC)
        const token = tokenA === wklcAddress ? tokenB : tokenA;
        const tokenAmountMin = tokenA === wklcAddress ? amountBMinBN : amountAMinBN;
        const klcAmountMin = tokenA === wklcAddress ? amountAMinBN : amountBMinBN;

        poolLogger.debug('Removing KLC + Token liquidity...');
        const removeLiquidityHash = await executeContractCall(
          routerAddress,
          'removeLiquidityKLC',
          [token, liquidityAmount, tokenAmountMin, klcAmountMin, address, deadline]
        );

        poolLogger.debug('Remove liquidity hash:', removeLiquidityHash);
        await publicClient.waitForTransactionReceipt({ hash: removeLiquidityHash });
        poolLogger.debug('KLC liquidity removed successfully');
      } else {
        // Handle Token + Token pairs (removeLiquidity)
        poolLogger.debug('Removing Token + Token liquidity...');
        const removeLiquidityHash = await executeContractCall(
          routerAddress,
          'removeLiquidity',
          [tokenA, tokenB, liquidityAmount, amountAMinBN, amountBMinBN, address, deadline]
        );

        poolLogger.debug('Remove liquidity hash:', removeLiquidityHash);
        await publicClient.waitForTransactionReceipt({ hash: removeLiquidityHash });
        poolLogger.debug('Token liquidity removed successfully');
      }

      return true;
    } catch (err) {
      poolLogger.error('Error removing liquidity:', err);
      setError(`Failed to remove liquidity: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, executeContractCall]);

  const getUserPools = useCallback(async (userAddress: string) => {
    try {
      // TODO: Query subgraph for user's liquidity positions
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetUserPools($user: String!) {
              liquidityPositions(where: { user: $user, liquidityTokenBalance_gt: "0" }) {
                id
                liquidityTokenBalance
                pair {
                  id
                  token0 {
                    id
                    symbol
                    name
                  }
                  token1 {
                    id
                    symbol
                    name
                  }
                  reserve0
                  reserve1
                  totalSupply
                }
              }
            }
          `,
          variables: {
            user: userAddress.toLowerCase()
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const positions = data.data?.liquidityPositions || [];

        // If we found positions from subgraph, return them
        if (positions.length > 0) {
          poolLogger.debug('Found user positions from subgraph:', positions);
          return positions;
        }
      }

      // FALLBACK: If subgraph returns empty (common on testnet), check common pairs manually
      // This is less efficient but necessary for testnet functionality
      poolLogger.info('Subgraph returned no positions, conducting manual fallback discovery...');

      // Import KALYCHAIN_TOKENS dynamically to avoid circular dependencies if any
      const { KALYCHAIN_TOKENS } = await import('@/config/dex/tokens/kalychain');

      poolLogger.info(`Fallback discovery loaded ${KALYCHAIN_TOKENS.length} tokens.`);

      const discoveredPositions = [];
      const checkedPairs = new Set<string>();

      // Base tokens to check against.
      // We explicitly look for these common tokens AND any specific testnet tokens we just found.
      const baseTokens = KALYCHAIN_TOKENS.filter(t =>
        ['KLC', 'wKLC', 'USDT', 'USDC', 'KSWAP', 'tKLS', 'BUSD'].includes(t.symbol)
      );

      poolLogger.debug('Fallback checking against base tokens:', baseTokens.map(t => t.symbol));

      // Check pairs between Base Tokens and All Other Tokens
      // Optimized to avoid duplicates (A-B and B-A)
      for (const baseToken of baseTokens) {
        for (const token of KALYCHAIN_TOKENS) {
          if (baseToken.address === token.address) continue; // Skip self

          // Create a canonical key to avoid checking A-B and B-A twice
          const [t0, t1] = baseToken.address.toLowerCase() < token.address.toLowerCase()
            ? [baseToken.address, token.address]
            : [token.address, baseToken.address];

          const pairKey = `${t0}-${t1}`;
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);

          try {
            // 1. Get Pair Info (this will call Factory check -> Contract check)
            const pairInfo = await getPairInfo(baseToken.address, token.address);

            if (pairInfo) {
              poolLogger.debug(`Checked ${baseToken.symbol}-${token.symbol}: ${pairInfo.exists ? 'EXISTS' : 'NO_EXIST'} at ${pairInfo.address}`);
            }

            if (pairInfo && pairInfo.exists) {
              // 2. Check User's Balance in this pair
              const pairContract = getContract({
                address: pairInfo.address as `0x${string}`,
                abi: ERC20_ABI,
                client: publicClient!
              });

              const balance = await pairContract.read.balanceOf([userAddress as `0x${string}`]) as bigint;

              if (balance > 0n) {
                poolLogger.info(`Found position: ${baseToken.symbol}/${token.symbol} Balance: ${formatUnits(balance, 18)}`);
                poolLogger.debug(`Found hidden position: ${baseToken.symbol}/${token.symbol} (${formatUnits(balance, 18)} LP)`);

                // Construct a fake object matching the subgraph structure
                discoveredPositions.push({
                  id: `${pairInfo.address}-${userAddress}`, // Unique ID convention
                  liquidityTokenBalance: formatUnits(balance, 18),
                  pair: {
                    id: pairInfo.address,
                    token0: {
                      id: pairInfo.token0, // Kept for consistency if needed
                      address: pairInfo.token0, // REQUIRED for Service usage
                      symbol: (await getContract({ address: pairInfo.token0 as `0x${string}`, abi: ERC20_ABI, client: publicClient! }).read.symbol([])) as string,
                      name: 'Unknown',
                      decimals: (await getContract({ address: pairInfo.token0 as `0x${string}`, abi: ERC20_ABI, client: publicClient! }).read.decimals([])) as number,
                      chainId: DEFAULT_CHAIN_ID,
                      logoURI: '',
                    },
                    token1: {
                      id: pairInfo.token1,
                      address: pairInfo.token1, // REQUIRED for Service usage
                      symbol: (await getContract({ address: pairInfo.token1 as `0x${string}`, abi: ERC20_ABI, client: publicClient! }).read.symbol([])) as string,
                      name: 'Unknown',
                      decimals: (await getContract({ address: pairInfo.token1 as `0x${string}`, abi: ERC20_ABI, client: publicClient! }).read.decimals([])) as number,
                      chainId: DEFAULT_CHAIN_ID,
                      logoURI: '',
                    },
                    reserve0: pairInfo.reserve0,
                    reserve1: pairInfo.reserve1,
                    totalSupply: pairInfo.totalSupply
                  }
                });
              }
            }
          } catch (err) {
            // Continue searching regardless of error on one pair
            poolLogger.debug(`Manual check failed for ${baseToken.symbol}/${token.symbol}`, err);
          }
        }
      }

      return discoveredPositions;

    } catch (err) {
      poolLogger.error('Error fetching user pools:', err);
      return [];
    }
  }, [publicClient, getPairInfo]);

  // Get all pairs from subgraph for browsing
  const getAllPairs = useCallback(async (first: number = 25, skip: number = 0, orderBy: string = 'reserveUSD', orderDirection: string = 'desc') => {
    try {
      poolLogger.debug('Fetching all pairs from subgraph...');

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetAllPairs($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
              pairs(
                first: $first
                skip: $skip
                orderBy: $orderBy
                orderDirection: $orderDirection
                where: { reserveUSD_gt: "0" }
              ) {
                id
                token0 {
                  id
                  symbol
                  name
                  decimals
                }
                token1 {
                  id
                  symbol
                  name
                  decimals
                }
                reserve0
                reserve1
                totalSupply
                reserveUSD
                volumeUSD
                txCount
                token0Price
                token1Price
              }
            }
          `,
          variables: {
            first,
            skip,
            orderBy,
            orderDirection
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        poolLogger.debug('All pairs response:', result);

        if (result.errors) {
          poolLogger.error('GraphQL errors:', result.errors);
          throw new Error(result.errors[0].message);
        }

        return result.data?.pairs || [];
      } else {
        poolLogger.warn('Failed to fetch pairs from subgraph');
        return [];
      }
    } catch (err) {
      poolLogger.error('Error fetching pairs from subgraph:', err);
      return [];
    }
  }, []);

  return {
    loading,
    error,
    getPairInfo,
    getPairInfoFromSubgraph,
    getAllPairs,
    calculateOptimalAmounts,
    createPair,
    addLiquidity,
    removeLiquidity,
    getUserPools,
    // Approval functions
    approveToken,
    ApprovalState
  };
}
