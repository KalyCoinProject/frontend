'use client';

/**
 * ProtocolVersionToggle
 * A UI component for switching between V2 and V3 protocols.
 * Features a sleek toggle design with visual feedback.
 */

import React from 'react';
import { useProtocolVersion, ProtocolVersion } from '@/contexts/ProtocolVersionContext';

interface ProtocolVersionToggleProps {
    className?: string;
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export default function ProtocolVersionToggle({
    className = '',
    showLabel = true,
    size = 'md',
}: ProtocolVersionToggleProps) {
    const { protocolVersion, setProtocolVersion, isV3Supported, isLoading } = useProtocolVersion();

    // Size configurations
    const sizeConfig = {
        sm: {
            container: 'h-7 text-xs',
            button: 'px-2 py-1',
            gap: 'gap-0.5',
        },
        md: {
            container: 'h-9 text-sm',
            button: 'px-3 py-1.5',
            gap: 'gap-1',
        },
        lg: {
            container: 'h-11 text-base',
            button: 'px-4 py-2',
            gap: 'gap-1.5',
        },
    };

    const config = sizeConfig[size];

    // Don't render if loading
    if (isLoading) {
        return (
            <div className={`flex items-center ${config.gap} ${className}`}>
                {showLabel && <span className="text-gray-400 mr-2">Protocol:</span>}
                <div className={`animate-pulse bg-gray-700 rounded-lg ${config.container} w-24`} />
            </div>
        );
    }

    const handleVersionChange = (version: ProtocolVersion) => {
        if (version === 'v3' && !isV3Supported) return;
        setProtocolVersion(version);
    };

    return (
        <div className={`flex flex-wrap items-center ${config.gap} ${className}`}>
            {showLabel && (
                <span className="text-gray-400 mr-2 font-medium">Protocol:</span>
            )}

            <div className={`flex items-center bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50 ${config.container}`}>
                {/* V2 Button */}
                <button
                    onClick={() => handleVersionChange('v2')}
                    className={`
            ${config.button}
            rounded-md font-semibold transition-all duration-200
            ${protocolVersion === 'v2'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                        }
          `}
                >
                    V2
                </button>

                {/* V3 Button */}
                <button
                    onClick={() => handleVersionChange('v3')}
                    disabled={!isV3Supported}
                    className={`
            ${config.button}
            rounded-md font-semibold transition-all duration-200
            ${!isV3Supported
                            ? 'text-gray-600 cursor-not-allowed'
                            : protocolVersion === 'v3'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                        }
          `}
                    title={!isV3Supported ? 'V3 not available on this chain' : 'Switch to V3'}
                >
                    V3
                    {!isV3Supported && (
                        <span className="ml-1 text-[10px] opacity-60">(soon)</span>
                    )}
                </button>
            </div>

            {/* V3 Badge when active */}
            {protocolVersion === 'v3' && isV3Supported && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30 whitespace-nowrap">
                    Concentrated Liquidity
                </span>
            )}
        </div>
    );
}

// Compact version for mobile/inline use
export function ProtocolVersionBadge({ className = '' }: { className?: string }) {
    const { protocolVersion, toggleVersion, isV3Supported } = useProtocolVersion();

    return (
        <button
            onClick={toggleVersion}
            disabled={!isV3Supported && protocolVersion === 'v2'}
            className={`
        px-2 py-1 text-xs font-bold rounded-md transition-all duration-200
        ${protocolVersion === 'v3'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }
        ${!isV3Supported && protocolVersion === 'v2' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${className}
      `}
            title={isV3Supported ? 'Click to toggle protocol version' : 'V3 coming soon'}
        >
            {protocolVersion.toUpperCase()}
        </button>
    );
}
