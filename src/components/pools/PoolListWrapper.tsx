'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { PoolData } from '@/hooks/usePoolDiscovery';

interface PoolListWrapperProps {
  onAddLiquidity: (pool: PoolData) => void;
}

// Dynamically import PoolList to prevent SSR issues with Wagmi
const PoolList = dynamic(
  () => import('./PoolList').catch(() => {
    // Fallback component if import fails
    return {
      default: () => (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8 text-red-600">
                <span>Error loading pool list. Please refresh the page.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    };
  }),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading pools...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
);

export default function PoolListWrapper({ onAddLiquidity }: PoolListWrapperProps) {
  return <PoolList onAddLiquidity={onAddLiquidity} />;
}
