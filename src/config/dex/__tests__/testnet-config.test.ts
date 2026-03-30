
import { describe, it, expect } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { getDexConfig, isSupportedDexChain, getFactoryAddress, getRouterAddress } from '@/config/dex';
import { KALYSWAP_TESTNET_CONFIG } from '@/config/dex/kalyswap-testnet';
import { KALYCHAIN_TESTNET_TOKENS } from '@/config/dex/tokens/kalychain-testnet';

describe('V3 Testnet Configuration', () => {
    const TESTNET_ID = CHAIN_IDS.KALYCHAIN_TESTNET;

    it('should recognize Testnet (3889) as a supported DEX chain', () => {
        expect(isSupportedDexChain(TESTNET_ID)).toBe(true);
    });

    it('should return the correct configuration for Testnet', () => {
        const config = getDexConfig(TESTNET_ID);
        expect(config).toBeDefined();
        expect(config?.name).toBe('KalySwap Testnet');
        expect(config?.factory).toBe(KALYSWAP_TESTNET_CONFIG.factory);
        expect(config?.router).toBe(KALYSWAP_TESTNET_CONFIG.router);
    });

    it('should return the specific Testnet token list', () => {
        const config = getDexConfig(TESTNET_ID);
        expect(config?.tokens).toBeDefined();
        expect(config?.tokens.length).toBeGreaterThan(0);

        // Verify specific test tokens are present
        const tKLS = config?.tokens.find(t => t.symbol === 'tKLS');
        const BUSD = config?.tokens.find(t => t.symbol === 'BUSD');

        expect(tKLS).toBeDefined();
        expect(tKLS?.address).toBe('0x5850B207c470C1F2F4c1ca6B1f624d4C28B729a1');

        expect(BUSD).toBeDefined();
        expect(BUSD?.address).toBe('0xA510Df56F2aa3f7241da94F2cF053C1bf02E1168');
    });

    it('should correctly resolve helper functions for Testnet', () => {
        const factory = getFactoryAddress(TESTNET_ID);
        const router = getRouterAddress(TESTNET_ID);

        expect(factory).toBe('0xCd4AA7D066efc78793d19A9aE64B6798767B0c34');
        expect(router).toBe('0x7fD3173Eef473F64AD4553169D6d334d42Df1d95');
    });
});
