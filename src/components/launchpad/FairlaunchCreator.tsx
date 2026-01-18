'use client';

import { CHAIN_IDS } from '@/config/chains';

import { launchpadLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  Info,
  AlertTriangle,
  CheckCircle,
  Calendar,
  DollarSign,
  Target,
  Users,
  Wallet,
  Shield,
  Globe,
  FileText,
  Github,
  MessageCircle,
  Send,
  Twitter,
  Building
} from 'lucide-react';

// Contract configuration imports
import {
  getContractAddress,
  DEFAULT_CHAIN_ID,
  CONTRACT_FEES,
  BASE_TOKENS
} from '@/config/contracts';
import { FAIRLAUNCH_FACTORY_ABI, FAIRLAUNCH_ABI, ERC20_ABI } from '@/config/abis';

// Wagmi imports for contract interaction
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, getContract, parseEther, encodeFunctionData } from 'viem';
import { internalWalletUtils } from '@/connectors/internalWallet';

// Auth hook for checking login status
import { useAuth } from '@/hooks/useAuth';

// React DatePicker for cross-browser datetime support
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/styles/datepicker-dark.css';

// GraphQL mutation for saving confirmed fairlaunch projects
const SAVE_FAIRLAUNCH_AFTER_DEPLOYMENT = `
  mutation SaveFairlaunchAfterDeployment($input: FairlaunchDeploymentInput!) {
    saveFairlaunchAfterDeployment(input: $input) {
      id
      name
      description
      contractAddress
      transactionHash
      blockNumber
      deployedAt
      createdAt
      user {
        id
        username
      }
    }
  }
`;

// LocalStorage key for draft data
const FAIRLAUNCH_DRAFT_KEY = 'fairlaunch_draft_data';

interface FairlaunchFormData {
  // Project Information
  projectName: string;          // Required - Project/token name
  projectDescription: string;   // Required - Brief project overview (max 500 chars)
  websiteUrl: string;          // Optional - Official project website
  whitepaperUrl: string;       // Optional - Whitepaper/documentation link
  githubUrl: string;           // Optional - GitHub repository
  discordUrl: string;          // Optional - Discord community invite
  telegramUrl: string;         // Optional - Telegram community link
  twitterUrl: string;          // Optional - Twitter/X profile
  additionalSocialUrl: string; // Optional - Other social platforms

  // Fairlaunch Configuration
  saleToken: string;
  baseToken: string;
  isNative: boolean;
  buybackRate: string;        // _buybackRate parameter
  sellingAmount: string;      // _sellingAmount parameter
  softCap: string;
  liquidityPercent: string;
  fairlaunchStart: string;
  fairlaunchEnd: string;
}

// Contract parameter interface matching FairlaunchFactory ABI
interface FairlaunchContractParams {
  saleToken: string;
  baseToken: string;
  isNative: boolean;
  buybackRate: string;
  isWhitelist: boolean;
  sellingAmount: string;
  softCap: string;
  liquidityPercent: string;
  fairlaunchStart: number;    // Unix timestamp
  fairlaunchEnd: number;      // Unix timestamp
  referrer: string;
}

// Helper function to check if using internal wallet
const isUsingInternalWallet = (connector: any) => {
  return connector?.id === 'kalyswap-internal';
};

// Helper function to prompt for password
const promptForPassword = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
        <p class="text-sm text-gray-600 mb-4">Enter your internal wallet password to authorize this fairlaunch transaction.</p>
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

// Helper function for internal wallet contract calls
const executeContractCall = async (
  connector: any,
  contractAddress: string,
  abi: any,
  functionName: string,
  args: any[],
  value: string = '0',
  gasLimit: string = '200000'
): Promise<`0x${string}`> => {
  if (isUsingInternalWallet(connector)) {
    // For internal wallets, use direct GraphQL call
    const internalWalletState = internalWalletUtils.getState();
    if (!internalWalletState.activeWallet) {
      throw new Error('No internal wallet connected');
    }

    // Get password from user
    const password = await promptForPassword();
    if (!password) {
      throw new Error('Password required for transaction');
    }

    // Encode the function call
    const functionData = encodeFunctionData({
      abi,
      functionName,
      args,
    });

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
            toAddress: contractAddress,
            value,
            data: functionData,
            password: password,
            chainId: internalWalletState.activeWallet.chainId,
            gasLimit
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
    throw new Error('This function should only be called for internal wallets');
  }
};

export default function FairlaunchCreator() {
  // Auth hook for checking login status
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  // Wagmi hooks for wallet interaction
  const { address, isConnected, connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [formData, setFormData] = useState<FairlaunchFormData>({
    // Project Information
    projectName: '',
    projectDescription: '',
    websiteUrl: '',
    whitepaperUrl: '',
    githubUrl: '',
    discordUrl: '',
    telegramUrl: '',
    twitterUrl: '',
    additionalSocialUrl: '',

    // Fairlaunch Configuration
    saleToken: '',
    baseToken: 'native', // KLC
    isNative: true,
    buybackRate: '',
    sellingAmount: '',
    softCap: '',
    liquidityPercent: '100', // Fairlaunch typically uses 100%
    fairlaunchStart: '',
    fairlaunchEnd: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdFairlaunch, setCreatedFairlaunch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProject, setSavedProject] = useState<any | null>(null);
  const [isSavingToDatabase, setIsSavingToDatabase] = useState(false);

  // New state for token approval and creation steps
  const [isApproving, setIsApproving] = useState(false);
  const [isSettingRouter, setIsSettingRouter] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'creating' | 'setting-router' | 'saving' | 'complete'>('idle');

  // Load draft data from localStorage on component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(FAIRLAUNCH_DRAFT_KEY);
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft);
        launchpadLogger.debug('📝 Loaded fairlaunch draft data from localStorage');
      } catch (error) {
        launchpadLogger.error('Error loading fairlaunch draft data:', error);
        localStorage.removeItem(FAIRLAUNCH_DRAFT_KEY);
      }
    }
  }, []);

  const handleInputChange = (field: keyof FairlaunchFormData, value: string | boolean) => {
    const updatedFormData = {
      ...formData,
      [field]: value
    };

    setFormData(updatedFormData);

    // Save to localStorage as draft (blockchain-first approach - no database until confirmed)
    localStorage.setItem(FAIRLAUNCH_DRAFT_KEY, JSON.stringify(updatedFormData));
  };

  // Helper function to get token information (decimals, symbol)
  const getTokenInfo = async (tokenAddress: string) => {
    if (!publicClient) throw new Error('Public client not available');

    const tokenContract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      client: publicClient,
    });

    try {
      const [decimals, symbol] = await Promise.all([
        tokenContract.read.decimals([]),
        tokenContract.read.symbol([]),
      ]);

      return { decimals: Number(decimals), symbol: String(symbol) };
    } catch (error) {
      throw new Error(`Failed to get token information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper function to check token allowance
  const checkTokenAllowance = async (tokenAddress: string, spenderAddress: string) => {
    if (!publicClient || !address) throw new Error('Wallet not connected');

    const tokenContract = getContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      client: publicClient,
    });

    try {
      const allowance = await tokenContract.read.allowance([address, spenderAddress]);
      return BigInt((allowance as bigint).toString());
    } catch (error) {
      throw new Error(`Failed to check token allowance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Helper function to approve tokens
  const approveTokens = async (tokenAddress: string, spenderAddress: string, amount: bigint) => {
    if (!address) throw new Error('Wallet not connected');

    try {
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
          throw new Error('Password required for token approval transaction');
        }

        // Encode the approve function call
        const functionData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spenderAddress, amount],
        });

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
                toAddress: tokenAddress,
                value: '0',
                data: functionData,
                password: password,
                chainId: internalWalletState.activeWallet.chainId,
                gasLimit: '100000'
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

        hash = await walletClient.writeContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spenderAddress, amount],
        });
      }

      // Wait for transaction confirmation
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      return receipt;
    } catch (error) {
      throw new Error(`Failed to approve tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Save fairlaunch project to database after successful blockchain deployment
  const saveFairlaunchToDatabase = async (contractAddress: string, transactionHash: string, blockNumber: number) => {
    try {
      setIsSavingToDatabase(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required to save fairlaunch project');
      }

      const projectInput = {
        // Project Information
        name: formData.projectName,
        description: formData.projectDescription,
        websiteUrl: formData.websiteUrl || null,
        whitepaperUrl: formData.whitepaperUrl || null,
        githubUrl: formData.githubUrl || null,
        discordUrl: formData.discordUrl || null,
        telegramUrl: formData.telegramUrl || null,
        twitterUrl: formData.twitterUrl || null,
        additionalSocialUrl: formData.additionalSocialUrl || null,

        // Fairlaunch Configuration
        saleToken: formData.saleToken,
        baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
        buybackRate: formData.buybackRate,
        sellingAmount: formData.sellingAmount,
        softCap: formData.softCap,
        liquidityPercent: formData.liquidityPercent,
        fairlaunchStart: new Date(formData.fairlaunchStart).toISOString(),
        fairlaunchEnd: new Date(formData.fairlaunchEnd).toISOString(),
        isWhitelist: false, // Disabled for v3 - will be enabled in future version
        referrer: null, // Disabled for v3 - will be enabled in future version

        // Required Blockchain Data
        contractAddress,
        transactionHash,
        blockNumber
      };

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: SAVE_FAIRLAUNCH_AFTER_DEPLOYMENT,
          variables: {
            input: projectInput
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const savedProject = result.data.saveFairlaunchAfterDeployment;
      setSavedProject(savedProject);

      // Clear draft data from localStorage after successful save
      localStorage.removeItem(FAIRLAUNCH_DRAFT_KEY);

      launchpadLogger.debug('✅ Fairlaunch project saved to database:', savedProject);
      return savedProject;
    } catch (error) {
      launchpadLogger.error('❌ Error saving fairlaunch project to database:', error);
      throw error;
    } finally {
      setIsSavingToDatabase(false);
    }
  };

  // Helper function to validate URL format
  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Empty URLs are valid (optional fields)
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateForm = () => {
    // Validate project information
    if (!formData.projectName.trim()) return 'Project name is required';
    if (!formData.projectDescription.trim()) return 'Project description is required';
    if (formData.projectDescription.length > 500) return 'Project description must be 500 characters or less';

    // Validate URLs
    if (!isValidUrl(formData.websiteUrl)) return 'Invalid website URL format';
    if (!isValidUrl(formData.whitepaperUrl)) return 'Invalid whitepaper URL format';
    if (!isValidUrl(formData.githubUrl)) return 'Invalid GitHub URL format';
    if (!isValidUrl(formData.discordUrl)) return 'Invalid Discord URL format';
    if (!isValidUrl(formData.telegramUrl)) return 'Invalid Telegram URL format';
    if (!isValidUrl(formData.twitterUrl)) return 'Invalid Twitter URL format';
    if (!isValidUrl(formData.additionalSocialUrl)) return 'Invalid additional social URL format';

    // Validate fairlaunch configuration
    if (!formData.saleToken.trim()) return 'Sale token address is required';
    if (!formData.buybackRate.trim()) return 'Token distribution rate is required';
    if (!formData.sellingAmount.trim()) return 'Selling amount is required';
    if (!formData.softCap.trim()) return 'Soft cap is required';
    if (!formData.fairlaunchStart.trim()) return 'Fairlaunch start time is required';
    if (!formData.fairlaunchEnd.trim()) return 'Fairlaunch end time is required';

    // Validate numeric values
    const buybackRate = Number(formData.buybackRate);
    const sellingAmount = Number(formData.sellingAmount);
    const softCap = Number(formData.softCap);

    if (buybackRate <= 0) return 'Token distribution rate must be greater than 0';
    if (sellingAmount <= 0) return 'Selling amount must be greater than 0';
    if (softCap <= 0) return 'Soft cap must be greater than 0';

    // Validate timestamps
    const startTime = new Date(formData.fairlaunchStart).getTime();
    const endTime = new Date(formData.fairlaunchEnd).getTime();
    const now = Date.now();

    if (startTime <= now) return 'Fairlaunch start time must be in the future';
    if (endTime <= startTime) return 'Fairlaunch end time must be after start time';

    // Validate liquidity percentage (fairlaunch should be 100%)
    const liquidityPercent = Number(formData.liquidityPercent);
    if (liquidityPercent !== 100) {
      return 'Fairlaunch requires 100% liquidity percentage';
    }

    return null; // No validation errors
  };

  // Helper function to format contract parameters according to FairlaunchFactory ABI
  const formatFairlaunchContractParams = (): FairlaunchContractParams => {
    return {
      saleToken: formData.saleToken,
      baseToken: formData.baseToken === 'native' ? '0x0000000000000000000000000000000000000000' : formData.baseToken,
      isNative: formData.isNative,
      buybackRate: formData.buybackRate,
      isWhitelist: false, // Disabled for v3 - will be enabled in future version
      sellingAmount: formData.sellingAmount,
      softCap: formData.softCap,
      liquidityPercent: formData.liquidityPercent,
      fairlaunchStart: Math.floor(new Date(formData.fairlaunchStart).getTime() / 1000),
      fairlaunchEnd: Math.floor(new Date(formData.fairlaunchEnd).getTime() / 1000),
      referrer: '0x0000000000000000000000000000000000000000' // Disabled for v3 - will be enabled in future version
    };
  };

  const handleCreateFairlaunch = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isConnected || !address || !walletClient || !publicClient) {
      setError('Please connect your wallet to create a fairlaunch');
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      setCurrentStep('idle');

      launchpadLogger.debug('🚀 Starting fairlaunch creation process...');

      // Step 1: Get token information
      launchpadLogger.debug('📋 Getting token information...');
      const tokenInfo = await getTokenInfo(formData.saleToken);
      setTokenDecimals(tokenInfo.decimals);
      setTokenSymbol(tokenInfo.symbol);

      launchpadLogger.debug(`Token: ${tokenInfo.symbol}, Decimals: ${tokenInfo.decimals}`);

      // Step 2: Calculate required token amounts with proper decimals
      const sellingAmountWithDecimals = parseUnits(formData.sellingAmount, tokenInfo.decimals);
      const liquidityPercent = BigInt(formData.liquidityPercent);
      const liquidityAmount = (sellingAmountWithDecimals * liquidityPercent) / BigInt(100);
      const requiredTokens = sellingAmountWithDecimals + liquidityAmount;

      launchpadLogger.debug(`Required tokens: ${formatUnits(requiredTokens, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Selling: ${formatUnits(sellingAmountWithDecimals, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      launchpadLogger.debug(`- Liquidity: ${formatUnits(liquidityAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`);

      const factoryAddress = getFairlaunchFactoryAddress();

      // Step 3: Check and handle token approval
      setCurrentStep('approving');
      setIsApproving(true);

      launchpadLogger.debug('🔍 Checking token allowance...');
      const currentAllowance = await checkTokenAllowance(formData.saleToken, factoryAddress);

      if (currentAllowance < requiredTokens) {
        launchpadLogger.debug(`💰 Approving ${formatUnits(requiredTokens, tokenInfo.decimals)} ${tokenInfo.symbol}...`);
        await approveTokens(formData.saleToken, factoryAddress, requiredTokens);
        launchpadLogger.debug('✅ Token approval confirmed');
      } else {
        launchpadLogger.debug('✅ Sufficient token allowance already exists');
      }

      setIsApproving(false);

      // Step 4: Create fairlaunch
      setCurrentStep('creating');
      launchpadLogger.debug('🏗️ Creating fairlaunch contract...');

      const contractParams = formatFairlaunchContractParams();
      const creationFee = parseEther(getCreationFee());

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
          throw new Error('Password required for fairlaunch creation transaction');
        }

        // Encode the createFairlaunch function call
        const functionData = encodeFunctionData({
          abi: FAIRLAUNCH_FACTORY_ABI,
          functionName: 'createFairlaunch',
          args: [
            contractParams.saleToken,
            contractParams.baseToken,
            contractParams.isNative,
            BigInt(contractParams.buybackRate),
            contractParams.isWhitelist,
            sellingAmountWithDecimals, // Use properly formatted amount
            parseEther(contractParams.softCap),
            BigInt(contractParams.liquidityPercent),
            BigInt(contractParams.fairlaunchStart),
            BigInt(contractParams.fairlaunchEnd),
            contractParams.referrer,
          ],
        });

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
                gasLimit: '8000000'
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

        hash = await walletClient.writeContract({
          address: factoryAddress as `0x${string}`,
          abi: FAIRLAUNCH_FACTORY_ABI,
          functionName: 'createFairlaunch',
          args: [
            contractParams.saleToken,
            contractParams.baseToken,
            contractParams.isNative,
            BigInt(contractParams.buybackRate),
            contractParams.isWhitelist,
            sellingAmountWithDecimals, // Use properly formatted amount
            parseEther(contractParams.softCap),
            BigInt(contractParams.liquidityPercent),
            BigInt(contractParams.fairlaunchStart),
            BigInt(contractParams.fairlaunchEnd),
            contractParams.referrer,
          ],
          value: creationFee,
          gas: BigInt(8000000), // Explicit gas limit like in test script
        });
      }

      launchpadLogger.debug(`📝 Transaction hash: ${hash}`);
      launchpadLogger.debug('⏳ Waiting for transaction confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      launchpadLogger.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

      // Step 5: Parse fairlaunch address from events
      let fairlaunchAddress: string | null = null;

      // Parse the FairlaunchCreated event to get the fairlaunch address
      // Event signature: FairlaunchCreated(address indexed creator, address indexed fairlaunch, address indexed saleToken, address baseToken, bool isNative, uint256 sellingAmount, uint256 softCap)
      const fairlaunchCreatedTopic = '0x' + Array.from('FairlaunchCreated(address,address,address,address,bool,uint256,uint256)')
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');

      for (const log of receipt.logs) {
        try {
          if (log.topics.length >= 3) {
            // Check if this is a FairlaunchCreated event by looking at the factory address
            if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
              // The fairlaunch address is in topics[2] (second indexed parameter)
              // Remove the '0x' prefix and pad to get the full address
              const addressHex = log.topics[2];
              if (addressHex && addressHex.length >= 42) {
                fairlaunchAddress = `0x${addressHex.slice(-40)}`;
                launchpadLogger.debug(`Found fairlaunch address from event: ${fairlaunchAddress}`);
                break;
              }
            }
          }
        } catch (error) {
          launchpadLogger.warn('Error parsing log:', error);
        }
      }

      if (!fairlaunchAddress) {
        throw new Error('Could not determine fairlaunch address from transaction logs');
      }

      launchpadLogger.debug(`🎉 Fairlaunch created at: ${fairlaunchAddress}`);
      setCreatedFairlaunch(fairlaunchAddress);

      // Step 6: Set router address
      setCurrentStep('setting-router');
      setIsSettingRouter(true);

      launchpadLogger.debug('🔧 Setting router address...');
      const routerAddress = getContractAddress('ROUTER', DEFAULT_CHAIN_ID);

      let setRouterHash: `0x${string}`;

      if (isUsingInternalWallet(connector)) {
        setRouterHash = await executeContractCall(
          connector,
          fairlaunchAddress,
          FAIRLAUNCH_ABI,
          'setRouter',
          [routerAddress],
          '0',
          '100000'
        );
      } else {
        if (!walletClient) {
          throw new Error('External wallet not available for transaction signing');
        }

        setRouterHash = await walletClient.writeContract({
          address: fairlaunchAddress as `0x${string}`,
          abi: FAIRLAUNCH_ABI,
          functionName: 'setRouter',
          args: [routerAddress],
        });
      }

      await publicClient.waitForTransactionReceipt({ hash: setRouterHash });
      launchpadLogger.debug('✅ Router address set successfully');
      setIsSettingRouter(false);

      // Step 7: Save to database
      setCurrentStep('saving');
      launchpadLogger.debug('💾 Saving fairlaunch project to database...');
      try {
        const savedProject = await saveFairlaunchToDatabase(
          fairlaunchAddress,
          hash,
          Number(receipt.blockNumber)
        );
        launchpadLogger.debug('✅ Fairlaunch project successfully saved to database:', savedProject.id);
      } catch (dbError) {
        launchpadLogger.error('❌ Failed to save to database, but blockchain transaction succeeded:', dbError);
        setError(`Fairlaunch created successfully, but failed to save project details: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }

      setCurrentStep('complete');

      // Reset form only after successful completion
      setFormData({
        projectName: '',
        projectDescription: '',
        websiteUrl: '',
        whitepaperUrl: '',
        githubUrl: '',
        discordUrl: '',
        telegramUrl: '',
        twitterUrl: '',
        additionalSocialUrl: '',
        saleToken: '',
        baseToken: 'native',
        isNative: true,
        buybackRate: '',
        sellingAmount: '',
        softCap: '',
        liquidityPercent: '100',
        fairlaunchStart: '',
        fairlaunchEnd: ''
      });

    } catch (err) {
      launchpadLogger.error('❌ Error creating fairlaunch:', err);
      setError(err instanceof Error ? err.message : 'Failed to create fairlaunch');
      setCurrentStep('idle');
    } finally {
      setIsCreating(false);
      setIsApproving(false);
      setIsSettingRouter(false);
    }
  };

  const getCreationFee = () => {
    return CONTRACT_FEES.FAIRLAUNCH;
  };

  const getFairlaunchFactoryAddress = () => {
    return getContractAddress('FAIRLAUNCH_FACTORY', DEFAULT_CHAIN_ID);
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
        <span className="ml-3 text-gray-300">Checking authentication...</span>
      </div>
    );
  }

  // Show login required message if not authenticated
  if (!isAuthenticated) {
    return (
      <Card className="form-card">
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-amber-500/20 rounded-full">
              <Building className="h-8 w-8 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Account Required</h3>
            <p className="text-gray-300 max-w-md">
              You need to create an account and be logged in to create fairlaunches. This helps us provide better support and enables future features like KYC verification.
            </p>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => window.location.href = '/login'}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Login to Your Account
              </Button>
              <Button
                onClick={() => window.location.href = '/register'}
                variant="outline"
                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              >
                Create Account
              </Button>
            </div>
            <p className="text-sm text-gray-400 mt-4">
              Don't worry - you can still use your MetaMask wallet to sign transactions after logging in.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fairlaunch Info */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Zap className="h-5 w-5" />
            Create Fairlaunch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-orange-900/20 border border-orange-500/20 rounded-lg">
            <Info className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Fairlaunch Campaign</h4>
              <p className="text-sm text-gray-300">
                Launch a fair distribution campaign where token price is determined by total contributions.
                All participants get tokens at the same final rate.
              </p>
              <div className="mt-2 space-x-2">
                <Badge className="badge-fairlaunch text-xs">
                  Fee: {getCreationFee()} KLC
                </Badge>
                <Badge className="badge-fairlaunch text-xs">
                  Fair Distribution
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fairlaunch vs Presale Comparison */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5" />
            Fairlaunch vs Presale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-orange-900/20 border border-orange-500/20 rounded-lg">
              <h4 className="font-medium text-white mb-2">Fairlaunch</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Price determined by total contributions</li>
                <li>• Everyone gets same final rate</li>
                <li>• No early bird advantage</li>
                <li>• 100% liquidity typically</li>
                <li>• More fair distribution</li>
              </ul>
            </div>
            <div className="p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
              <h4 className="font-medium text-white mb-2">Presale</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Fixed token rate</li>
                <li>• First come, first served</li>
                <li>• Early participants get advantage</li>
                <li>• Configurable liquidity %</li>
                <li>• Traditional model</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Information */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Info className="h-5 w-5" />
            Project Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">Project Details</h4>
              <p className="text-sm text-gray-300">
                Provide comprehensive information about your project. This information will be saved to our database
                only after successful fairlaunch deployment on the blockchain.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="projectName" className="flex items-center gap-1 text-gray-300">
                Project Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="projectName"
                placeholder="e.g., KalySwap Protocol"
                value={formData.projectName}
                onChange={(e) => handleInputChange('projectName', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="websiteUrl" className="flex items-center gap-2 text-gray-300">
                <Globe className="h-4 w-4" />
                Website URL
              </Label>
              <Input
                id="websiteUrl"
                placeholder="https://yourproject.com"
                value={formData.websiteUrl}
                onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectDescription" className="flex items-center gap-1 text-gray-300">
              Project Description <span className="text-red-400">*</span>
              <span className="text-xs text-gray-400 ml-auto">
                {formData.projectDescription.length}/500 characters
              </span>
            </Label>
            <Textarea
              id="projectDescription"
              placeholder="Brief overview of your project, its goals, and value proposition..."
              value={formData.projectDescription}
              onChange={(e) => handleInputChange('projectDescription', e.target.value)}
              className="min-h-[100px] resize-none form-input"
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="whitepaperUrl" className="flex items-center gap-2 text-gray-300">
                <FileText className="h-4 w-4" />
                Whitepaper URL
              </Label>
              <Input
                id="whitepaperUrl"
                placeholder="https://docs.yourproject.com/whitepaper"
                value={formData.whitepaperUrl}
                onChange={(e) => handleInputChange('whitepaperUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubUrl" className="flex items-center gap-2 text-gray-300">
                <Github className="h-4 w-4" />
                GitHub URL
              </Label>
              <Input
                id="githubUrl"
                placeholder="https://github.com/yourproject"
                value={formData.githubUrl}
                onChange={(e) => handleInputChange('githubUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="discordUrl" className="flex items-center gap-2 text-gray-300">
                <MessageCircle className="h-4 w-4" />
                Discord URL
              </Label>
              <Input
                id="discordUrl"
                placeholder="https://discord.gg/yourproject"
                value={formData.discordUrl}
                onChange={(e) => handleInputChange('discordUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramUrl" className="flex items-center gap-2 text-gray-300">
                <Send className="h-4 w-4" />
                Telegram URL
              </Label>
              <Input
                id="telegramUrl"
                placeholder="https://t.me/yourproject"
                value={formData.telegramUrl}
                onChange={(e) => handleInputChange('telegramUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="twitterUrl" className="flex items-center gap-2 text-gray-300">
                <Twitter className="h-4 w-4" />
                Twitter URL
              </Label>
              <Input
                id="twitterUrl"
                placeholder="https://twitter.com/yourproject"
                value={formData.twitterUrl}
                onChange={(e) => handleInputChange('twitterUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalSocialUrl" className="text-gray-300">Additional Social URL</Label>
              <Input
                id="additionalSocialUrl"
                placeholder="https://yourproject.medium.com"
                value={formData.additionalSocialUrl}
                onChange={(e) => handleInputChange('additionalSocialUrl', e.target.value)}
                className="h-12 form-input"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fairlaunch Configuration */}
      <Card className="form-card">
        <CardHeader>
          <CardTitle className="text-white">Fairlaunch Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Token Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="saleToken" className="text-gray-300">Sale Token Address *</Label>
                <Input
                  id="saleToken"
                  placeholder="0x..."
                  value={formData.saleToken}
                  onChange={(e) => handleInputChange('saleToken', e.target.value)}
                  className="h-12 form-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseToken" className="text-gray-300">Base Token</Label>
                <Select
                  value={formData.baseToken}
                  onValueChange={(value) => {
                    handleInputChange('baseToken', value);
                    handleInputChange('isNative', value === 'native');
                  }}
                >
                  <SelectTrigger className="h-12 form-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    {BASE_TOKENS.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.isNative ? 'native' : token.address}
                        className="select-item"
                      >
                        {token.symbol} ({token.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sellingAmount" className="text-gray-300">Selling Amount *</Label>
                <Input
                  id="sellingAmount"
                  placeholder="e.g., 1000000 (total tokens for sale)"
                  value={formData.sellingAmount}
                  onChange={(e) => handleInputChange('sellingAmount', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Total amount of tokens available for the fairlaunch</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="buybackRate" className="text-gray-300">Initial Rate (Reference Only) *</Label>
                <Input
                  id="buybackRate"
                  placeholder="e.g., 1000 (tokens per KLC)"
                  value={formData.buybackRate}
                  onChange={(e) => handleInputChange('buybackRate', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">
                  Reference rate only - actual rate is calculated as: Selling Amount ÷ Total Raised Amount
                </p>
              </div>
            </div>
          </div>

          {/* Cap & Liquidity Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Cap & Liquidity Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="softCap" className="text-gray-300">Soft Cap *</Label>
                <Input
                  id="softCap"
                  placeholder="e.g., 100"
                  value={formData.softCap}
                  onChange={(e) => handleInputChange('softCap', e.target.value)}
                  className="h-12 form-input"
                />
                <p className="text-xs text-gray-400">Minimum amount to raise for success</p>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Liquidity</Label>
                <div className="h-12 px-3 py-2 border border-blue-500/20 rounded-md bg-slate-800/50 flex items-center">
                  <span className="font-medium text-white">100% (Fixed)</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>• ALL raised funds create the liquidity pool</p>
                  <p>• LP tokens are automatically burned after fairlaunch</p>
                  <p>• This ensures maximum liquidity and prevents rug pulls</p>
                </div>
              </div>
            </div>
          </div>



          {/* Timing Settings */}
          <div className="space-y-4 pt-6 border-t border-blue-500/20">
            <h3 className="text-lg font-medium text-white">Timing Settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-gray-300">Fairlaunch Start *</Label>
                <DatePicker
                  selected={formData.fairlaunchStart ? new Date(formData.fairlaunchStart) : null}
                  onChange={(date) => {
                    if (date) {
                      handleInputChange('fairlaunchStart', date.toISOString());
                    }
                  }}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={new Date()}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Fairlaunch End *</Label>
                <DatePicker
                  selected={formData.fairlaunchEnd ? new Date(formData.fairlaunchEnd) : null}
                  onChange={(date) => {
                    if (date) {
                      handleInputChange('fairlaunchEnd', date.toISOString());
                    }
                  }}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="h-12 w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholderText="Select Date and Time"
                  minDate={formData.fairlaunchStart ? new Date(formData.fairlaunchStart) : new Date()}
                />
              </div>
            </div>

            {formData.fairlaunchStart && formData.fairlaunchEnd && (
              <div className="flex items-center gap-4 text-sm text-gray-300 mt-2">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Start: {formatDateTime(formData.fairlaunchStart)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>End: {formatDateTime(formData.fairlaunchEnd)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Token Requirements Info */}
          {formData.sellingAmount && formData.liquidityPercent && (
            <div className="flex items-start gap-3 p-4 bg-purple-900/20 border border-purple-500/20 rounded-lg">
              <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Token Requirements</h4>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>• <strong>Selling Amount:</strong> {formData.sellingAmount} tokens</p>
                  <p>• <strong>Liquidity Amount:</strong> {formData.sellingAmount} tokens (100% for fairlaunch)</p>
                  <p>• <strong>Total Required:</strong> {Number(formData.sellingAmount) * 2} tokens</p>
                  <p className="mt-2 text-xs text-gray-400">
                    You need to approve this total amount before creating the fairlaunch.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Router Configuration Info */}
          <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">DEX Router Configuration</h4>
              <div className="text-sm text-gray-300 space-y-1">
                <p>• <strong>Router Address:</strong> {getContractAddress('ROUTER', DEFAULT_CHAIN_ID)}</p>
                <p>• <strong>Network:</strong> {DEFAULT_CHAIN_ID === CHAIN_IDS.KALYCHAIN ? 'KalyChain Mainnet' : 'KalyChain Testnet'}</p>
                <p>• <strong>DEX:</strong> KalySwap Router</p>
                <div className="mt-2 pt-2 border-t border-blue-500/20">
                  <p className="text-xs text-gray-400">
                    <strong>Note:</strong> The router address will be automatically set after fairlaunch creation.
                    This tells participants which DEX will be used for liquidity listing when the fairlaunch is finalized.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* How Fairlaunch Works */}
          <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
            <Info className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-white mb-1">How Fairlaunch Works</h4>
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  In a fairlaunch, the final token rate is determined <strong>ONLY</strong> by: <strong className="text-white">Selling Amount ÷ Total Raised Amount</strong>.
                </p>
                <p>
                  <strong className="text-white">Your tokens = Your contribution × Final rate</strong>
                </p>
                <p>
                  The "Initial Rate" setting above is for reference only - the actual rate depends entirely on how much is raised. Everyone receives tokens at the same final rate regardless of when they contributed.
                </p>
                <div className="mt-2 pt-2 border-t border-green-500/20">
                  <p className="text-xs text-gray-400">
                    <strong>Example:</strong> If 1,000,000 tokens are offered and 500 KLC is raised total, the final rate is 2,000 tokens per KLC for everyone, regardless of the initial rate setting.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Display */}
          {isCreating && (
            <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mt-0.5 flex-shrink-0"></div>
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">Creating Fairlaunch</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'approving' ? 'text-blue-400 font-medium' : currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'creating' || currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'approving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>1. Approve tokens ({tokenSymbol || 'Token'})</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'creating' ? 'text-blue-400 font-medium' : currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'setting-router' || currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'creating' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>2. Deploy fairlaunch contract</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'setting-router' ? 'text-blue-400 font-medium' : currentStep === 'saving' || currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {(currentStep === 'saving' || currentStep === 'complete') ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'setting-router' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>3. Configure router</span>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${currentStep === 'saving' ? 'text-blue-400 font-medium' : currentStep === 'complete' ? 'text-green-400' : 'text-gray-400'}`}>
                    {currentStep === 'complete' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === 'saving' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-500"></div>
                    )}
                    <span>4. Save project details</span>
                  </div>
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
          {createdFairlaunch && (
            <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-white mb-1">Fairlaunch Created Successfully!</h4>
                <p className="text-sm text-gray-300 mb-2">
                  Your fairlaunch has been deployed to: <code className="bg-green-900/30 px-1 rounded text-green-400">{createdFairlaunch}</code>
                </p>
                <Button variant="outline" size="sm" className="text-green-400 border-green-500/20 hover:bg-green-500/20">
                  View Fairlaunch Details
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
                A fee of <strong className="text-white">{getCreationFee()} KLC</strong> is required to create your fairlaunch.
                This covers deployment and platform costs.
              </p>
            </div>
          </div>

          {/* Wallet Connection Check */}
          {!isConnected && (
            <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-500/20 rounded-lg">
              <Wallet className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white mb-1">Wallet Required</h4>
                <p className="text-sm text-gray-300">
                  Please connect your wallet to create a fairlaunch. You can use either an external wallet (MetaMask) or create an internal KalySwap wallet.
                </p>
              </div>
            </div>
          )}

          {/* Create Button */}
          <Button
            onClick={handleCreateFairlaunch}
            disabled={isCreating || !isConnected}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {currentStep === 'approving' && 'Approving Tokens...'}
                {currentStep === 'creating' && 'Creating Fairlaunch...'}
                {currentStep === 'setting-router' && 'Setting Router...'}
                {currentStep === 'saving' && 'Saving Project...'}
                {currentStep === 'idle' && 'Preparing...'}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet to Create Fairlaunch
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Create Fairlaunch ({getCreationFee()} KLC)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
