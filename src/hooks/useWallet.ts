import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useChainId, useSwitchChain, useSendTransaction } from 'wagmi'
import { kalychain, isSupportedChain, type ChainId } from '@/config/chains'
import { walletLogger } from '@/lib/logger'

// Utility function to convert Hyperlane transaction to wagmi format
function hyperlaneToWagmiTx(tx: any) {
  walletLogger.debug('Converting transaction:', tx);

  // Handle different transaction structures
  const transaction = tx.transaction || tx;

  if (!transaction.to) {
    walletLogger.error('Transaction missing "to" field:', transaction);
    throw new Error('No tx recipient address specified');
  }

  // Convert BigNumber values to bigint if needed
  const convertToBigInt = (value: any) => {
    if (!value) return BigInt(0);
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string') return BigInt(value);
    if (value._hex) return BigInt(value._hex); // Ethers BigNumber
    if (value.toString) return BigInt(value.toString());
    return BigInt(value);
  };

  const wagmiTx = {
    to: transaction.to as `0x${string}`,
    value: convertToBigInt(transaction.value),
    data: (transaction.data || '0x') as `0x${string}`,
    gas: transaction.gasLimit ? convertToBigInt(transaction.gasLimit) : undefined,
    gasPrice: transaction.gasPrice ? convertToBigInt(transaction.gasPrice) : undefined,
    maxFeePerGas: transaction.maxFeePerGas ? convertToBigInt(transaction.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas ? convertToBigInt(transaction.maxPriorityFeePerGas) : undefined,
  };

  walletLogger.debug('Converted transaction:', wagmiTx);
  return wagmiTx;
}

// Wallet types
export type WalletType = 'external' | 'internal'

// Internal wallet interface (from existing system)
interface InternalWallet {
  id: string
  address: string
  chainId: number
}

// Unified wallet state
interface WalletState {
  // Connection state
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  
  // Wallet info
  address?: string
  chainId?: number
  walletType?: WalletType
  
  // Balance
  balance?: {
    value: bigint
    decimals: number
    formatted: string
    symbol: string
  }
  
  // Internal wallet specific
  internalWallet?: InternalWallet
}

// Unified wallet actions
interface WalletActions {
  // Connection
  connect: (walletType: WalletType) => Promise<void>
  disconnect: () => void

  // Chain management
  switchChain: (chainId: ChainId) => Promise<void>

  // Transaction signing
  signTransaction: (transaction: any) => Promise<string>

  // Internal wallet management
  switchToInternalWallet: (walletId: string) => Promise<void>
  getInternalWallets: () => Promise<InternalWallet[]>
}

export function useWallet(): WalletState & WalletActions {
  // Rainbow Kit / Wagmi hooks - with error handling for missing provider
  let externalAddress: string | undefined
  let isExternalConnected = false
  let isConnecting = false
  let isReconnecting = false
  let connectExternal: any
  let connectors: any[] = []
  let disconnectExternal: any
  let chainId: number | undefined
  let switchChain: any
  let sendTransaction: any

  try {
    const accountData = useAccount()
    const connectData = useConnect()
    const disconnectData = useDisconnect()
    const chainData = useChainId()
    const switchChainData = useSwitchChain()
    const sendTransactionData = useSendTransaction()

    externalAddress = accountData.address
    isExternalConnected = accountData.isConnected
    isConnecting = accountData.isConnecting
    isReconnecting = accountData.isReconnecting
    connectExternal = connectData.connect
    connectors = [...connectData.connectors]
    disconnectExternal = disconnectData.disconnect
    chainId = chainData
    switchChain = switchChainData.switchChain
    sendTransaction = sendTransactionData.sendTransactionAsync
  } catch (error) {
    // Wagmi hooks not available - fallback to internal wallet only
    // Log warning only once and not during render
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      setTimeout(() => {
        walletLogger.warn('Wagmi provider not found, using internal wallet only')
      }, 0)
    }
  }

  // External wallet balance - with error handling
  let externalBalance: any
  try {
    const balanceData = useBalance({
      address: externalAddress as `0x${string}` | undefined,
      query: {
        enabled: !!externalAddress && isExternalConnected,
      },
    })
    externalBalance = balanceData.data
  } catch (error) {
    // Balance hook not available
    externalBalance = undefined
  }
  
  // Internal wallet state
  const [internalWallet, setInternalWallet] = useState<InternalWallet | null>(null)
  const [walletType, setWalletType] = useState<WalletType | undefined>()

  // Get wagmi account data to check for internal wallet connections
  let wagmiAddress: string | undefined
  let wagmiIsConnected = false
  let wagmiConnector: any
  let wagmiChainId: number | undefined

  try {
    const accountData = useAccount()
    wagmiAddress = accountData.address
    wagmiIsConnected = accountData.isConnected
    wagmiConnector = accountData.connector
    wagmiChainId = accountData.chainId
  } catch (error) {
    // Wagmi not available
  }

  // Determine if connected via internal wallet through wagmi
  const isInternalWalletConnected = wagmiIsConnected && wagmiConnector?.id === 'kalyswap-internal'

  // Determine current wallet state - prioritize wagmi connection state
  const isConnected = wagmiIsConnected || isExternalConnected || !!internalWallet
  const currentAddress = wagmiAddress || externalAddress || internalWallet?.address
  const currentChainId = wagmiChainId || chainId || internalWallet?.chainId
  
  // Get current balance (external or internal)
  const currentBalance = externalBalance || undefined // TODO: Add internal wallet balance fetching
  
  // Update wallet type based on connection state
  useEffect(() => {
    if (isInternalWalletConnected) {
      setWalletType('internal')
      // Load internal wallet details from connector
      if (typeof window !== 'undefined') {
        import('@/connectors/internalWallet').then(({ internalWalletUtils }) => {
          const state = internalWalletUtils.getState()
          if (state.activeWallet) {
            setInternalWallet({
              id: state.activeWallet.id,
              address: state.activeWallet.address,
              chainId: state.activeWallet.chainId,
            })
          }
        }).catch(error => {
          walletLogger.error('Error loading internal wallet state:', error)
        })
      }
    } else if (isExternalConnected) {
      setWalletType('external')
      setInternalWallet(null)
    } else {
      setWalletType(undefined)
      setInternalWallet(null)
    }
  }, [isInternalWalletConnected, isExternalConnected, wagmiIsConnected, wagmiConnector])

  // Update wallet type when external wallet connects/disconnects
  useEffect(() => {
    if (isExternalConnected && externalAddress) {
      setWalletType('external')
      // Clear internal wallet when external connects
      setInternalWallet(null)
      localStorage.removeItem('active_internal_wallet')
    } else if (!isExternalConnected && !internalWallet) {
      setWalletType(undefined)
    }
  }, [isExternalConnected, externalAddress, internalWallet])

  // Connect function
  const connect = useCallback(async (type: WalletType) => {
    if (type === 'external') {
      // Use the first available connector (usually MetaMask)
      const connector = connectors[0]
      if (connector && connectExternal) {
        await connectExternal({ connector })
      } else {
        if (process.env.NODE_ENV === 'development') {
          walletLogger.warn('External wallet connection not available')
        }
      }
    } else if (type === 'internal') {
      // Show internal wallet selection modal
      // This will be implemented when we integrate with existing internal wallet system
      if (process.env.NODE_ENV === 'development') {
        walletLogger.debug('Internal wallet connection - to be implemented')
      }
    }
  }, [connectExternal, connectors])
  
  // Disconnect function
  const disconnect = useCallback(() => {
    if (walletType === 'external' && disconnectExternal) {
      disconnectExternal()
    } else if (walletType === 'internal') {
      setInternalWallet(null)
      localStorage.removeItem('active_internal_wallet')
    }
    setWalletType(undefined)
  }, [walletType, disconnectExternal])
  
  // Switch chain function
  const handleSwitchChain = useCallback(async (targetChainId: ChainId) => {
    if (!isSupportedChain(targetChainId)) {
      throw new Error(`Chain ${targetChainId} is not supported`)
    }

    if (walletType === 'external' && switchChain) {
      await switchChain({ chainId: targetChainId })
    } else if (walletType === 'internal') {
      // Update internal wallet chain
      if (internalWallet) {
        const updatedWallet = { ...internalWallet, chainId: targetChainId }
        setInternalWallet(updatedWallet)
        localStorage.setItem('active_internal_wallet', JSON.stringify(updatedWallet))
      }
    }
  }, [walletType, switchChain, internalWallet])
  
  // Switch to internal wallet
  const switchToInternalWallet = useCallback(async (walletId: string) => {
    // Disconnect external wallet first
    if (isExternalConnected && disconnectExternal) {
      disconnectExternal()
    }

    // Use the internal wallet connector's utility to select the wallet
    const { internalWalletUtils } = await import('@/connectors/internalWallet')
    internalWalletUtils.selectWallet(walletId)

    // Update local state
    const state = internalWalletUtils.getState()
    if (state.activeWallet) {
      setInternalWallet({
        id: state.activeWallet.id,
        address: state.activeWallet.address,
        chainId: state.activeWallet.chainId,
      })
      setWalletType('internal')
    }
  }, [isExternalConnected, disconnectExternal])

  // Helper function to prompt for password (same as swaps/pools pattern)
  const promptForPassword = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]';
      modal.style.pointerEvents = 'auto';
      modal.innerHTML = `
        <div class="bg-stone-900 border border-amber-500/30 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl" style="pointer-events: auto;">
          <h3 class="text-lg font-semibold mb-4 text-white">Enter Wallet Password</h3>
          <p class="text-sm text-gray-300 mb-4">Enter your internal wallet password to authorize this transaction.</p>
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

      // Prevent event bubbling to avoid conflicts with other modals
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          handleCancel();
        }
        e.stopPropagation();
      });

      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleConfirm();
      });

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCancel();
      });

      passwordInput.addEventListener('keypress', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
      });

      // Force focus and ensure it's interactive
      document.body.appendChild(modal);
      setTimeout(() => {
        passwordInput.focus();
      }, 100);
    });
  };

  // Sign transaction
  const signTransaction = useCallback(async (transaction: any): Promise<string> => {
    if (walletType === 'external') {
      if (!sendTransaction) {
        throw new Error('External wallet not available for transaction signing');
      }

      try {
        walletLogger.debug('Signing transaction with external wallet:', {
          type: typeof transaction,
          keys: Object.keys(transaction || {}),
          transaction
        });

        // Convert Hyperlane transaction to wagmi format
        const wagmiTx = hyperlaneToWagmiTx(transaction);

        walletLogger.debug('Converted transaction:', wagmiTx);

        // Send transaction using wagmi
        walletLogger.debug('Sending transaction with wagmi...');
        const result = await sendTransaction(wagmiTx);

        walletLogger.debug('Transaction result:', result, 'type:', typeof result);

        if (!result) {
          throw new Error('Transaction hash not returned from wallet');
        }

        // The result should be the transaction hash
        const hash = typeof result === 'string' ? result : result.hash || result;
        walletLogger.debug('Final transaction hash:', hash);

        return hash;
      } catch (error) {
        walletLogger.error('External wallet transaction failed:', error);
        throw error;
      }
    } else if (walletType === 'internal') {
      // For internal wallets, use the internal wallet connector's sendTransaction method
      try {
        walletLogger.debug('Signing transaction with internal wallet:', {
          type: typeof transaction,
          keys: Object.keys(transaction || {}),
          transaction
        });

        // Import internal wallet utils dynamically
        const { internalWalletUtils } = await import('@/connectors/internalWallet');

        // Get the internal wallet state
        const internalWalletState = internalWalletUtils.getState();
        if (!internalWalletState.activeWallet) {
          throw new Error('No internal wallet connected');
        }

        // Get password from user (similar to swaps/pools pattern)
        const password = await promptForPassword();
        if (!password) {
          throw new Error('Password required for transaction signing');
        }

        // Use the internal wallet GraphQL API (same pattern as swaps/pools)
        const token = localStorage.getItem('auth_token');
        if (!token) {
          throw new Error('Authentication required');
        }

        // Prepare transaction input for GraphQL
        const contractInput = {
          walletId: internalWalletState.activeWallet.id,
          toAddress: transaction.to,
          value: transaction.value?.toString() || '0',
          data: transaction.data || '0x',
          password: password,
          chainId: internalWalletState.activeWallet.chainId,
          gasLimit: transaction.gasLimit?.toString() || '500000'
        };

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
            variables: { input: contractInput }
          }),
        });

        const result = await response.json();
        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        const hash = result.data.sendContractTransaction.hash;

        walletLogger.debug('Internal wallet transaction hash:', hash);
        return hash;
      } catch (error) {
        walletLogger.error('Internal wallet transaction failed:', error);
        throw error;
      }
    } else {
      throw new Error('No wallet connected')
    }
  }, [walletType, sendTransaction])

  // Get internal wallets
  const getInternalWallets = useCallback(async (): Promise<InternalWallet[]> => {
    // TODO: Fetch from API
    // For now, return empty array
    return []
  }, [])
  
  return {
    // State
    isConnected,
    isConnecting,
    isReconnecting,
    address: currentAddress,
    chainId: currentChainId,
    walletType,
    balance: currentBalance,
    internalWallet: internalWallet || undefined,
    
    // Actions
    connect,
    disconnect,
    switchChain: handleSwitchChain,
    signTransaction,
    switchToInternalWallet,
    getInternalWallets,
  }
}
