'use client'

import { ethers, Contract, BigNumber } from 'ethers'
import { getContractAddress } from '@/config/contracts'
import MULTICALL_ABI from '@/config/abis/multicall.json'
import { contractLogger } from '@/lib/logger'
import { CHAIN_IDS } from '@/config/chains'

export interface MulticallRequest {
  target: string
  callData: string
  functionName?: string // For debugging
}

export interface MulticallResult {
  success: boolean
  returnData: string
  decoded?: any
}

export interface BatchedContractCall {
  contract: Contract
  functionName: string
  params: any[]
  decoder?: (data: string) => any
}

/**
 * Multicall utility service for batching contract calls
 * Reduces network requests from 80+ individual calls to a few batched calls
 */
export class MulticallService {
  private provider: ethers.providers.Provider
  private multicallContract: Contract
  private chainId: number

  constructor(provider: ethers.providers.Provider, chainId: number = CHAIN_IDS.KALYCHAIN) {
    this.provider = provider
    this.chainId = chainId
    
    const multicallAddress = getContractAddress('MULTICALL', chainId)
    this.multicallContract = new Contract(multicallAddress, MULTICALL_ABI, provider)
  }

  /**
   * Execute multiple contract calls in a single transaction
   */
  async aggregate(calls: MulticallRequest[]): Promise<MulticallResult[]> {
    try {
      contractLogger.debug(`🔄 Executing multicall with ${calls.length} calls`)
      contractLogger.debug(`📋 Multicall targets:`, calls.map(c => `${c.target}:${c.functionName}`))

      const { returnData } = await this.multicallContract.aggregate(
        calls.map(call => ({
          target: call.target,
          callData: call.callData
        }))
      )

      contractLogger.debug(`✅ Multicall successful, got ${returnData.length} results`)
      return returnData.map((data: string, index: number) => ({
        success: true,
        returnData: data,
        functionName: calls[index].functionName
      }))
    } catch (error) {
      contractLogger.error('❌ Multicall failed:', error)
      contractLogger.error('📋 Failed calls:', calls.map(c => `${c.target}:${c.functionName}`))
      // Return failed results for all calls
      return calls.map(() => ({
        success: false,
        returnData: '0x',
        decoded: null
      }))
    }
  }

  /**
   * Batch contract calls with automatic encoding/decoding
   */
  async batchContractCalls(calls: BatchedContractCall[]): Promise<any[]> {
    try {
      // Encode all function calls
      const multicallRequests: MulticallRequest[] = calls.map(call => ({
        target: call.contract.address,
        callData: call.contract.interface.encodeFunctionData(call.functionName, call.params),
        functionName: call.functionName
      }))

      // Execute multicall
      const results = await this.aggregate(multicallRequests)

      // Decode results
      return results.map((result, index) => {
        if (!result.success) {
          contractLogger.warn(`❌ Call ${calls[index].functionName} failed`)
          return null
        }

        try {
          const call = calls[index]
          if (call.decoder) {
            return call.decoder(result.returnData)
          } else {
            // Use contract interface to decode
            return call.contract.interface.decodeFunctionResult(
              call.functionName,
              result.returnData
            )[0] // Return first result for single return values
          }
        } catch (decodeError) {
          contractLogger.error(`❌ Failed to decode ${calls[index].functionName}:`, decodeError)
          return null
        }
      })
    } catch (error) {
      contractLogger.error('❌ Batch contract calls failed:', error)
      return calls.map(() => null)
    }
  }

  /**
   * Batch calls to the same contract
   */
  async batchSameContract(
    contract: Contract,
    calls: Array<{ functionName: string; params: any[] }>
  ): Promise<any[]> {
    const batchedCalls: BatchedContractCall[] = calls.map(call => ({
      contract,
      functionName: call.functionName,
      params: call.params
    }))

    return this.batchContractCalls(batchedCalls)
  }

  /**
   * Helper to create a multicall request
   */
  static createCall(
    contract: Contract,
    functionName: string,
    params: any[] = []
  ): MulticallRequest {
    return {
      target: contract.address,
      callData: contract.interface.encodeFunctionData(functionName, params),
      functionName
    }
  }
}

/**
 * Create multicall service instance
 */
export function createMulticallService(
  provider: ethers.providers.Provider,
  chainId: number = CHAIN_IDS.KALYCHAIN
): MulticallService {
  return new MulticallService(provider, chainId)
}

/**
 * Helper function to batch farming contract calls
 */
export async function batchFarmingCalls(
  provider: ethers.providers.Provider,
  liquidityManagerContract: Contract,
  stakingContracts: Contract[],
  pairAddresses: string[],
  userAddress?: string,
  chainId: number = CHAIN_IDS.KALYCHAIN
): Promise<{
  liquidityManagerResults: any[]
  stakingResults: any[][]
}> {
  const multicall = createMulticallService(provider, chainId)

  // Create one massive batch of ALL calls to ALL contracts
  const allCalls: BatchedContractCall[] = []
  let callIndex = 0

  // Track where each set of results starts
  const liquidityManagerStartIndex = callIndex

  // Add LiquidityPoolManager calls
  pairAddresses.forEach(pairAddress => {
    allCalls.push(
      { contract: liquidityManagerContract, functionName: 'isWhitelisted', params: [pairAddress] },
      { contract: liquidityManagerContract, functionName: 'weights', params: [pairAddress] },
      { contract: liquidityManagerContract, functionName: 'stakes', params: [pairAddress] }
    )
  })
  callIndex += pairAddresses.length * 3

  // Track staking contract call indices
  const stakingStartIndices: number[] = []

  // Add ALL staking contract calls
  stakingContracts.forEach((stakingContract, contractIndex) => {
    stakingStartIndices[contractIndex] = callIndex

    allCalls.push(
      { contract: stakingContract, functionName: 'totalSupply', params: [] },
      { contract: stakingContract, functionName: 'rewardRate', params: [] },
      { contract: stakingContract, functionName: 'periodFinish', params: [] },
      { contract: stakingContract, functionName: 'balanceOf', params: userAddress ? [userAddress] : ['0x0000000000000000000000000000000000000000'] },
      { contract: stakingContract, functionName: 'earned', params: userAddress ? [userAddress] : ['0x0000000000000000000000000000000000000000'] }
    )
    callIndex += 5
  })

  contractLogger.debug(`🚀 Executing SINGLE multicall with ${allCalls.length} total calls (${pairAddresses.length} pairs + ${stakingContracts.length} staking contracts)`)

  // Execute ONE multicall for everything
  const allResults = await multicall.batchContractCalls(allCalls)

  contractLogger.debug(`✅ Single multicall completed! Got ${allResults.length} results`)

  // Parse results back into the expected format
  const liquidityManagerResults = allResults.slice(liquidityManagerStartIndex, liquidityManagerStartIndex + (pairAddresses.length * 3))

  const stakingResults: any[][] = []
  stakingContracts.forEach((_, contractIndex) => {
    const startIndex = stakingStartIndices[contractIndex]
    const contractResults = allResults.slice(startIndex, startIndex + 5)
    stakingResults.push(contractResults)
  })

  contractLogger.debug(`📊 Parsed results: ${liquidityManagerResults.length} LiquidityManager, ${stakingResults.length} staking contracts`)

  return {
    liquidityManagerResults,
    stakingResults
  }
}
