'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, ArrowRight, Sparkles } from 'lucide-react'
import { useMigration } from '@/hooks/useMigration'

interface MigrationBannerProps {
  onStartMigration: () => void
}

export function MigrationBanner({ onStartMigration }: MigrationBannerProps) {
  const { needsMigration, optOut } = useMigration()
  const [dismissed, setDismissed] = useState(false)

  if (!needsMigration || dismissed) {
    return null
  }

  return (
    <div className="relative bg-gradient-to-r from-amber-900/60 to-orange-900/60 border border-amber-500/50 rounded-lg p-5 mb-4">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-base font-bold text-white">
            Upgrade Your Wallet Experience
          </h3>
          <p className="text-sm text-gray-200 mt-1.5 leading-relaxed">
            Switch to a new secure in-app wallet with social login, passkeys, and no more password prompts.
            Your existing funds can be transferred in one step.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <Button
              size="sm"
              onClick={onStartMigration}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 font-semibold"
            >
              Start Migration
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
            <button
              onClick={async () => {
                await optOut()
                setDismissed(true)
              }}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
