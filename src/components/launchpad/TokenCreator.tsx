'use client';

import { launchpadLogger } from '@/lib/logger';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Info,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Wallet
} from 'lucide-react';

// Contract configuration imports
import {
  getContractAddress,
  DEFAULT_CHAIN_ID,
  CONTRACT_FEES,
  MAINNET_CONTRACTS
} from '@/config/contracts';
import {
  STANDARD_TOKEN_FACTORY_ABI,
  LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI
} from '@/config/abis';

// Wagmi imports for contract interaction
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, getContract, encodeFunctionData } from 'viem';
import { internalWalletUtils } from '@/connectors/internalWallet';

interface TokenFormData {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  // Advanced token fields for LiquidityGeneratorTokenFactory
  router?: string;
  charity?: string;
  taxFeeBps?: string;
  liquidityFeeBps?: string;
  charityBps?: string;
}

// Contract parameter interfaces
interface StandardTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

interface LiquidityGeneratorTokenParams {
  name: string;
  symbol: string;
  totalSupply: string;
  router: string;
  charity: string;
  taxFeeBps: number;
  liquidityFeeBps: number;
  charityBps: number;
}

// Helper function to check if using internal wallet
const isUsingInternalWallet = (connector: any) => {
  return connector?.id === 'kalyswap-internal';
};

// Helper function to prompt for password (same as staking)
const promptForPassword = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
        <p class="text-sm text-gray-600 mb-4">Enter your internal wallet password to authorize this token creation transaction.</p>
        <input
          type="password"
          placeholder="Enter your wallet password"
          class="w-full p-3 border rounded-lg mb-4 password-input"
          autofocus
        />
        <div class="flex gap-2">
          <button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg confirm-btn">Confirm</button>
          <button class="flex-1 px-4 py-2 bg-gray-200 rounded-lg cancel-btn">Cancel</button>
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
    });

    document.body.appendChild(modal);
  });
};

export default function TokenCreator() {
  // Wagmi hooks for wallet interaction
  const { address, isConnected, connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [activeTokenType, setActiveTokenType] = useState('standard');
  const [formData, setFormData] = useState<TokenFormData>({
    name: '',
    symbol: '',
    decimals: '18',
    totalSupply: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'idle' | 'creating' | 'complete'>('idle');
  const [actualFee, setActualFee] = useState<string | null>(null);

  // Fetch actual fee from contract
  const fetchActualFee = async () => {
    if (!publicClient) return;

    try {
      const factoryAddress = activeTokenType === 'standard'
        ? getContractAddress('STANDARD_TOKEN_FACTORY', DEFAULT_CHAIN_ID)
        : getContractAddress('LIQUIDITY_GENERATOR_TOKEN_FACTORY', DEFAULT_CHAIN_ID);

      const factoryABI = activeTokenType === 'standard'
        ? STANDARD_TOKEN_FACTORY_ABI
        : LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI;

      const factoryContract = getContract({
        address: factoryAddress as `0x${string}`,
        abi: factoryABI,
        client: publicClient,
      });

      const fee = await factoryContract.read.flatFee([]);
      const feeInKLC = parseFloat((Number(fee) / 1e18).toFixed(6));
      setActualFee(feeInKLC.toString());
    } catch (error) {
      launchpadLogger.warn('Failed to fetch actual fee from contract:', error);
      // Fallback to configured fee
      setActualFee(activeTokenType === 'standard' ? CONTRACT_FEES.STANDARD_TOKEN : CONTRACT_FEES.LIQUIDITY_GENERATOR_TOKEN);
    }
  };

  // Fetch fee when component mounts or when publicClient/activeTokenType changes
  React.useEffect(() => {
    if (publicClient) {
      fetchActualFee();
    }
  }, [publicClient, activeTokenType]);

  // Auto-populate router address for Liquidity Generator tokens
  React.useEffect(() => {
    if (activeTokenType === 'liquidity-generator' && !formData.router) {
      const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);
      setFormData(prev => ({
        ...prev,
        router: routerAddress
      }));
    }
  }, [activeTokenType]);

  const handleInputChange = (field: keyof TokenFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Token name is required';
    if (!formData.symbol.trim()) return 'Token symbol is required';
    if (!formData.totalSupply.trim()) return 'Total supply is required';
    if (isNaN(Number(formData.totalSupply)) || Number(formData.totalSupply) <= 0) {
      return 'Total supply must be a positive number';
    }
    if (isNaN(Number(formData.decimals)) || Number(formData.decimals) < 0 || Number(formData.decimals) > 18) {
      return 'Decimals must be between 0 and 18';
    }

    // Additional validation for LiquidityGeneratorToken
    if (activeTokenType === 'liquidity-generator') {
      if (!formData.router?.trim()) return 'Router address is required for Liquidity Generator tokens';
      if (!formData.charity?.trim()) return 'Charity address is required for Liquidity Generator tokens';

      const taxFee = Number(formData.taxFeeBps || 0);
      const liquidityFee = Number(formData.liquidityFeeBps || 0);
      const charityFee = Number(formData.charityBps || 0);

      if (taxFee < 0 || taxFee > 2500) return 'Tax fee must be between 0 and 2500 BPS';
      if (liquidityFee < 0 || liquidityFee > 2500) return 'Liquidity fee must be between 0 and 2500 BPS';
      if (charityFee < 0 || charityFee > 2500) return 'Charity fee must be between 0 and 2500 BPS';

      const totalFees = taxFee + liquidityFee + charityFee;
      if (totalFees > 2500) return 'Total fees cannot exceed 2500 BPS (25%)';
    }

    return null;
  };

  // Helper functions to format contract parameters
  const formatStandardTokenParams = (): StandardTokenParams => {
    return {
      name: formData.name,
      symbol: formData.symbol,
      decimals: Number(formData.decimals),
      totalSupply: formData.totalSupply
    };
  };

  const formatLiquidityGeneratorTokenParams = (): LiquidityGeneratorTokenParams => {
    return {
      name: formData.name,
      symbol: formData.symbol,
      totalSupply: formData.totalSupply,
      router: formData.router || '',
      charity: formData.charity || '',
      taxFeeBps: Number(formData.taxFeeBps || 0),
      liquidityFeeBps: Number(formData.liquidityFeeBps || 0),
      charityBps: Number(formData.charityBps || 0)
    };
  };

  const handleCreateToken = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected || !address || !walletClient || !publicClient) {
      setError('Please connect your wallet to create a token');
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setCurrentStep('creating');

      // Get contract parameters and addresses based on token type
      const factoryAddress = activeTokenType === 'standard'
        ? getContractAddress('STANDARD_TOKEN_FACTORY', DEFAULT_CHAIN_ID)
        : getContractAddress('LIQUIDITY_GENERATOR_TOKEN_FACTORY', DEFAULT_CHAIN_ID);

      const factoryABI = activeTokenType === 'standard'
        ? STANDARD_TOKEN_FACTORY_ABI
        : LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI;

      // Get actual fee from contract
      const factoryContract = getContract({
        address: factoryAddress as `0x${string}`,
        abi: factoryABI,
        client: publicClient,
      });

      const contractFee = await factoryContract.read.flatFee([]);
      const creationFee = contractFee as bigint;

      // Step 1: Create the token
      launchpadLogger.debug(`🚀 Creating ${activeTokenType === 'standard' ? 'Standard' : 'Liquidity Generator'} Token:`, {
        address: factoryAddress,
        function: 'create',
        fee: `${(Number(creationFee) / 1e18).toFixed(6)} KLC`
      });

      launchpadLogger.debug('📝 Deploying token contract...');

      let hash: `0x${string}`;

      if (isUsingInternalWallet(connector)) {
        // For internal wallets, use direct GraphQL call
        const internalWalletState = internalWalletUtils.getState();
        if (!internalWalletState.activeWallet) {
          throw new Error('No internal wallet connected');
        }

        // Get password from user
        const password = await promptForPassword();
        if (!password) {
          throw new Error('Password required for token creation transaction');
        }

        // Encode the function call
        let functionData: `0x${string}`;
        let gasLimit: string;

        if (activeTokenType === 'standard') {
          const contractParams = formatStandardTokenParams();
          functionData = encodeFunctionData({
            abi: STANDARD_TOKEN_FACTORY_ABI,
            functionName: 'create',
            args: [
              contractParams.name,
              contractParams.symbol,
              contractParams.decimals,
              BigInt(contractParams.totalSupply),
            ],
          });
          gasLimit = '2000000';
        } else {
          const contractParams = formatLiquidityGeneratorTokenParams();
          const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);
          functionData = encodeFunctionData({
            abi: LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI,
            functionName: 'create',
            args: [
              contractParams.name,
              contractParams.symbol,
              BigInt(contractParams.totalSupply),
              routerAddress,
              contractParams.charity as `0x${string}`,
              contractParams.taxFeeBps,
              contractParams.liquidityFeeBps,
              contractParams.charityBps,
            ],
          });
          gasLimit = '6500000';
        }

        // Make GraphQL call to backend
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('Authentication required');
        }

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
                toAddress: factoryAddress,
                value: creationFee.toString(),
                data: functionData,
                password: password,
                chainId: internalWalletState.activeWallet.chainId,
                gasLimit: gasLimit
              }
            }
          }),
        });

        const result = await response.json();
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        hash = result.data.sendContractTransaction.hash;
      } else {
        // For external wallets, use the existing walletClient method
        if (!walletClient) {
          throw new Error('External wallet not available for transaction signing');
        }

        if (activeTokenType === 'standard') {
          const contractParams = formatStandardTokenParams();
          hash = await walletClient.writeContract({
            address: factoryAddress as `0x${string}`,
            abi: STANDARD_TOKEN_FACTORY_ABI,
            functionName: 'create',
            args: [
              contractParams.name,
              contractParams.symbol,
              contractParams.decimals,
              BigInt(contractParams.totalSupply),
            ],
            value: creationFee,
            gas: BigInt(2000000), // Gas limit for standard token
          });
        } else {
          const contractParams = formatLiquidityGeneratorTokenParams();
          const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);

          hash = await walletClient.writeContract({
            address: factoryAddress as `0x${string}`,
            abi: LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI,
            functionName: 'create',
            args: [
              contractParams.name,
              contractParams.symbol,
              BigInt(contractParams.totalSupply),
              routerAddress, // Use configured router address
              contractParams.charity as `0x${string}`,
              contractParams.taxFeeBps,
              contractParams.liquidityFeeBps,
              contractParams.charityBps,
            ],
            value: creationFee,
            gas: BigInt(6500000), // Higher gas limit for liquidity generator token
          });
        }
      }

      launchpadLogger.debug(`📝 Transaction hash: ${hash}`);
      launchpadLogger.debug('⏳ Waiting for transaction confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      launchpadLogger.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

      // Step 2: Parse token address from events
      let tokenAddress: string | null = null;

      // Parse the TokenCreated event to get the token address
      // Standard Token: TokenCreated(address indexed tokenAddress, address indexed creator, string name, string symbol, uint8 decimals, uint256 totalSupply)
      // Liquidity Generator: TokenCreated(address indexed owner, address indexed token, uint8 tokenType, uint256 version)
      for (const log of receipt.logs) {
        try {
          if (log.topics.length >= 2) {
            // Check if this is a TokenCreated event by looking at the factory address
            if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
              if (activeTokenType === 'standard') {
                // For Standard Token: token address is in topics[1] (first indexed parameter)
                const addressHex = log.topics[1];
                if (addressHex && addressHex.length >= 42) {
                  tokenAddress = `0x${addressHex.slice(-40)}`;
                  launchpadLogger.debug(`Found standard token address from event: ${tokenAddress}`);
                  break;
                }
              } else {
                // For Liquidity Generator: token address is in topics[2] (second indexed parameter)
                const addressHex = log.topics[2];
                if (addressHex && addressHex.length >= 42) {
                  tokenAddress = `0x${addressHex.slice(-40)}`;
                  launchpadLogger.debug(`Found liquidity generator token address from event: ${tokenAddress}`);
                  break;
                }
              }
            }
          }
        } catch (error) {
          launchpadLogger.warn('Error parsing log:', error);
        }
      }

      if (!tokenAddress) {
        throw new Error('Could not determine token address from transaction logs');
      }

      launchpadLogger.debug(`🎉 Token created at: ${tokenAddress}`);
      setCreatedToken(tokenAddress);
      setCurrentStep('complete');

      // Reset form only after successful completion
      setFormData({
        name: '',
        symbol: '',
        decimals: '18',
        totalSupply: ''
      });

    } catch (err) {
      launchpadLogger.error('❌ Error creating token:', err);
      setError(err instanceof Error ? err.message : 'Failed to create token');
      setCurrentStep('idle');
    } finally {
      setIsCreating(false);
    }
  };

  const getCreationFee = () => {
    if (activeTokenType === 'standard' && actualFee) {
      return actualFee;
    }
    return activeTokenType === 'standard'
      ? CONTRACT_FEES.STANDARD_TOKEN
      : CONTRACT_FEES.LIQUIDITY_GENERATOR_TOKEN;
  };

  const getContractAddressForType = () => {
    return activeTokenType === 'standard'
      ? getContractAddress('STANDARD_TOKEN_FACTORY', DEFAULT_CHAIN_ID)
      : getContractAddress('LIQUIDITY_GENERATOR_TOKEN_FACTORY', DEFAULT_CHAIN_ID);
  };

  const getContractABIForType = () => {
    return activeTokenType === 'standard'
      ? STANDARD_TOKEN_FACTORY_ABI
      : LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI;
  };

  return (
    <div className="space-y-6">
      {/* Token Type Selection */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Coins className="h-5 w-5" />
            Choose Token Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTokenType} onValueChange={setActiveTokenType}>
            <TabsList className="grid w-full grid-cols-2 launchpad-tabs">
              <TabsTrigger value="standard" className="launchpad-tab">Standard Token</TabsTrigger>
              <TabsTrigger value="liquidity-generator" className="launchpad-tab">Liquidity Generator</TabsTrigger>
            </TabsList>

            <TabsContent value="standard" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-white mb-1">Standard ERC20 Token</h4>
                    <p className="text-sm text-gray-300">
                      Create a basic ERC20 token with standard functionality. Perfect for simple use cases and testing.
                    </p>
                    <div className="mt-2">
                      <Badge className="badge-upcoming text-xs">
                        Fee: {getCreationFee()} KLC
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="liquidity-generator" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-white mb-1">Liquidity Generator Token</h4>
                    <p className="text-sm text-gray-300">
                      Advanced token with automatic liquidity generation, configurable fees, and charity donations.
                      Features reflection mechanisms and automatic DEX integration.
                    </p>
                    <div className="mt-2">
                      <Badge className="badge-presale text-xs">
                        Fee: {getCreationFee()} KLC
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Token Creation Form */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="text-white">Token Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Token Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-300">Token Name *</Label>
              <Input
                id="name"
                placeholder="e.g., My Awesome Token"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol" className="text-gray-300">Token Symbol *</Label>
              <Input
                id="symbol"
                placeholder="e.g., MAT"
                value={formData.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="decimals" className="text-gray-300">Decimals</Label>
              <Select value={formData.decimals} onValueChange={(value) => handleInputChange('decimals', value)}>
                <SelectTrigger className="h-12 form-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="select-content">
                  {[...Array(19)].map((_, i) => (
                    <SelectItem key={i} value={i.toString()} className="select-item">
                      {i} {i === 18 ? '(Recommended)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalSupply" className="text-gray-300">Total Supply *</Label>
              <Input
                id="totalSupply"
                placeholder="e.g., 1000000"
                value={formData.totalSupply}
                onChange={(e) => handleInputChange('totalSupply', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          {/* Advanced Settings for Liquidity Generator Token */}
          {activeTokenType === 'liquidity-generator' && (
            <div className="space-y-6 pt-6 border-t border-blue-500/20">
              <h3 className="text-lg font-medium text-white">Advanced Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="router" className="text-gray-300">Router Address</Label>
                  <Input
                    id="router"
                    placeholder="0x..."
                    value={formData.router || ''}
                    onChange={(e) => handleInputChange('router', e.target.value)}
                    className="h-12 form-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="charity" className="text-gray-300">Charity Address</Label>
                  <Input
                    id="charity"
                    placeholder="0x..."
                    value={formData.charity || ''}
                    onChange={(e) => handleInputChange('charity', e.target.value)}
                    className="h-12 form-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxFeeBps" className="text-gray-300">Tax Fee (BPS)</Label>
                  <Input
                    id="taxFeeBps"
                    placeholder="e.g., 100 (1%)"
                    value={formData.taxFeeBps || ''}
                    onChange={(e) => handleInputChange('taxFeeBps', e.target.value)}
                    className="h-12 form-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="liquidityFeeBps" className="text-gray-300">Liquidity Fee (BPS)</Label>
                  <Input
                    id="liquidityFeeBps"
                    placeholder="e.g., 200 (2%)"
                    value={formData.liquidityFeeBps || ''}
                    onChange={(e) => handleInputChange('liquidityFeeBps', e.target.value)}
                    className="h-12 form-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="charityBps" className="text-gray-300">Charity Fee (BPS)</Label>
                  <Input
                    id="charityBps"
                    placeholder="e.g., 50 (0.5%)"
                    value={formData.charityBps || ''}
                    onChange={(e) => handleInputChange('charityBps', e.target.value)}
                    className="h-12 form-input"
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-white mb-1">Fee Configuration</h4>
                  <p className="text-sm text-gray-300">
                    BPS = Basis Points (1 BPS = 0.01%). Total fees should not exceed 25% (2500 BPS).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Error</h4>
                <p className="text-sm text-gray-300">{error}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {createdToken && (
            <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-white mb-1">Token Created Successfully!</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Your token has been deployed to: <code className="bg-green-900/30 px-1 rounded text-green-400">{createdToken}</code>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-400 border-green-500/20 hover:bg-green-500/20"
                  onClick={() => window.open(`https://kalyscan.io/address/${createdToken}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on KalyScan
                </Button>
              </div>
            </div>
          )}

          {/* Creation Fee Info */}
          <div className="flex items-start gap-3 p-4 bg-gray-900/20 border border-gray-500/20 rounded-lg">
            <Wallet className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Creation Fee</h4>
              <p className="text-sm text-gray-300">
                A fee of <strong className="text-white">{getCreationFee()} KLC</strong> is required to create your token.
                This fee covers deployment costs and platform maintenance.
              </p>
            </div>
          </div>

          {/* Progress Display */}
          {isCreating && (
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">Creating Token</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'text-blue-400 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'creating' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>1. Deploy token contract</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Button */}
          <Button
            onClick={handleCreateToken}
            disabled={isCreating || !isConnected}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {currentStep === 'creating' && 'Creating Token...'}
                {currentStep === 'idle' && 'Preparing...'}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet to Create Token
              </>
            ) : (
              <>
                <Coins className="h-4 w-4 mr-2" />
                Create Token ({getCreationFee()} KLC)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
