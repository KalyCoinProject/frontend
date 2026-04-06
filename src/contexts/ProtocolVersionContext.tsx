'use client';

/**
 * ProtocolVersionContext
 * Manages the V2/V3 protocol version toggle state across the application.
 * Persists selection in localStorage for user preference.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isV3Available } from '@/config/dex/v3-config';
import { DEFAULT_CHAIN_ID } from '@/config/contracts';

// Protocol versions
export type ProtocolVersion = 'v2' | 'v3';

// Context type
interface ProtocolVersionContextType {
    protocolVersion: ProtocolVersion;
    setProtocolVersion: (version: ProtocolVersion) => void;
    toggleVersion: () => void;
    isV3: boolean;
    isV2: boolean;
    isV3Supported: boolean;
    isLoading: boolean;
}

// Storage key for persistence
const STORAGE_KEY = 'kalyswap_protocol_version';

// Default version
const DEFAULT_VERSION: ProtocolVersion = 'v2';

// Create context
const ProtocolVersionContext = createContext<ProtocolVersionContextType | undefined>(undefined);

// Provider component
export function ProtocolVersionProvider({ children }: { children: React.ReactNode }) {
    const [protocolVersion, setProtocolVersionState] = useState<ProtocolVersion>(DEFAULT_VERSION);
    const [isLoading, setIsLoading] = useState(true);
    const [isV3Supported, setIsV3Supported] = useState(false);

    // Check V3 support on mount
    useEffect(() => {
        const checkV3Support = () => {
            try {
                const supported = isV3Available(DEFAULT_CHAIN_ID);
                setIsV3Supported(supported);
            } catch {
                setIsV3Supported(false);
            }
        };
        checkV3Support();
    }, []);

    // Load saved preference from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'v2' || saved === 'v3') {
                // Only use V3 if it's supported
                if (saved === 'v3' && !isV3Supported) {
                    setProtocolVersionState('v2');
                } else {
                    setProtocolVersionState(saved);
                }
            }
        } catch (error) {
            // localStorage not available (SSR or private browsing)
            console.warn('Could not access localStorage for protocol version');
        } finally {
            setIsLoading(false);
        }
    }, [isV3Supported]);

    // Save preference to localStorage when it changes
    const setProtocolVersion = useCallback((version: ProtocolVersion) => {
        // Prevent switching to V3 if not supported
        if (version === 'v3' && !isV3Supported) {
            console.warn('V3 is not supported on this chain');
            return;
        }

        setProtocolVersionState(version);
        try {
            localStorage.setItem(STORAGE_KEY, version);
        } catch (error) {
            console.warn('Could not save protocol version to localStorage');
        }
    }, [isV3Supported]);

    // Toggle between V2 and V3
    const toggleVersion = useCallback(() => {
        setProtocolVersion(protocolVersion === 'v2' ? 'v3' : 'v2');
    }, [protocolVersion, setProtocolVersion]);

    // Convenience booleans
    const isV3 = protocolVersion === 'v3';
    const isV2 = protocolVersion === 'v2';

    return (
        <ProtocolVersionContext.Provider
            value={{
                protocolVersion,
                setProtocolVersion,
                toggleVersion,
                isV3,
                isV2,
                isV3Supported,
                isLoading,
            }}
        >
            {children}
        </ProtocolVersionContext.Provider>
    );
}

// Hook for consuming the context
export function useProtocolVersion() {
    const context = useContext(ProtocolVersionContext);
    if (context === undefined) {
        throw new Error('useProtocolVersion must be used within a ProtocolVersionProvider');
    }
    return context;
}

// Export for external use
export { ProtocolVersionContext };
