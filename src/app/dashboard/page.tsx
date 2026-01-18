'use client';

import { CHAIN_IDS } from '@/config/chains';

import { logger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { TokenExpirationWarning } from '@/components/auth/TokenExpirationWarning';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wallet,
  Plus,
  Download,
  Copy,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink
} from 'lucide-react';
import InternalWalletStatus from '@/components/wallet/InternalWalletStatus';
import './dashboard.css';

// TokenIcon component for dashboard tokens
function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
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
      <div
        className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={getTokenIconPath(symbol)}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

// GraphQL queries and mutations
const SEND_TRANSACTION_MUTATION = `
  mutation SendTransaction($input: SendTransactionInput!) {
    sendTransaction(input: $input) {
      id
      hash
      status
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      username
      email
      wallets {
        id
        address
        chainId
        balance {
          native {
            symbol
            balance
            formattedBalance
          }
          tokens {
            symbol
            balance
            address
            formattedBalance
            decimals
            name
          }
        }
        transactions(limit: 10) {
          id
          type
          status
          hash
          fromAddress
          toAddress
          amount
          tokenAddress
          tokenSymbol
          tokenDecimals
          fee
          blockNumber
          timestamp
        }
      }
    }
  }
`;

const CREATE_WALLET_MUTATION = `
  mutation CreateWallet($password: String!, $chainId: Int) {
    createWallet(password: $password, chainId: $chainId) {
      id
      address
      chainId
    }
  }
`;

const SUPPORTED_CHAINS_QUERY = `
  query SupportedChains {
    supportedChains {
      chainId
      name
      symbol
      decimals
      rpcUrl
      blockExplorer
      isTestnet
    }
  }
`;

const EXPORT_WALLET_QUERY = `
  query ExportWallet($walletId: ID!, $password: String!) {
    exportWallet(walletId: $walletId, password: $password) {
      keystore
      privateKey
    }
  }
`;

// Wallet-specific token interface (different from DEX Token type)
interface WalletToken {
  symbol: string;
  balance: string;
  address: string;
  formattedBalance: string;
  decimals: number;
  name: string;
}

interface NativeTokenBalance {
  symbol: string;
  balance: string;
  formattedBalance: string;
}

interface WalletBalance {
  native: NativeTokenBalance;
  tokens: WalletToken[];
}

interface ChainInfo {
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
}

interface Transaction {
  id: string;
  type: string;
  status: string;
  hash?: string;
  fromAddress: string;
  toAddress?: string;
  amount: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  fee?: string;
  blockNumber?: number;
  timestamp: string;
}

interface Wallet {
  id: string;
  address: string;
  chainId: number;
  balance?: WalletBalance;
  transactions?: Transaction[];
}

interface User {
  id: string;
  username: string;
  email?: string;
  wallets: Wallet[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // Helper function to get chain name
  const getChainName = (chainId: number): string => {
    const chain = supportedChains.find(c => c.chainId === chainId);
    return chain?.name || `Chain ${chainId}`;
  };

  // Helper function to get chain symbol
  const getChainSymbol = (chainId: number): string => {
    const chain = supportedChains.find(c => c.chainId === chainId);
    return chain?.symbol || 'ETH';
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createWalletPassword, setCreateWalletPassword] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<number>(CHAIN_IDS.KALYCHAIN); // Default to KalyChain
  const [supportedChains, setSupportedChains] = useState<ChainInfo[]>([
    { chainId: CHAIN_IDS.KALYCHAIN, name: 'KalyChain', symbol: 'KLC', decimals: 18, rpcUrl: '', blockExplorer: 'https://kalyscan.io', isTestnet: false },
    { chainId: 56, name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18, rpcUrl: '', blockExplorer: 'https://bscscan.com', isTestnet: false },
    { chainId: 42161, name: 'Arbitrum One', symbol: 'ETH', decimals: 18, rpcUrl: '', blockExplorer: 'https://arbiscan.io', isTestnet: false }
  ]);
  const [exportWalletId, setExportWalletId] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportKeystore, setExportKeystore] = useState<string | null>(null);
  const [exportPrivateKey, setExportPrivateKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [createWalletError, setCreateWalletError] = useState<string | null>(null);

  // Send transaction state
  const [sendWalletId, setSendWalletId] = useState<string | null>(null);
  const [sendToAddress, setSendToAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendAsset, setSendAsset] = useState(''); // Will be updated when wallet is selected
  const [sendPassword, setSendPassword] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendingTransaction, setSendingTransaction] = useState(false);

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Import auth utilities dynamically to avoid SSR issues
        const { getAuthToken, fetchGraphQLWithAuth, parseAuthError } = await import('@/utils/auth');

        const token = getAuthToken();

        if (!token) {
          router.push('/login');
          return;
        }

        const result = await fetchGraphQLWithAuth(ME_QUERY);
        setUser(result.data.me);
      } catch (err) {
        logger.error('Error fetching user data:', err);

        // Import auth utilities for error parsing
        import('@/utils/auth').then(({ parseAuthError }) => {
          const authError = parseAuthError(err);
          setError(authError.message);

          // Redirect to login if it's an authentication error
          if (authError.shouldRedirectToLogin) {
            setTimeout(() => router.push('/login'), 2000);
          }
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  // Fetch supported chains
  useEffect(() => {
    const fetchSupportedChains = async () => {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: SUPPORTED_CHAINS_QUERY,
          }),
        });

        const result = await response.json();

        if (result.errors) {
          logger.error('Error fetching supported chains:', result.errors[0].message);
          return;
        }

        setSupportedChains(result.data.supportedChains);
      } catch (err) {
        logger.error('Error fetching supported chains:', err);
      }
    };

    fetchSupportedChains();
  }, []);

  // Handle wallet creation
  const handleCreateWallet = async () => {
    try {
      setCreatingWallet(true);
      setCreateWalletError(null);

      if (!createWalletPassword || createWalletPassword.length < 8) {
        setCreateWalletError('Password must be at least 8 characters long');
        return;
      }

      const token = localStorage.getItem('auth_token');

      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: CREATE_WALLET_MUTATION,
          variables: {
            password: createWalletPassword,
            chainId: selectedChainId,
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Refresh user data to show new wallet
      const userResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: ME_QUERY,
        }),
      });

      const userResult = await userResponse.json();

      if (userResult.errors) {
        throw new Error(userResult.errors[0].message);
      }

      setUser(userResult.data.me);
      setCreateWalletPassword('');
    } catch (err) {
      setCreateWalletError(err instanceof Error ? err.message : 'Failed to create wallet');
      logger.error('Error creating wallet:', err);
    } finally {
      setCreatingWallet(false);
    }
  };

  // Handle wallet export
  const handleExportWallet = async () => {
    try {
      setExportError(null);
      setExportKeystore(null);
      setExportPrivateKey(null);

      if (!exportWalletId) {
        setExportError('No wallet selected for export');
        return;
      }

      if (!exportPassword) {
        setExportError('Password is required');
        return;
      }

      const token = localStorage.getItem('auth_token');

      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: EXPORT_WALLET_QUERY,
          variables: {
            walletId: exportWalletId,
            password: exportPassword,
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      setExportKeystore(result.data.exportWallet.keystore);
      setExportPrivateKey(result.data.exportWallet.privateKey);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export wallet');
      logger.error('Error exporting wallet:', err);
    }
  };

  // Copy private key to clipboard
  const copyToClipboard = () => {
    if (exportPrivateKey) {
      navigator.clipboard.writeText(exportPrivateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle send transaction
  const handleSendTransaction = async (walletId?: string) => {
    try {
      setSendError(null);
      setSendingTransaction(true);

      // Use provided walletId or fallback to state
      const activeWalletId = walletId || sendWalletId;

      // Validate inputs
      if (!activeWalletId) {
        setSendError('No wallet selected');
        return;
      }

      if (!sendToAddress) {
        setSendError('Recipient address is required');
        return;
      }

      if (!sendToAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        setSendError('Invalid recipient address format');
        return;
      }

      if (!sendAmount || parseFloat(sendAmount) <= 0) {
        setSendError('Amount must be greater than 0');
        return;
      }

      if (!sendPassword) {
        setSendError('Password is required to sign the transaction');
        return;
      }

      const token = localStorage.getItem('auth_token');

      if (!token) {
        router.push('/login');
        return;
      }

      // Find the wallet
      const wallet = user?.wallets.find(w => w.id === activeWalletId);
      if (!wallet) {
        setSendError('Wallet not found');
        return;
      }

      // Check if sending native token and if balance is sufficient
      const chainSymbol = getChainSymbol(wallet.chainId);
      if (sendAsset === chainSymbol && wallet.balance) {
        const balance = parseFloat(
          wallet.balance.native ?
            wallet.balance.native.formattedBalance :
            '0'
        );
        const amount = parseFloat(sendAmount);

        if (amount > balance) {
          setSendError(`Insufficient ${chainSymbol} balance`);
          return;
        }
      }

      // Check if sending token and if balance is sufficient
      if (sendAsset !== getChainSymbol(wallet.chainId) && wallet.balance) {
        // sendAsset could be either a symbol or an address, find the token
        const token = wallet.balance.tokens.find(t =>
          t.symbol === sendAsset || t.address === sendAsset
        );

        if (!token) {
          setSendError(`No ${sendAsset} tokens found in wallet`);
          return;
        }

        const balance = parseFloat(token.balance);
        const amount = parseFloat(sendAmount);

        if (amount > balance) {
          setSendError(`Insufficient ${token.symbol} balance`);
          return;
        }
      }

      // Send transaction
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: SEND_TRANSACTION_MUTATION,
          variables: {
            input: {
              walletId: activeWalletId,
              toAddress: sendToAddress,
              amount: sendAmount,
              asset: sendAsset,
              password: sendPassword,
              chainId: wallet.chainId
            },
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Reset form
      setSendToAddress('');
      setSendAmount('');
      setSendPassword('');

      // Refresh user data to show updated balances and transactions
      const userResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: ME_QUERY,
        }),
      });

      const userResult = await userResponse.json();

      if (userResult.errors) {
        throw new Error(userResult.errors[0].message);
      }

      setUser(userResult.data.me);

      // Show success message
      alert('Transaction sent successfully!');

    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send transaction');
      logger.error('Error sending transaction:', err);
    } finally {
      setSendingTransaction(false);
    }
  };

  // Format address for display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Format balance with commas
  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <MainLayout>
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Wallet Dashboard</h1>
          <p className="dashboard-subtitle">
            Manage your KalyChain wallets and assets
          </p>
        </div>

        {loading ? (
          <Card className="p-8 text-center">
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                <p className="text-lg font-medium">Loading your wallet data...</p>
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="p-8">
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h3 className="text-xl font-bold mb-2">Error Loading Data</h3>
                <p className="text-slate-600 mb-4">{error}</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Token Expiration Warning */}
            <TokenExpirationWarning className="mb-6" />

            <div className="mb-6">
              <Tabs defaultValue="wallets" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="wallets">My Wallets</TabsTrigger>
                  <TabsTrigger value="account">Account</TabsTrigger>
                </TabsList>

                <TabsContent value="wallets">
                  {/* Internal Wallet Connection Status */}
                  <InternalWalletStatus />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 wallet-grid">
                    {user?.wallets.map((wallet) => (
                      <Card key={wallet.id} className="wallet-card">
                        <CardHeader className="wallet-header">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-lg">{getChainName(wallet.chainId)} Wallet</CardTitle>
                            <div className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full border border-blue-500/30">
                              {getChainSymbol(wallet.chainId)} • {wallet.chainId}
                            </div>
                          </div>
                          <div className="wallet-address" title={wallet.address}>
                            {wallet.address}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Tabs defaultValue="balance" className="w-full">
                            <TabsList className="mb-4 bg-slate-800/50 border-slate-700">
                              <TabsTrigger value="balance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Balance</TabsTrigger>
                              <TabsTrigger value="transactions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Transactions</TabsTrigger>
                            </TabsList>

                            <TabsContent value="balance">
                              <div>
                                <div className="text-sm text-slate-400 mb-1">Balance</div>
                                <div className="wallet-balance flex items-center gap-2">
                                  <TokenIcon symbol={getChainSymbol(wallet.chainId)} size={24} />
                                  <span>
                                    {wallet.balance ?
                                      (wallet.balance.native ?
                                        formatBalance(wallet.balance.native.formattedBalance) :
                                        formatBalance('0')
                                      ) : '0'
                                    } {getChainSymbol(wallet.chainId)}
                                  </span>
                                </div>

                                {wallet.balance && wallet.balance.tokens && wallet.balance.tokens.length > 0 && (
                                  <div className="token-list">
                                    <div className="text-sm text-slate-400 mb-2">Tokens</div>
                                    {wallet.balance.tokens.map((token, index) => (
                                      <div key={index} className="token-item">
                                        <div className="token-icon">
                                          <TokenIcon symbol={token.symbol} size={32} />
                                        </div>
                                        <div className="token-details">
                                          <div className="token-symbol">{token.symbol}</div>
                                          <div className="token-balance">{formatBalance(token.formattedBalance || token.balance)}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TabsContent>

                            <TabsContent value="transactions">
                              <div className="transactions-list">
                                <div className="text-sm text-slate-400 mb-2">Recent Transactions</div>
                                {wallet.transactions && wallet.transactions.length > 0 ? (
                                  <div className="space-y-3">
                                    {wallet.transactions.map((tx) => (
                                      <div key={tx.id} className="transaction-item border border-slate-700 bg-slate-800/30 rounded-md p-3">
                                        <div className="flex justify-between items-start mb-2">
                                          <div className="flex items-center">
                                            {tx.type === 'SEND' ? (
                                              <ArrowUpRight className="h-4 w-4 text-orange-500 mr-2" />
                                            ) : tx.type === 'RECEIVE' ? (
                                              <ArrowDownLeft className="h-4 w-4 text-green-500 mr-2" />
                                            ) : (
                                              <RefreshCw className="h-4 w-4 text-blue-500 mr-2" />
                                            )}
                                            <span className="font-medium text-white">
                                              {tx.type === 'SEND' ? 'Sent' : tx.type === 'RECEIVE' ? 'Received' : tx.type}
                                            </span>
                                          </div>
                                          <div className="flex items-center">
                                            {tx.status === 'PENDING' ? (
                                              <Clock className="h-4 w-4 text-yellow-500 mr-1" />
                                            ) : tx.status === 'CONFIRMED' ? (
                                              <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                                            ) : (
                                              <XCircle className="h-4 w-4 text-red-500 mr-1" />
                                            )}
                                            <span className="text-xs text-slate-300">
                                              {tx.status}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="text-sm mb-1">
                                          <span className="text-slate-400 mr-1">Amount:</span>
                                          <span className="font-medium text-white">
                                            {formatBalance(tx.amount)} {tx.tokenSymbol || 'KLC'}
                                          </span>
                                        </div>

                                        {tx.type === 'SEND' && tx.toAddress && (
                                          <div className="text-sm mb-1">
                                            <span className="text-slate-400 mr-1">To:</span>
                                            <span className="font-mono text-xs text-slate-300">{formatAddress(tx.toAddress)}</span>
                                          </div>
                                        )}

                                        {tx.type === 'RECEIVE' && (
                                          <div className="text-sm mb-1">
                                            <span className="text-slate-400 mr-1">From:</span>
                                            <span className="font-mono text-xs text-slate-300">{formatAddress(tx.fromAddress)}</span>
                                          </div>
                                        )}

                                        <div className="text-xs text-slate-400">
                                          {new Date(tx.timestamp).toLocaleString()}
                                        </div>

                                        {tx.hash && (
                                          <div className="mt-2">
                                            <a
                                              href={`https://kalyscan.io/tx/${tx.hash}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-400 flex items-center hover:underline hover:text-blue-300"
                                            >
                                              View on Explorer
                                              <ExternalLink className="h-3 w-3 ml-1" />
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-4 text-slate-400">
                                    No transactions found
                                  </div>
                                )}
                              </div>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                        <CardFooter>
                          <div className="wallet-actions flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="default"
                                  className="action-button"
                                  onClick={() => {
                                    // Reset form when opening dialog
                                    setSendToAddress('');
                                    setSendAmount('');
                                    setSendPassword('');
                                    setSendError(null);
                                    setSendAsset(getChainSymbol(wallet.chainId)); // Set to chain's native token
                                  }}
                                >
                                  <Send className="h-4 w-4 mr-1" />
                                  Send
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="export-dialog-content bg-slate-900 border-slate-700 text-white">
                                <DialogHeader>
                                  <DialogTitle className="text-white">Send Assets</DialogTitle>
                                  <DialogDescription className="text-slate-400">
                                    Send KLC or tokens from your wallet to another address.
                                  </DialogDescription>
                                </DialogHeader>

                                {sendError && (
                                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-red-300">{sendError}</p>
                                  </div>
                                )}

                                <form autoComplete="off" className="space-y-4 mt-2">
                                  <div>
                                    <Label htmlFor="send-asset">Asset</Label>
                                    <Select
                                      value={sendAsset}
                                      onValueChange={setSendAsset}
                                    >
                                      <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                                        <SelectValue placeholder="Select asset" />
                                      </SelectTrigger>
                                      <SelectContent className="select-content">
                                        <SelectItem value={getChainSymbol(wallet.chainId)}>
                                          {getChainSymbol(wallet.chainId)} (Native)
                                        </SelectItem>
                                        {wallet.balance?.tokens
                                          .filter((token) => token.address && token.address.trim() !== '')
                                          .map((token, index) => (
                                            <SelectItem
                                              key={`${token.address}-${index}`}
                                              value={token.address}
                                            >
                                              {token.symbol}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <Label htmlFor="send-to-address">Recipient Address</Label>
                                    <Input
                                      id="send-to-address"
                                      name="recipient-address"
                                      type="text"
                                      value={sendToAddress}
                                      onChange={(e) => setSendToAddress(e.target.value)}
                                      placeholder="0x..."
                                      autoComplete="off"
                                      spellCheck={false}
                                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="send-amount">Amount</Label>
                                    <div className="relative">
                                      <Input
                                        id="send-amount"
                                        name="send-amount"
                                        type="number"
                                        value={sendAmount}
                                        onChange={(e) => setSendAmount(e.target.value)}
                                        placeholder="0.0"
                                        step="0.000001"
                                        min="0"
                                        autoComplete="off"
                                        className="pr-16 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
                                      />
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                                        {sendAsset === getChainSymbol(wallet.chainId) ? getChainSymbol(wallet.chainId) : (() => {
                                          const token = wallet.balance?.tokens.find(t => t.address === sendAsset);
                                          return token?.symbol || sendAsset;
                                        })()}
                                      </div>
                                    </div>

                                    {wallet.balance && (
                                      <div className="flex justify-between mt-1">
                                        <span className="text-xs text-slate-400">
                                          Available: {
                                            sendAsset === getChainSymbol(wallet.chainId)
                                              ? `${formatBalance(
                                                  wallet.balance.native ?
                                                    wallet.balance.native.formattedBalance :
                                                    '0'
                                                )} ${getChainSymbol(wallet.chainId)}`
                                              : (() => {
                                                  const token = wallet.balance?.tokens?.find(t =>
                                                    t.symbol === sendAsset || t.address === sendAsset
                                                  );
                                                  return `${formatBalance(token?.formattedBalance || token?.balance || '0')} ${token?.symbol || sendAsset}`;
                                                })()
                                          }
                                        </span>
                                        <button
                                          type="button"
                                          className="text-xs text-blue-400 hover:underline hover:text-blue-300"
                                          onClick={() => {
                                            if (sendAsset === getChainSymbol(wallet.chainId)) {
                                              setSendAmount(
                                                wallet.balance?.native ?
                                                  wallet.balance.native.formattedBalance :
                                                  '0'
                                              );
                                            } else {
                                              const token = wallet.balance?.tokens?.find(t =>
                                                t.symbol === sendAsset || t.address === sendAsset
                                              );
                                              setSendAmount(token?.formattedBalance || token?.balance || '0');
                                            }
                                          }}
                                        >
                                          Max
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <Label htmlFor="send-password">Wallet Password</Label>
                                    <Input
                                      id="send-password"
                                      name="wallet-password"
                                      type="password"
                                      value={sendPassword}
                                      onChange={(e) => setSendPassword(e.target.value)}
                                      placeholder="Enter your wallet password"
                                      autoComplete="current-password"
                                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">
                                      Your password is required to sign the transaction
                                    </p>
                                  </div>
                                </form>

                                <DialogFooter className="mt-6">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setSendToAddress('');
                                      setSendAmount('');
                                      setSendPassword('');
                                      setSendError(null);
                                    }}
                                    disabled={sendingTransaction}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      handleSendTransaction(wallet.id);
                                    }}
                                    disabled={sendingTransaction}
                                  >
                                    {sendingTransaction ? (
                                      <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Send
                                      </>
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="action-button"
                                  onClick={() => {
                                    setExportWalletId(wallet.id);
                                    setExportPassword('');
                                    setExportKeystore(null);
                                    setExportPrivateKey(null);
                                    setExportError(null);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                  Export
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="export-dialog-content bg-slate-900 border-slate-700 text-white">
                                <DialogHeader>
                                  <DialogTitle className="text-white">Export Wallet</DialogTitle>
                                  <DialogDescription className="text-slate-400">
                                    Enter your password to export this wallet's private key.
                                  </DialogDescription>
                                </DialogHeader>

                                {exportError && (
                                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-red-300">{exportError}</p>
                                  </div>
                                )}

                                <div className="password-input">
                                  <Label htmlFor="export-password">Password</Label>
                                  <Input
                                    id="export-password"
                                    type="password"
                                    value={exportPassword}
                                    onChange={(e) => setExportPassword(e.target.value)}
                                    placeholder="Enter your wallet password"
                                    className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
                                  />
                                </div>

                                {!exportPrivateKey ? (
                                  <DialogFooter className="mt-4">
                                    <Button
                                      variant="outline"
                                      onClick={handleExportWallet}
                                    >
                                      Export Private Key
                                    </Button>
                                  </DialogFooter>
                                ) : (
                                  <div className="mt-4">
                                    <Label>Your Private Key</Label>
                                    <div className="keystore-display bg-yellow-900/20 border border-yellow-500/30 p-3 rounded-md text-sm font-mono break-all text-yellow-200">
                                      {exportPrivateKey}
                                    </div>
                                    <p className="text-xs text-amber-400 mt-2 mb-3">
                                      <AlertCircle className="h-3 w-3 inline-block mr-1" />
                                      Warning: Never share your private key with anyone. Anyone with your private key has full control of your wallet.
                                    </p>
                                    <Button
                                      variant="outline"
                                      className="copy-button mt-2"
                                      onClick={copyToClipboard}
                                    >
                                      {copied ? (
                                        <>
                                          <CheckCircle2 className="h-4 w-4" />
                                          Copied!
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-4 w-4" />
                                          Copy to Clipboard
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </CardFooter>
                      </Card>
                    ))}

                    {/* Create New Wallet Card */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Card className="create-wallet-card">
                          <Plus className="create-wallet-icon" />
                          <p className="create-wallet-text">Create New Wallet</p>
                        </Card>
                      </DialogTrigger>
                      <DialogContent className="!bg-slate-900 !border-slate-700 text-white">
                        <DialogHeader>
                          <DialogTitle className="text-white">Create New Wallet</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            Create a new wallet for your selected blockchain. Your password will be used to encrypt the private key.
                          </DialogDescription>
                        </DialogHeader>

                        {createWalletError && (
                          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-red-300">{createWalletError}</p>
                          </div>
                        )}

                        <div className="space-y-4 mt-4">
                          {/* Chain Selection */}
                          <div>
                            <Label htmlFor="chain-select">Blockchain</Label>
                            <select
                              id="chain-select"
                              value={selectedChainId}
                              onChange={(e) => setSelectedChainId(parseInt(e.target.value))}
                              className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white"
                            >
                              {supportedChains.map((chain) => (
                                <option key={chain.chainId} value={chain.chainId}>
                                  {chain.name} ({chain.symbol})
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-400 mt-1">
                              Select the blockchain network for your new wallet.
                            </p>
                          </div>

                          {/* Password Input */}
                          <div>
                            <Label htmlFor="wallet-password">Password</Label>
                            <Input
                              id="wallet-password"
                              type="password"
                              value={createWalletPassword}
                              onChange={(e) => setCreateWalletPassword(e.target.value)}
                              placeholder="Enter a secure password (min 8 characters)"
                              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                              This password will be used to encrypt your wallet's private key.
                              Make sure to use a strong password and keep it safe.
                            </p>
                          </div>
                        </div>

                        <DialogFooter className="mt-4">
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button
                            onClick={handleCreateWallet}
                            disabled={creatingWallet}
                          >
                            {creatingWallet ? 'Creating...' : 'Create Wallet'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TabsContent>

                <TabsContent value="account">
                  <Card className="wallet-card">
                    <CardHeader>
                      <CardTitle className="text-white">Account Information</CardTitle>
                      <CardDescription className="text-slate-400">
                        Your personal account details
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <Label>Username</Label>
                          <div className="text-lg font-medium">{user?.username}</div>
                        </div>

                        {user?.email && (
                          <div>
                            <Label>Email</Label>
                            <div className="text-lg font-medium">{user.email}</div>
                          </div>
                        )}

                        <div>
                          <Label>Wallets</Label>
                          <div className="text-lg font-medium">{user?.wallets.length || 0}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
