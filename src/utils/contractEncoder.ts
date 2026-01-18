import { contractLogger } from '@/lib/logger';
import { ethers } from 'ethers'
import liquidityPoolManagerV2ABI from '@/config/abis/dex/liqudityPoolManagerV2ABI.json'
import treasuryVesterABI from '@/config/abis/dex/treasuryVesterABI.json'

/**
 * Utility functions to encode contract function calls for transactions
 */

export class ContractEncoder {
  private static liquidityManagerInterface = new ethers.utils.Interface(liquidityPoolManagerV2ABI)
  private static treasuryVesterInterface = new ethers.utils.Interface(treasuryVesterABI)

  /**
   * Encode LiquidityPoolManagerV2 function calls
   */
  static encodeLiquidityManagerCall(functionName: string, params: any[] = []): string {
    try {
      return this.liquidityManagerInterface.encodeFunctionData(functionName, params)
    } catch (error) {
      contractLogger.error(`Error encoding ${functionName}:`, error)
      return '0x'
    }
  }

  /**
   * Encode TreasuryVester function calls
   */
  static encodeTreasuryVesterCall(functionName: string, params: any[] = []): string {
    try {
      return this.treasuryVesterInterface.encodeFunctionData(functionName, params)
    } catch (error) {
      contractLogger.error(`Error encoding ${functionName}:`, error)
      return '0x'
    }
  }

  /**
   * Common LiquidityPoolManagerV2 function encoders
   */
  static encodeCalculateAndDistribute(): string {
    return this.encodeLiquidityManagerCall('calculateAndDistribute')
  }

  static encodeCalculateReturns(): string {
    return this.encodeLiquidityManagerCall('calculateReturns')
  }

  static encodeAddWhitelistedPool(pairAddress: string, weight: string): string {
    return this.encodeLiquidityManagerCall('addWhitelistedPool', [pairAddress, weight])
  }

  static encodeRemoveWhitelistedPool(pairAddress: string): string {
    return this.encodeLiquidityManagerCall('removeWhitelistedPool', [pairAddress])
  }

  static encodeActivateFeeSplit(klcSplit: string, kswapSplit: string): string {
    return this.encodeLiquidityManagerCall('activateFeeSplit', [klcSplit, kswapSplit])
  }

  /**
   * Common TreasuryVester function encoders
   */
  static encodeClaim(): string {
    return this.encodeTreasuryVesterCall('claim')
  }

  static encodeSetRecipient(recipient: string): string {
    return this.encodeTreasuryVesterCall('setRecipient', [recipient])
  }

  /**
   * Decode function call data (for debugging)
   */
  static decodeLiquidityManagerCall(data: string): { name: string; args: any[] } | null {
    try {
      const decoded = this.liquidityManagerInterface.parseTransaction({ data })
      return {
        name: decoded.name,
        args: Array.from(decoded.args)
      }
    } catch (error) {
      contractLogger.error('Error decoding liquidity manager call:', error)
      return null
    }
  }

  static decodeTreasuryVesterCall(data: string): { name: string; args: any[] } | null {
    try {
      const decoded = this.treasuryVesterInterface.parseTransaction({ data })
      return {
        name: decoded.name,
        args: Array.from(decoded.args)
      }
    } catch (error) {
      contractLogger.error('Error decoding treasury vester call:', error)
      return null
    }
  }
}

/**
 * Helper function to estimate gas for contract calls
 */
export async function estimateContractGas(
  provider: ethers.providers.Provider,
  to: string,
  data: string,
  from?: string
): Promise<ethers.BigNumber> {
  try {
    const gasEstimate = await provider.estimateGas({
      to,
      data,
      from
    })
    
    // Add 20% buffer for safety
    return gasEstimate.mul(120).div(100)
  } catch (error) {
    contractLogger.error('Error estimating gas:', error)
    // Return a reasonable default gas limit
    return ethers.BigNumber.from('200000')
  }
}

/**
 * Helper function to get current gas price
 */
export async function getCurrentGasPrice(provider: ethers.providers.Provider): Promise<ethers.BigNumber> {
  try {
    const gasPrice = await provider.getGasPrice()
    // Add 10% buffer for faster confirmation
    return gasPrice.mul(110).div(100)
  } catch (error) {
    contractLogger.error('Error getting gas price:', error)
    // Return a reasonable default (20 gwei)
    return ethers.utils.parseUnits('20', 'gwei')
  }
}
