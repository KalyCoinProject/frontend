'use client'

import { useCallback } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { BigNumber, Contract, ethers } from 'ethers'
import { FARMING_CONFIG } from '@/config/farming'
import liquidityPoolManagerV2ABI from '@/config/abis/dex/liqudityPoolManagerV2ABI.json'
import treasuryVesterABI from '@/config/abis/dex/treasuryVesterABI.json'
import stakingRewardsABI from '@/config/abis/dex/stakingRewardsABI.json'
import { ContractEncoder, estimateContractGas, getCurrentGasPrice } from '@/utils/contractEncoder'
import { farmingLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

interface StakingContractData {
  stakedAmount: BigNumber
  earnedAmount: BigNumber
  totalStakedAmount: BigNumber
  rewardRate: BigNumber
  periodFinish: number
  poolWeight: BigNumber
  totalWeight: BigNumber
  stakingContractAddress: string
  klcLiquidity: BigNumber
}

interface APRData {
  swapFeeApr: number
  stakingApr: number
  combinedApr: number
}

interface WhitelistedPool {
  pair: string
  weight: BigNumber
  isActive: boolean
}

export function useFarmingContracts() {
  const { chainId, signTransaction, walletType } = useWallet()

  // Contract addresses for KalyChain
  const LIQUIDITY_POOL_MANAGER_V2_ADDRESS = '0xe83e7ede1358FA87e5039CF8B1cffF383Bc2896A'
  const TREASURY_VESTER_ADDRESS = '0x4C4b968232a8603e2D1e53AB26E9a0319fA33ED3'

  // Create a provider for reading contract data
  const getProvider = useCallback(() => {
    // Use KalyChain RPC for reading contract data
    return new ethers.providers.JsonRpcProvider('https://rpc.kalychain.io/rpc')
  }, [])

  // Helper function to check if using internal wallet
  const isUsingInternalWallet = useCallback(() => {
    return walletType === 'internal'
  }, [walletType])

  // Helper function to prompt for password (same pattern as SwapInterface)
  const promptForPassword = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
      modal.innerHTML = `
        <div class="bg-stone-900 border border-amber-500/30 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 class="text-lg font-semibold mb-4 text-white">Enter Wallet Password</h3>
          <p class="text-sm text-gray-300 mb-4">Enter your internal wallet password to authorize this farming transaction.</p>
          <input
            type="password"
            placeholder="Enter your wallet password"
            class="w-full p-3 border border-slate-600 bg-slate-800 text-white rounded-lg mb-4 password-input focus:outline-none focus:ring-2 focus:ring-amber-500"
            autofocus
          />
          <div class="flex gap-2">
            <button class="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg confirm-btn transition-colors">Confirm</button>
            <button class="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg cancel-btn transition-colors">Cancel</button>
          </div>
        </div>
      `;

      const passwordInput = modal.querySelector('.password-input') as HTMLInputElement;
      const confirmBtn = modal.querySelector('.confirm-btn') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.cancel-btn') as HTMLButtonElement;

      const handleConfirm = () => {
        const password = passwordInput.value;
        document.body.removeChild(modal);
        resolve(password || null);
      };

      const handleCancel = () => {
        document.body.removeChild(modal);
        resolve(null);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
      });

      document.body.appendChild(modal);
      setTimeout(() => {
        passwordInput.focus();
      }, 100);
    });
  };

  const getLiquidityPoolManagerContract = useCallback(() => {
    const provider = getProvider()
    if (!provider) return null
    return new Contract(LIQUIDITY_POOL_MANAGER_V2_ADDRESS, liquidityPoolManagerV2ABI, provider)
  }, [getProvider])

  const getTreasuryVesterContract = useCallback(() => {
    const provider = getProvider()
    if (!provider) return null
    return new Contract(TREASURY_VESTER_ADDRESS, treasuryVesterABI, provider)
  }, [getProvider])

  // Helper function to execute contract calls with proper internal wallet handling (same pattern as SwapInterface)
  const executeContractCall = async (contractAddress: string, functionName: string, args: any[], value?: bigint, abi: any[] | string[] = stakingRewardsABI) => {
    if (isUsingInternalWallet()) {
      // For internal wallets, use direct GraphQL call like SwapInterface
      const { internalWalletUtils } = await import('@/connectors/internalWallet');
      const internalWalletState = internalWalletUtils.getState();
      if (!internalWalletState.activeWallet) {
        throw new Error('No internal wallet connected');
      }

      // Get password from user
      const password = await promptForPassword();
      if (!password) {
        throw new Error('Password required for transaction signing');
      }

      // Encode the function data
      const provider = getProvider();
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const data = contract.interface.encodeFunctionData(functionName, args);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Call backend directly like SwapInterface does
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `
            mutation SendContractTransaction($input: SendContractTransactionInput!) {
              sendContractTransaction(input: $input) {
                id
                hash
                status
              }
            }
          `,
          variables: {
            input: {
              walletId: internalWalletState.activeWallet.id,
              toAddress: contractAddress,
              value: value?.toString() || '0',
              data: data,
              password: password,
              chainId: internalWalletState.activeWallet.chainId,
              gasLimit: '800000'
            }
          }
        }),
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return result.data.sendContractTransaction.hash;
    } else {
      // For external wallets, use the existing signTransaction method
      const provider = getProvider();
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const data = contract.interface.encodeFunctionData(functionName, args);

      const tx = {
        to: contractAddress,
        data,
        value: value?.toString() || '0'
      };

      return await signTransaction(tx);
    }
  };

  const getWhitelistedPools = useCallback(async (): Promise<WhitelistedPool[]> => {
    try {
      const contract = getLiquidityPoolManagerContract()
      if (!contract) return []

      farmingLogger.debug('🔍 Fetching whitelisted pools from LiquidityPoolManagerV2...')

      // Get number of pools first
      const numPools = await contract.numPools()
      farmingLogger.debug(`📊 Total pools in contract: ${numPools.toString()}`)

      const pools: WhitelistedPool[] = []

      // Import farming config to get all known pair addresses
      const { LP_FARMING_POOLS } = await import('@/config/farming')

      // Extract all known pair addresses from config
      const knownPairAddresses = Object.values(LP_FARMING_POOLS)
        .map(pool => pool.pairAddress)
        .filter((address): address is string => address !== undefined) // Remove undefined addresses with type guard

      farmingLogger.debug('🔍 Checking known pair addresses:', knownPairAddresses)

      // Also try to get pair addresses dynamically from factory for pools without hardcoded addresses
      const poolsWithoutAddresses = Object.values(LP_FARMING_POOLS)
        .filter(pool => !pool.pairAddress)

      farmingLogger.debug(`🔍 Found ${poolsWithoutAddresses.length} pools without hardcoded addresses`)

      // For now, let's focus on the known pair address and add more discovery later
      const allPairAddresses = [...knownPairAddresses]

      // Check each known pair
      for (const pairAddress of allPairAddresses) {
        try {
          farmingLogger.debug(`🔍 Checking pair: ${pairAddress}`)

          const [isWhitelisted, weight] = await Promise.all([
            contract.isWhitelisted(pairAddress),
            contract.weights(pairAddress)
          ])

          farmingLogger.debug(`  - Whitelisted: ${isWhitelisted}`)
          farmingLogger.debug(`  - Weight: ${weight.toString()}`)

          if (isWhitelisted) {
            pools.push({
              pair: pairAddress,
              weight,
              isActive: weight.gt(0)
            })
            farmingLogger.debug(`  ✅ Added to whitelisted pools`)
          } else {
            farmingLogger.debug(`  ❌ Not whitelisted`)
          }
        } catch (pairError) {
          farmingLogger.warn(`❌ Error checking pair ${pairAddress}:`, pairError)
        }
      }

      farmingLogger.debug(`✅ Found ${pools.length} whitelisted pools`)
      return pools
    } catch (error) {
      farmingLogger.error('❌ Error fetching whitelisted pools:', error)
      return []
    }
  }, [getLiquidityPoolManagerContract])

  const getStakingInfo = useCallback(async (
    pairAddress: string,
    userAddress?: string
  ): Promise<StakingContractData | null> => {
    try {
      const liquidityManagerContract = getLiquidityPoolManagerContract()
      const provider = getProvider()

      if (!liquidityManagerContract || !provider) {
        farmingLogger.warn('Contracts not available - provider not connected')
        return null
      }

      try {
        farmingLogger.debug(`🔍 Getting staking info for pair: ${pairAddress}`)

        // Step 1: Get basic pool info from LiquidityPoolManagerV2
        const poolInfoResults = await Promise.allSettled([
          liquidityManagerContract.isWhitelisted(pairAddress),
          liquidityManagerContract.weights(pairAddress),
          liquidityManagerContract.getKlcLiquidity(pairAddress), // This might fail for non-WKLC pairs
          liquidityManagerContract.stakes(pairAddress) // 🎯 Get the actual staking contract!
        ])

        const isWhitelisted = poolInfoResults[0].status === 'fulfilled' ? poolInfoResults[0].value : false
        const poolWeight = poolInfoResults[1].status === 'fulfilled' ? poolInfoResults[1].value : BigNumber.from('0')
        const klcLiquidity = poolInfoResults[2].status === 'fulfilled' ? poolInfoResults[2].value : BigNumber.from('0')
        const stakingContractAddress = poolInfoResults[3].status === 'fulfilled' ? poolInfoResults[3].value : ''

        // Log if getKlcLiquidity failed (expected for KSWAP/USDT)
        if (poolInfoResults[2].status === 'rejected') {
          farmingLogger.debug(`⚠️  getKlcLiquidity failed for ${pairAddress} (likely non-WKLC pair): ${poolInfoResults[2].reason?.message || 'Unknown error'}`)
        }

        farmingLogger.debug(`📊 Pool registry data for ${pairAddress}:`)
        farmingLogger.debug(`  - Is whitelisted: ${isWhitelisted}`)
        farmingLogger.debug(`  - Pool weight: ${poolWeight.toString()}`)
        farmingLogger.debug(`  - KLC Liquidity: ${klcLiquidity.toString()}`)
        farmingLogger.debug(`  - Staking contract: ${stakingContractAddress}`)

        if (!isWhitelisted) {
          farmingLogger.warn(`❌ Pool ${pairAddress} is not whitelisted`)
          return null
        }

        if (!stakingContractAddress || stakingContractAddress === '0x0000000000000000000000000000000000000000') {
          farmingLogger.warn(`❌ No staking contract found for ${pairAddress}`)
          return null
        }

        // Step 2: Query the individual staking contract for real data
        const stakingContract = new Contract(stakingContractAddress, stakingRewardsABI, provider)

        const stakingResults = await Promise.allSettled([
          stakingContract.totalSupply(), // Total LP tokens staked
          stakingContract.rewardRate(), // KSWAP per second
          stakingContract.periodFinish(), // When rewards end
          userAddress ? stakingContract.balanceOf(userAddress) : Promise.resolve(BigNumber.from('0')), // User's staked amount
          userAddress ? stakingContract.earned(userAddress) : Promise.resolve(BigNumber.from('0')), // User's earned rewards
        ])

        // Extract staking contract results
        const totalSupply = stakingResults[0].status === 'fulfilled' ? stakingResults[0].value : BigNumber.from('0')
        const rewardRate = stakingResults[1].status === 'fulfilled' ? stakingResults[1].value : BigNumber.from('0')
        const periodFinish = stakingResults[2].status === 'fulfilled' ? stakingResults[2].value.toNumber() : 0
        const userStakedAmount = stakingResults[3].status === 'fulfilled' ? stakingResults[3].value : BigNumber.from('0')
        const userEarnedAmount = stakingResults[4].status === 'fulfilled' ? stakingResults[4].value : BigNumber.from('0')

        farmingLogger.debug(`📊 Staking contract data:`)
        farmingLogger.debug(`  - Total staked: ${totalSupply.toString()} LP tokens`)
        farmingLogger.debug(`  - Reward rate: ${rewardRate.toString()} KSWAP/second`)
        farmingLogger.debug(`  - Period finish: ${periodFinish} (${new Date(periodFinish * 1000).toISOString()})`)
        farmingLogger.debug(`  - User staked: ${userStakedAmount.toString()} LP tokens`)
        farmingLogger.debug(`  - User earned: ${userEarnedAmount.toString()} KSWAP`)

        // Log any failed staking contract calls
        stakingResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const callNames = ['totalSupply', 'rewardRate', 'periodFinish', 'balanceOf', 'earned']
            farmingLogger.error(`❌ Failed staking call ${callNames[index]}:`, result.reason)
          }
        })

        // If pool is not whitelisted, return null
        if (!isWhitelisted) {
          farmingLogger.warn(`❌ Pool ${pairAddress} is not whitelisted`)
          return null
        }

        // Return the real staking data from the individual staking contract
        return {
          stakedAmount: userStakedAmount, // Real user staked amount from staking contract
          earnedAmount: userEarnedAmount, // Real user earned amount from staking contract
          totalStakedAmount: totalSupply, // Real total staked LP tokens from staking contract
          rewardRate: rewardRate, // Real reward rate from staking contract
          periodFinish: periodFinish, // Real period finish from staking contract
          poolWeight,
          totalWeight: BigNumber.from('100'), // Assuming weights are out of 100
          stakingContractAddress, // Include the staking contract address
          klcLiquidity // Include KLC liquidity for TVL display
        }
      } catch (contractError) {
        farmingLogger.error('❌ Contract calls failed:', contractError)
        return null
      }
    } catch (error) {
      farmingLogger.error('Error fetching staking info:', error)
      return null
    }
  }, [getLiquidityPoolManagerContract, getTreasuryVesterContract])

  const getPoolAPR = useCallback(async (
    pairAddress: string
  ): Promise<APRData | null> => {
    try {
      const liquidityManagerContract = getLiquidityPoolManagerContract()
      const treasuryVesterContract = getTreasuryVesterContract()

      if (!liquidityManagerContract || !treasuryVesterContract) {
        farmingLogger.warn('Contracts not available for APR calculation')
        return null
      }

      try {
        // Get contract data for APR calculation using available methods
        const results = await Promise.allSettled([
          liquidityManagerContract.weights(pairAddress),
          liquidityManagerContract.numPools(),
          liquidityManagerContract.isWhitelisted(pairAddress),
          treasuryVesterContract.vestingAmount(),
          treasuryVesterContract.halvingPeriod(),
          treasuryVesterContract.vestingEnabled()
        ])

        const poolWeight = results[0].status === 'fulfilled' ? results[0].value : BigNumber.from('0')
        const numPools = results[1].status === 'fulfilled' ? results[1].value : BigNumber.from('1')
        const isWhitelisted = results[2].status === 'fulfilled' ? results[2].value : false
        const vestingAmount = results[3].status === 'fulfilled' ? results[3].value : BigNumber.from('0')
        const halvingPeriod = results[4].status === 'fulfilled' ? results[4].value : 0
        const vestingEnabled = results[5].status === 'fulfilled' ? results[5].value : false

        // If pool is not whitelisted or no vesting, return 0 APR
        if (!isWhitelisted || !vestingEnabled || poolWeight.eq(0)) {
          return {
            swapFeeApr: 0,
            stakingApr: 0,
            combinedApr: 0
          }
        }

        // Calculate annual rewards based on vesting schedule
        const annualRewards = halvingPeriod > 0
          ? vestingAmount.mul(365 * 24 * 60 * 60).div(halvingPeriod)
          : BigNumber.from('0')

        // Calculate pool's share of rewards (simplified - equal distribution among pools)
        const poolAnnualRewards = numPools.gt(0) ? annualRewards.div(numPools) : BigNumber.from('0')

        // TODO: Get real pool liquidity from pair contract
        // For now, return 0 to indicate N/A until we implement liquidity fetching
        const stakingApr = 0 // Will be 0 until we implement liquidity calculation
        const swapFeeApr = 0 // Will be 0 until we implement volume/fee calculation

        return {
          swapFeeApr,
          stakingApr,
          combinedApr: stakingApr + swapFeeApr
        }
      } catch (contractError) {
        farmingLogger.error('Contract APR calculation failed:', contractError)
        return null
      }
    } catch (error) {
      farmingLogger.error('Error fetching pool APR:', error)
      return null
    }
  }, [getLiquidityPoolManagerContract, getTreasuryVesterContract])

  const addLiquidityToPool = useCallback(async (
    pairAddress: string,
    amount: BigNumber
  ): Promise<string | null> => {
    try {
      if (!signTransaction) return null

      const contract = getLiquidityPoolManagerContract()
      if (!contract) return null

      // TODO: Implement actual liquidity addition through LiquidityPoolManagerV2
      // This would involve calling the appropriate method on the contract
      farmingLogger.debug('Adding liquidity to pool:', { pairAddress, amount: amount.toString() })

      // Mock transaction for now
      const mockTx = {
        to: LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
        data: '0x', // Would be encoded function call
        value: '0'
      }

      return await signTransaction(mockTx)
    } catch (error) {
      farmingLogger.error('Error adding liquidity:', error)
      return null
    }
  }, [getLiquidityPoolManagerContract, signTransaction])

  const removeLiquidityFromPool = useCallback(async (
    pairAddress: string,
    amount: BigNumber
  ): Promise<string | null> => {
    try {
      if (!signTransaction) return null

      const contract = getLiquidityPoolManagerContract()
      if (!contract) return null

      // TODO: Implement actual liquidity removal through LiquidityPoolManagerV2
      farmingLogger.debug('Removing liquidity from pool:', { pairAddress, amount: amount.toString() })

      // Mock transaction for now
      const mockTx = {
        to: LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
        data: '0x', // Would be encoded function call
        value: '0'
      }

      return await signTransaction(mockTx)
    } catch (error) {
      farmingLogger.error('Error removing liquidity:', error)
      return null
    }
  }, [getLiquidityPoolManagerContract, signTransaction])

  const claimVestedRewards = useCallback(async (): Promise<string | null> => {
    try {
      farmingLogger.debug('Claiming vested rewards from TreasuryVester')

      // Use the new executeContractCall helper
      return await executeContractCall(
        TREASURY_VESTER_ADDRESS,
        'claim',
        [],
        BigInt(0),
        treasuryVesterABI
      )
    } catch (error) {
      farmingLogger.error('Error claiming vested rewards:', error)
      return null
    }
  }, [executeContractCall])

  // Claim rewards from a specific staking reward contract
  const claimStakingRewards = useCallback(async (
    stakingRewardAddress: string
  ): Promise<string | null> => {
    try {
      farmingLogger.debug('Claiming staking rewards from:', stakingRewardAddress)

      // Use the new executeContractCall helper
      return await executeContractCall(
        stakingRewardAddress,
        'getReward',
        [],
        BigInt(0),
        [
          'function getReward() external',
        ]
      )
    } catch (error) {
      farmingLogger.error('Error claiming staking rewards:', error)
      return null
    }
  }, [executeContractCall])

  const calculateAndDistribute = useCallback(async (): Promise<string | null> => {
    try {
      if (!signTransaction) return null

      const contract = getLiquidityPoolManagerContract()
      if (!contract) return null

      farmingLogger.debug('Triggering calculate and distribute')

      // Encode the calculateAndDistribute() function call
      const data = ContractEncoder.encodeCalculateAndDistribute()

      // Get provider for gas estimation
      const provider = getProvider()

      // Estimate gas and get gas price
      const [gasLimit, gasPrice] = await Promise.all([
        estimateContractGas(provider, LIQUIDITY_POOL_MANAGER_V2_ADDRESS, data),
        getCurrentGasPrice(provider)
      ])

      const tx = {
        to: LIQUIDITY_POOL_MANAGER_V2_ADDRESS,
        data,
        value: '0',
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString()
      }

      return await signTransaction(tx)
    } catch (error) {
      farmingLogger.error('Error calculating and distributing:', error)
      return null
    }
  }, [getLiquidityPoolManagerContract, signTransaction, getProvider])

  // Approve LP tokens for staking
  const approveLPTokens = useCallback(async (
    lpTokenAddress: string,
    stakingRewardAddress: string,
    amount: BigNumber
  ): Promise<string | null> => {
    try {
      farmingLogger.debug('Approving LP tokens:', {
        lpTokenAddress,
        stakingRewardAddress,
        amount: amount.toString()
      })

      // Use the new executeContractCall helper
      return await executeContractCall(
        lpTokenAddress,
        'approve',
        [stakingRewardAddress, amount],
        BigInt(0),
        [
          'function approve(address spender, uint256 amount) external returns (bool)',
        ]
      )
    } catch (error) {
      farmingLogger.error('Error approving LP tokens:', error)
      return null
    }
  }, [executeContractCall])

  // Stake LP tokens using stakeWithPermit (combines approval + staking in one tx)
  const stakeLPTokensWithPermit = useCallback(async (
    stakingRewardAddress: string,
    lpTokenAddress: string,
    amount: BigNumber
  ): Promise<string | null> => {
    try {
      if (!signTransaction) return null

      const provider = getProvider()
      if (!provider) return null

      // Create deadline (20 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 1200

      // Create the permit signature data
      const domain = {
        name: 'KalySwap LP', // This might need to be adjusted based on the actual LP token name
        version: '1',
        chainId: CHAIN_IDS.KALYCHAIN,
        verifyingContract: lpTokenAddress
      }

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      }

      // Get user's address from wallet
      const accounts = await provider.listAccounts()
      if (!accounts || accounts.length === 0) {
        throw new Error('No wallet accounts found')
      }
      const userAddress = accounts[0]

      // Get nonce from LP token contract
      const lpTokenContract = new ethers.Contract(
        lpTokenAddress,
        [
          'function nonces(address owner) view returns (uint256)',
        ],
        provider
      )

      const nonce = await lpTokenContract.nonces(userAddress)

      const message = {
        owner: userAddress,
        spender: stakingRewardAddress,
        value: amount.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString()
      }

      // Sign the permit
      const signature = await provider.send('eth_signTypedData_v4', [
        userAddress,
        JSON.stringify({ domain, types, primaryType: 'Permit', message })
      ])

      // Split signature into v, r, s
      const sig = ethers.utils.splitSignature(signature)

      // Create staking contract instance
      const stakingContract = new ethers.Contract(
        stakingRewardAddress,
        [
          'function stakeWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
        ],
        provider
      )

      const encodedData = stakingContract.interface.encodeFunctionData('stakeWithPermit', [
        amount,
        deadline,
        sig.v,
        sig.r,
        sig.s
      ])

      farmingLogger.debug('Staking LP tokens with permit:', {
        stakingRewardAddress,
        lpTokenAddress,
        amount: amount.toString(),
        deadline,
        signature: sig
      })

      const tx = {
        to: stakingRewardAddress,
        data: encodedData,
        value: '0'
      }

      return await signTransaction(tx)
    } catch (error) {
      farmingLogger.error('Error staking LP tokens with permit:', error)
      return null
    }
  }, [executeContractCall, getProvider])

  // Fallback stake method (requires separate approval)
  const stakeLPTokens = useCallback(async (
    stakingRewardAddress: string,
    amount: BigNumber,
    version: number = 2
  ): Promise<string | null> => {
    try {
      farmingLogger.debug('Staking LP tokens (fallback method):', {
        stakingRewardAddress,
        amount: amount.toString()
      })

      // Use the new executeContractCall helper
      return await executeContractCall(
        stakingRewardAddress,
        'stake',
        [amount],
        BigInt(0),
        [
          'function stake(uint256 amount) external',
        ]
      )
    } catch (error) {
      farmingLogger.error('Error staking LP tokens:', error)
      return null
    }
  }, [executeContractCall])

  // Unstake LP tokens from a specific staking reward contract
  const unstakeLPTokens = useCallback(async (
    stakingRewardAddress: string,
    amount: BigNumber,
    version: number = 2
  ): Promise<string | null> => {
    try {
      farmingLogger.debug('Unstaking LP tokens:', {
        stakingRewardAddress,
        amount: amount.toString(),
        version
      })

      // Use the new executeContractCall helper
      return await executeContractCall(
        stakingRewardAddress,
        'withdraw',
        [amount],
        BigInt(0),
        [
          'function withdraw(uint256 amount) external',
          'function exit() external', // For withdrawing all + claiming rewards
        ]
      )
    } catch (error) {
      farmingLogger.error('Error unstaking LP tokens:', error)
      return null
    }
  }, [executeContractCall])

  return {
    getStakingInfo,
    getPoolAPR,
    getWhitelistedPools,
    addLiquidityToPool,
    removeLiquidityFromPool,
    claimVestedRewards,
    claimStakingRewards,
    calculateAndDistribute,
    approveLPTokens,
    stakeLPTokens,
    stakeLPTokensWithPermit,
    unstakeLPTokens,
    getLiquidityPoolManagerContract,
    getTreasuryVesterContract
  }
}
