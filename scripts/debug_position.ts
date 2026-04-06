
import { createPublicClient, http, formatUnits } from 'viem';
import { kalychain, kalychainTestnet } from '../src/config/chains';
import { getKalySwapV3Service } from '../src/services/dex/KalySwapV3Service';
import { CHAIN_IDS } from '../src/config/chains';

async function main() {
    const chainId = CHAIN_IDS.KALYCHAIN_TESTNET;
    const rpcUrl = 'https://rpc-testnet.kalycoin.io/rpc'; // Hardcoded for script safety

    // Setup client
    const publicClient = createPublicClient({
        chain: kalychainTestnet,
        transport: http(rpcUrl)
    });

    console.log('Fetching position 1...');

    const service = getKalySwapV3Service(chainId);
    if (!service) throw new Error('V3 not available on this chain');
    const tokenId = 1n; // User's position ID from screenshot

    try {
        const position = await service.getV3Position(tokenId, publicClient);

        if (!position) {
            console.log('Position not found');
            return;
        }

        console.log('Position Details:');
        console.log(`Token0: ${position.token0}`);
        console.log(`Token1: ${position.token1}`);
        console.log(`Liquidity: ${position.liquidity.toString()}`);

        console.log('\n--- RAW VALUES ---');
        console.log(`tokensOwed0 (Raw): ${position.tokensOwed0.toString()}`);
        console.log(`tokensOwed1 (Raw): ${position.tokensOwed1.toString()}`);

        console.log('\n--- FORMATTED VALUES (assuming 18 decimals) ---');
        console.log(`tokensOwed0 (Formatted): ${formatUnits(position.tokensOwed0, 18)}`);
        console.log(`tokensOwed1 (Formatted): ${formatUnits(position.tokensOwed1, 18)}`);

    } catch (error) {
        console.error('Error fetching position:', error);
    }
}

main();
