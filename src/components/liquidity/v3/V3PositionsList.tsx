'use client';

import { useV3Positions } from '@/hooks/useV3Positions';
import V3PositionCard from './V3PositionCard';
import { Loader2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function V3PositionsList() {
    const { positions, loading, error, refetch } = useV3Positions();

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mb-3 text-blue-500" />
                <p>Loading your positions...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-400 mb-4">{error}</p>
                <Button onClick={refetch} variant="outline" size="sm">Try Again</Button>
            </div>
        );
    }

    if (positions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/20">
                <Layers className="h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-gray-300 mb-1">No V3 Positions</h3>
                <p className="text-sm max-w-xs text-center">
                    You don't have any concentrated liquidity positions yet.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positions.map((position) => (
                <V3PositionCard
                    key={position.tokenId.toString()}
                    position={position}
                    onUpdate={refetch}
                />
            ))}
        </div>
    );
}
