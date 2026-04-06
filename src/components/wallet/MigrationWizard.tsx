'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMigration, type WalletBalanceInfo } from '@/hooks/useMigration'
import { useActiveAccount } from 'thirdweb/react'
import { CheckCircle2, Loader2, AlertCircle, Wallet, ArrowRight, Shield } from 'lucide-react'
import { getExplorerTxUrl, CHAIN_IDS } from '@/config/chains'

interface MigrationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type WizardStep = 'connect' | 'review' | 'password' | 'wallet-done' | 'complete'

const CHAIN_NAMES: Record<number, string> = {
  [CHAIN_IDS.KALYCHAIN]: 'KalyChain',
  56: 'BNB Smart Chain',
  42161: 'Arbitrum One',
  [CHAIN_IDS.KALYCHAIN_TESTNET]: 'KalyChain Testnet',
}

function getChainName(chainId: number) {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`
}

export function MigrationWizard({ open, onOpenChange }: MigrationWizardProps) {
  const account = useActiveAccount()
  const migration = useMigration()
  const [step, setStep] = useState<WizardStep>('connect')
  const [password, setPassword] = useState('')
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [selectedWalletChainId, setSelectedWalletChainId] = useState<number>(CHAIN_IDS.KALYCHAIN)
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string>('')
  const [walletBalance, setWalletBalance] = useState<WalletBalanceInfo | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  // Track which wallets have been migrated in this session
  const [migratedWalletIds, setMigratedWalletIds] = useState<Set<string>>(new Set())
  // Track tx hashes per wallet for the summary
  const [allTxHashes, setAllTxHashes] = useState<Array<{ chainId: number; hash: string }>>([])

  const remainingWallets = migration.oldWallets.filter(w => !migratedWalletIds.has(w.id))
  const allWalletsMigrated = migration.oldWallets.length > 0 && remainingWallets.length === 0

  const handleLink = async () => {
    if (!account?.address) return
    await migration.linkThirdwebWallet(account.address)
    setStep('review')
  }

  const handleSelectWallet = async (walletId: string, chainId: number, address: string) => {
    setSelectedWallet(walletId)
    setSelectedWalletChainId(chainId)
    setSelectedWalletAddress(address)

    setLoadingBalance(true)
    const balance = await migration.fetchWalletBalance(address, chainId)
    setWalletBalance(balance)
    setLoadingBalance(false)
  }

  const handleStartTransfer = async () => {
    if (!selectedWallet || !account?.address) return
    await migration.startMigration(selectedWallet, account.address)
    setStep('password')
  }

  const handleTransfer = async () => {
    if (!password || !account?.address) return
    setIsTransferring(true)
    setTransferError(null)

    const sessionTxHashes: Array<{ chainId: number; hash: string }> = []

    try {
      // Count ERC-20 tokens to transfer (need to reserve gas for these)
      const tokenAddresses = walletBalance?.tokens
        ?.filter(t => parseFloat(t.balance) > 0)
        ?.map(t => t.address) || []

      // If walletBalance wasn't loaded, refetch before transferring
      let tokensToTransfer = tokenAddresses
      if (tokenAddresses.length === 0 && selectedWalletAddress) {
        const freshBalance = await migration.fetchWalletBalance(selectedWalletAddress, selectedWalletChainId)
        if (freshBalance?.tokens) {
          tokensToTransfer = freshBalance.tokens
            .filter(t => parseFloat(t.balance) > 0)
            .map(t => t.address)
        }
      }

      // Step 1: Transfer ERC-20 tokens FIRST (while we still have native gas)
      if (tokensToTransfer.length > 0) {
        try {
          const hashes = await migration.migrateTokens(password, account.address, tokensToTransfer, selectedWalletChainId)
          hashes.forEach((hash: string) => sessionTxHashes.push({ chainId: selectedWalletChainId, hash }))
        } catch (tokenErr) {
          // Don't block migration if token transfer fails — native can still transfer
          console.warn('Token transfer error:', tokenErr)
        }
      }

      // Step 2: Transfer native tokens LAST (sends remaining balance minus gas)
      try {
        const hash = await migration.migrateNativeTokens(password, account.address, selectedWalletChainId)
        sessionTxHashes.push({ chainId: selectedWalletChainId, hash })
      } catch (nativeErr) {
        // Skip if no native tokens or insufficient for gas
        const msg = nativeErr instanceof Error ? nativeErr.message : ''
        if (!msg.includes('No native tokens') && !msg.includes('Insufficient balance') && !msg.includes('intrinsic gas')) {
          throw nativeErr
        }
      }

      // Compute the new migrated set (can't rely on state yet — async)
      const newMigratedIds = new Set([...migratedWalletIds, selectedWallet!])
      setMigratedWalletIds(newMigratedIds)
      setAllTxHashes(prev => [...prev, ...sessionTxHashes])

      // Reset for next wallet
      setPassword('')
      setSelectedWallet(null)
      setWalletBalance(null)
      setTransferError(null)

      // Check if there are more wallets to migrate
      const newRemaining = migration.oldWallets.filter(w => !newMigratedIds.has(w.id))

      if (newRemaining.length > 0) {
        setStep('wallet-done')
      } else {
        // All wallets migrated — complete
        await migration.completeMigration()
        setStep('complete')
      }
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Transfer failed')
    } finally {
      setIsTransferring(false)
    }
  }

  const handleFinishEarly = async () => {
    // User wants to stop migrating and finish with what's done
    if (migratedWalletIds.size > 0) {
      await migration.completeMigration()
    }
    setStep('complete')
  }

  const renderStep = () => {
    switch (step) {
      case 'connect':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-amber-900/40 border border-amber-500/30 rounded-lg">
              <Shield className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <p className="text-sm text-gray-200">
                Your new wallet is secured by Thirdweb's infrastructure. No passwords needed — sign in with email, Google, or a passkey.
              </p>
            </div>

            {account?.address ? (
              <div className="space-y-3">
                <div className="p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
                  <p className="text-xs text-green-400 font-medium">Connected Thirdweb wallet:</p>
                  <p className="font-mono text-sm text-white mt-1">
                    {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </p>
                </div>
                <Button
                  onClick={handleLink}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold"
                >
                  Link This Wallet
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Wallet className="h-8 w-8 text-amber-400 mx-auto mb-3" />
                <p className="text-sm text-gray-300">
                  Connect your wallet using the Connect button in the header first.
                </p>
              </div>
            )}
          </div>
        )

      case 'review':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Select a wallet to migrate
              {migratedWalletIds.size > 0 && ` (${migratedWalletIds.size} of ${migration.oldWallets.length} done)`}:
            </p>

            {/* Already migrated wallets */}
            {migration.oldWallets.filter(w => migratedWalletIds.has(w.id)).map((wallet) => (
              <div
                key={wallet.id}
                className="w-full p-3 border border-green-500/30 bg-green-500/5 rounded-lg opacity-75"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <p className="font-mono text-sm text-white">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </p>
                  </div>
                  <span className="text-xs text-green-400">{getChainName(wallet.chainId)} — Done</span>
                </div>
              </div>
            ))}

            {/* Remaining wallets */}
            {remainingWallets.map((wallet) => {
              const isSelected = selectedWallet === wallet.id

              return (
                <div key={wallet.id}>
                  <button
                    onClick={() => handleSelectWallet(wallet.id, wallet.chainId, wallet.address)}
                    className={`w-full p-3 text-left border rounded-lg transition-colors ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-white/10 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <p className="font-mono text-sm text-white">
                        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                      </p>
                      <span className="text-xs text-gray-400">{getChainName(wallet.chainId)}</span>
                    </div>
                  </button>

                  {isSelected && loadingBalance && (
                    <div className="mt-2 p-3 bg-white/5 rounded-lg flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      <span className="text-xs text-gray-400">Loading assets...</span>
                    </div>
                  )}
                  {isSelected && !loadingBalance && walletBalance && (
                    <div className="mt-2 p-3 bg-white/5 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-amber-400">Assets to transfer:</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-white">{walletBalance.native.symbol}</span>
                        <span className="text-gray-300">{parseFloat(walletBalance.native.formattedBalance).toFixed(6)}</span>
                      </div>
                      {walletBalance.tokens.filter(t => parseFloat(t.balance) > 0).map((token) => (
                        <div key={token.address} className="flex justify-between text-sm">
                          <span className="text-white">{token.symbol}</span>
                          <span className="text-gray-300">{parseFloat(token.formattedBalance).toFixed(6)}</span>
                        </div>
                      ))}
                      {walletBalance.tokens.filter(t => parseFloat(t.balance) > 0).length === 0 && (
                        <p className="text-xs text-gray-500">No ERC-20 tokens found</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {remainingWallets.length === 0 && migratedWalletIds.size > 0 && (
              <p className="text-sm text-green-300 text-center py-2">
                All wallets migrated!
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleStartTransfer}
                disabled={!selectedWallet}
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white disabled:opacity-50"
              >
                Migrate Selected
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              {migratedWalletIds.size > 0 && remainingWallets.length > 0 && (
                <Button
                  onClick={handleFinishEarly}
                  variant="outline"
                  className="border-white/20 text-amber-200 hover:bg-white/5"
                >
                  Finish
                </Button>
              )}
            </div>
          </div>
        )

      case 'password':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
              <Shield className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <div className="text-sm text-gray-200">
                <p>Migrating <strong className="text-white">{getChainName(selectedWalletChainId)}</strong> wallet</p>
                <p className="font-mono text-xs mt-1 text-slate-400">
                  {selectedWalletAddress.slice(0, 6)}...{selectedWalletAddress.slice(-4)}
                </p>
              </div>
            </div>
            <input
              type="password"
              placeholder="Enter your old wallet password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-slate-600 bg-slate-800 text-white rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              onKeyDown={(e) => e.key === 'Enter' && password && handleTransfer()}
            />
            {transferError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{transferError}</p>
              </div>
            )}
            <Button
              onClick={handleTransfer}
              disabled={!password || isTransferring}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white disabled:opacity-50"
            >
              {isTransferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  Transfer All Assets
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )

      case 'wallet-done':
        return (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" />
            <h3 className="text-base font-semibold text-white">
              {getChainName(selectedWalletChainId)} Wallet Migrated!
            </h3>
            <p className="text-sm text-gray-200">
              You have <strong className="text-white">{remainingWallets.length}</strong> more wallet{remainingWallets.length !== 1 ? 's' : ''} to migrate.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setStep('review')}
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
              >
                Migrate Next Wallet
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                onClick={handleFinishEarly}
                variant="outline"
                className="border-white/20 text-amber-200 hover:bg-white/5"
              >
                Finish
              </Button>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
            <h3 className="text-lg font-semibold text-white">Migration Complete!</h3>
            <p className="text-sm text-gray-300">
              {migratedWalletIds.size === migration.oldWallets.length
                ? 'All wallets have been migrated.'
                : `${migratedWalletIds.size} of ${migration.oldWallets.length} wallets migrated.`
              }
              {' '}You can now use social login, passkeys, and more — no more password prompts.
            </p>
            {allTxHashes.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs text-gray-400">Transaction hashes:</p>
                {allTxHashes.map((tx, i) => (
                  <a
                    key={i}
                    href={getExplorerTxUrl(tx.chainId, tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-amber-400 hover:text-amber-300 font-mono"
                  >
                    {getChainName(tx.chainId)}: {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                  </a>
                ))}
              </div>
            )}
            <Button
              onClick={() => onOpenChange(false)}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
            >
              Done
            </Button>
          </div>
        )
    }
  }

  const stepTitles: Record<WizardStep, string> = {
    connect: 'Step 1: Connect New Wallet',
    review: 'Step 2: Select Wallet to Migrate',
    password: 'Step 3: Authorize Transfer',
    'wallet-done': 'Wallet Migrated',
    complete: 'Migration Complete',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md text-white"
        style={{
          background: 'rgba(15, 15, 15, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5 text-amber-400" />
            {stepTitles[step]}
          </DialogTitle>
        </DialogHeader>
        <div className="px-2">
          {renderStep()}
        </div>

        {/* Step indicator */}
        {step !== 'complete' && step !== 'wallet-done' && (
          <div className="flex justify-center gap-2 pt-2">
            {(['connect', 'review', 'password'] as WizardStep[]).map((s, i) => (
              <div
                key={s}
                className={`h-1.5 w-8 rounded-full ${
                  s === step
                    ? 'bg-amber-500'
                    : ['connect', 'review', 'password'].indexOf(step) > i
                    ? 'bg-amber-500/50'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
