'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertCircle,
  Loader2,
  Plus
} from 'lucide-react';
import { usePoolDiscovery, PoolData } from '@/hooks/usePoolDiscovery';
import PoolCard from './PoolCard';
import ProtocolVersionToggle from '@/components/swap/ProtocolVersionToggle';
import { useProtocolVersion } from '@/contexts/ProtocolVersionContext';
import V3PositionsList from '@/components/liquidity/v3/V3PositionsList';

interface PoolListProps {
  onAddLiquidity?: (pool: PoolData) => void;
}

export default function PoolList({ onAddLiquidity }: PoolListProps) {
  const {
    pools,
    allPools,
    loading,
    error,
    searchTerm,
    sortBy,
    sortOrder,
    setSearchTerm,
    setSorting,
    refetch
  } = usePoolDiscovery();

  const { isV3 } = useProtocolVersion();

  const [showFilters, setShowFilters] = useState(false);
  const [showOnlyUserPools, setShowOnlyUserPools] = useState(false);

  // Show loading state if no pools and not in error state
  if (!loading && !error && allPools.length === 0 && !isV3) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Liquidity Pools</h2>
              <p className="text-gray-300 mt-1">
                Discover and provide liquidity to earn trading fees
              </p>
            </div>
            <ProtocolVersionToggle />
          </div>
          <Card className="pools-card">
            <CardContent className="p-8">
              <div className="flex items-center justify-center space-x-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                <span className="text-gray-300">Connecting to blockchain...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If V3, show V3 Positions List and simple header
  if (isV3) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Header with Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Your V3 Positions</h2>
              <p className="text-gray-300 mt-1">
                Manage your concentrated liquidity positions
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ProtocolVersionToggle />
              <Button
                onClick={() => window.location.reload()} // V3 list refetches on mount, maybe explicit refetch later
                variant="outline"
                size="sm"
                className="flex items-center space-x-2 bg-gray-900/30 text-white hover:bg-gray-800/50"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* V3 List */}
          <V3PositionsList />

          {/* Create New Prompt */}
          <Card className="pools-card border-dashed border-gray-700 bg-gray-800/20">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400 mb-4">Want to open a new position?</p>
              <Button onClick={() => window.location.href = '/pools'} className="continue-button">
                <Plus className="h-4 w-4 mr-2" />
                New Position
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Filter pools based on user preference
  const filteredPools = showOnlyUserPools
    ? pools.filter(pool => pool.userHasPosition)
    : pools;

  const userPoolsCount = pools.filter(pool => pool.userHasPosition).length;

  const handleSortChange = (newSortBy: 'liquidity' | 'name') => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same column
      setSorting(newSortBy, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to descending for new column
      setSorting(newSortBy, 'desc');
    }
  };

  const getSortIcon = (column: 'liquidity' | 'name') => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="pools-card border-red-500/30">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-white">Error Loading Pools</h3>
                <p className="text-sm text-gray-300 mt-1">{error}</p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                  size="sm"
                  className="mt-3 bg-gray-900/30 text-red-400 hover:bg-red-900/30 border-red-500/30"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Liquidity Pools</h2>
            <p className="text-gray-300 mt-1">
              Discover and provide liquidity to earn trading fees
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ProtocolVersionToggle />
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              disabled={loading}
              className="flex items-center space-x-2 bg-gray-900/30 text-white hover:bg-gray-800/50"
              style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="pools-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search pools by token name or symbol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/10 backdrop-blur-sm text-white border-white/20 placeholder:text-amber-200/70 focus:border-amber-500/50 focus:bg-white/15"
                />
              </div>

              {/* Filter Toggle */}
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 bg-gray-900/30 text-white hover:bg-gray-800/50"
                style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </Button>
            </div>

            {/* Filter and Sort Options */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-600 space-y-4">
                {/* Pool Filter */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-white mr-2">Show:</span>

                  <Button
                    variant={!showOnlyUserPools ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowOnlyUserPools(false)}
                    className={!showOnlyUserPools ? 'continue-button' : 'bg-gray-900/30 text-white hover:bg-gray-800/50'}
                    style={showOnlyUserPools ? { borderColor: 'rgba(245, 158, 11, 0.3)' } : {}}
                  >
                    All Pools ({allPools.length})
                  </Button>

                  <Button
                    variant={showOnlyUserPools ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowOnlyUserPools(true)}
                    className={`flex items-center space-x-1 ${showOnlyUserPools ? 'continue-button' : 'bg-gray-900/30 text-white hover:bg-gray-800/50'}`}
                    style={!showOnlyUserPools ? { borderColor: 'rgba(245, 158, 11, 0.3)' } : {}}
                  >
                    <span>My Pools ({userPoolsCount})</span>
                  </Button>
                </div>

                {/* Sort Options */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-white mr-2">Sort by:</span>

                  <Button
                    variant={sortBy === 'liquidity' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSortChange('liquidity')}
                    className={`flex items-center space-x-1 ${sortBy === 'liquidity' ? 'continue-button' : 'bg-gray-900/30 text-white hover:bg-gray-800/50'}`}
                    style={sortBy !== 'liquidity' ? { borderColor: 'rgba(245, 158, 11, 0.3)' } : {}}
                  >
                    <span>Liquidity</span>
                    {getSortIcon('liquidity')}
                  </Button>

                  <Button
                    variant={sortBy === 'name' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSortChange('name')}
                    className={`flex items-center space-x-1 ${sortBy === 'name' ? 'continue-button' : 'bg-gray-900/30 text-white hover:bg-gray-800/50'}`}
                    style={sortBy !== 'name' ? { borderColor: 'rgba(245, 158, 11, 0.3)' } : {}}
                  >
                    <span>Name</span>
                    {getSortIcon('name')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pool Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="pools-card">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{allPools.length}</p>
                <p className="text-sm text-gray-300">Total Pools</p>
              </div>
            </CardContent>
          </Card>

          <Card className="pools-card">
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{filteredPools.length}</p>
                <p className="text-sm text-gray-300">
                  {showOnlyUserPools ? 'Your Pools' : 'Showing'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Loading State */}
        {loading && (
          <Card className="pools-card">
            <CardContent className="p-8">
              <div className="flex items-center justify-center space-x-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                <span className="text-gray-300">Loading pools...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pool Grid */}
        {!loading && filteredPools.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPools.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                onAddLiquidity={onAddLiquidity}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredPools.length === 0 && allPools.length > 0 && (
          <Card className="pools-card">
            <CardContent className="p-8">
              <div className="text-center">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No pools found</h3>
                <p className="text-gray-300 mb-4">
                  {showOnlyUserPools
                    ? "You don't have any liquidity positions yet. Start by adding liquidity to a pool."
                    : "No pools match your search criteria. Try adjusting your search terms."
                  }
                </p>
                <div className="flex gap-2 justify-center">
                  {!showOnlyUserPools && (
                    <Button
                      onClick={() => setSearchTerm('')}
                      variant="outline"
                      className="bg-gray-900/30 text-white hover:bg-gray-800/50"
                      style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
                    >
                      Clear Search
                    </Button>
                  )}
                  {showOnlyUserPools && (
                    <Button
                      onClick={() => setShowOnlyUserPools(false)}
                      variant="outline"
                      className="bg-gray-900/30 text-white hover:bg-gray-800/50"
                      style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
                    >
                      View All Pools
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Pools State */}
        {!loading && allPools.length === 0 && (
          <Card className="pools-card">
            <CardContent className="p-8">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No pools available</h3>
                <p className="text-gray-300 mb-4">
                  There are currently no liquidity pools available. Be the first to create one!
                </p>
                <Button
                  onClick={() => window.location.href = '/pools'}
                  className="continue-button"
                >
                  Create First Pool
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
