import { swapLogger } from '@/lib/logger';
import { useState, useEffect } from 'react';

// GraphQL queries for backend API (which queries the DEX subgraph)
const GET_SWAPS = `
  query GetSwaps($first: Int, $skip: Int, $userAddress: String) {
    swaps(first: $first, skip: $skip, userAddress: $userAddress) {
      id
      transaction {
        id
        timestamp
      }
      timestamp
      pair {
        id
        token0 {
          id
          symbol
          name
          decimals
        }
        token1 {
          id
          symbol
          name
          decimals
        }
      }
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      amountUSD
    }
  }
`;

// Transaction interfaces
export interface DexTransaction {
  id: string;
  type: 'SWAP' | 'MINT' | 'BURN';
  hash: string;
  timestamp: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Amount: string;
  token1Amount: string;
  amountUSD: string;
  sender: string;
  to: string;
}

interface UseDexDataProps {
  pairAddress?: string;
  userAddress?: string | null;
  first?: number;
  skip?: number;
}

interface DexDataResult {
  transactions: DexTransaction[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refetch: () => void;
}

export function useDexData({
  pairAddress,
  userAddress,
  first = 10,
  skip = 0
}: UseDexDataProps): DexDataResult {
  const [transactions, setTransactions] = useState<DexTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Use backend GraphQL API to fetch swap data from DEX subgraph
      const variables = {
        first,
        skip,
        userAddress: userAddress?.toLowerCase()
      };

      swapLogger.debug('Fetching DEX transactions via backend API:', variables);

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: GET_SWAPS, variables })
      });

      const result = await response.json();
      if (result.errors) {
        swapLogger.error('GraphQL errors:', result.errors);
        throw new Error(result.errors[0].message);
      }

      swapLogger.debug('DEX subgraph response:', result.data);

      // Process the swap data from subgraph
      let swapTransactions: DexTransaction[] = [];

      if (result.data?.swaps) {
        swapTransactions = result.data.swaps.map((swap: any) => ({
          id: swap.id,
          type: 'SWAP' as const,
          hash: swap.transaction.id,
          timestamp: new Date(parseInt(swap.timestamp) * 1000).toISOString(),
          token0Symbol: swap.pair.token0.symbol,
          token1Symbol: swap.pair.token1.symbol,
          token0Amount: swap.amount0In !== '0' ? swap.amount0In : swap.amount0Out,
          token1Amount: swap.amount1In !== '0' ? swap.amount1In : swap.amount1Out,
          amountUSD: swap.amountUSD || '0',
          sender: swap.sender,
          to: swap.to
        }));
      }

      swapLogger.debug(`Processed ${swapTransactions.length} swap transactions from subgraph`);

      // If no data from subgraph, fall back to mock data for development
      if (swapTransactions.length === 0) {
        swapLogger.debug('No data from subgraph, using mock data for development');
        swapTransactions = getMockTransactions(userAddress);
      }

      // Filter for user transactions if userAddress is provided
      const filteredTransactions = userAddress && swapTransactions.length > 0
        ? swapTransactions.filter(tx =>
            tx.sender.toLowerCase() === userAddress.toLowerCase() ||
            tx.to.toLowerCase() === userAddress.toLowerCase()
          )
        : swapTransactions;

      setTransactions(filteredTransactions);
      setTotalCount(filteredTransactions.length);

    } catch (err) {
      swapLogger.error('Error fetching DEX transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');

      // Fall back to mock data on error
      const mockTransactions = getMockTransactions(userAddress);
      const filteredTransactions = userAddress
        ? mockTransactions.filter(tx =>
            tx.sender.toLowerCase() === userAddress.toLowerCase() ||
            tx.to.toLowerCase() === userAddress.toLowerCase()
          )
        : mockTransactions;

      setTransactions(filteredTransactions);
      setTotalCount(filteredTransactions.length);
    } finally {
      setLoading(false);
    }
  };

  // Mock data function for development/fallback
  const getMockTransactions = (userAddress?: string | null): DexTransaction[] => [
        {
          id: '1',
          type: 'SWAP',
          hash: '0x1234567890abcdef1234567890abcdef12345678',
          timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
          token0Symbol: 'KLC',
          token1Symbol: 'USDT',
          token0Amount: '100.0',
          token1Amount: '30.0',
          amountUSD: '30.00',
          sender: userAddress || '0xabcd1234567890abcdef1234567890abcdef1234',
          to: '0xefgh5678901234567890abcdef1234567890abcd'
        },
        {
          id: '2',
          type: 'SWAP',
          hash: '0x2345678901bcdef12345678901bcdef123456789',
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
          token0Symbol: 'USDT',
          token1Symbol: 'KLC',
          token0Amount: '75.0',
          token1Amount: '250.0',
          amountUSD: '75.00',
          sender: '0x1234abcd567890abcdef1234567890abcdef1234',
          to: '0x5678efgh901234567890abcdef1234567890abcd'
        },
        {
          id: '3',
          type: 'SWAP',
          hash: '0x3456789012cdef123456789012cdef1234567890',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          token0Symbol: 'KLC',
          token1Symbol: 'USDT',
          token0Amount: '500.0',
          token1Amount: '150.0',
          amountUSD: '150.00',
          sender: '0x9012cdef345678901234567890abcdef12345678',
          to: '0x3456789012cdef123456789012cdef1234567890'
        },
        {
          id: '4',
          type: 'SWAP',
          hash: '0x4567890123def456789012def45678901234567890',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          token0Symbol: 'USDT',
          token1Symbol: 'KLC',
          token0Amount: '50.0',
          token1Amount: '166.67',
          amountUSD: '50.00',
          sender: userAddress || '0xabcd1234567890abcdef1234567890abcdef1234',
          to: '0x4567890123def456789012def45678901234567890'
        },
        {
          id: '5',
          type: 'SWAP',
          hash: '0x567890123def567890123def567890123def567890',
          timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
          token0Symbol: 'KLC',
          token1Symbol: 'USDT',
          token0Amount: '200.0',
          token1Amount: '60.0',
          amountUSD: '60.00',
          sender: '0x567890123def567890123def567890123def5678',
          to: '0x890123def567890123def567890123def56789012'
        }
      ];

  useEffect(() => {
    fetchTransactions();
  }, [pairAddress, userAddress, first, skip]);

  return {
    transactions,
    loading,
    error,
    totalCount,
    refetch: fetchTransactions
  };
}

// GraphQL queries for when backend integration is ready
export const GET_RECENT_TRANSACTIONS = `
  query GetRecentTransactions($first: Int!, $skip: Int!, $pairAddress: String) {
    swaps(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $pairAddress }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      amountUSD
    }
    mints(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $pairAddress }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0
      amount1
      amountUSD
    }
    burns(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $pairAddress }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0
      amount1
      amountUSD
    }
  }
`;

export const GET_USER_TRANSACTIONS = `
  query GetUserTransactions($userAddress: String!, $first: Int!, $skip: Int!, $pairAddress: String) {
    swaps(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { 
        and: [
          { pair: $pairAddress }
          { or: [{ sender: $userAddress }, { to: $userAddress }] }
        ]
      }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      amountUSD
    }
    mints(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { 
        and: [
          { pair: $pairAddress }
          { or: [{ sender: $userAddress }, { to: $userAddress }] }
        ]
      }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0
      amount1
      amountUSD
    }
    burns(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: { 
        and: [
          { pair: $pairAddress }
          { or: [{ sender: $userAddress }, { to: $userAddress }] }
        ]
      }
    ) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      amount0
      amount1
      amountUSD
    }
  }
`;
