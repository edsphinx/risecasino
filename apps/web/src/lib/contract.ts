/**
 * Contract Configuration
 *
 * Loads contract addresses from environment variables with validation.
 * ABIs are imported from centralized @vyrejack/shared package.
 */

import type { Address } from 'viem';

// Import ABIs from centralized package
import {
    VYRECASINO_ABI,
    VYREJACKCORE_ABI,
    VYREJACK_ABI,
    ERC20_ABI,
} from '@vyrejack/shared';

// Re-export ABIs
export { VYREJACK_ABI, VYRECASINO_ABI, VYREJACKCORE_ABI, ERC20_ABI };

// =============================================================================
// ADDRESS VALIDATION
// =============================================================================

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate and return an Ethereum address from env variable
 * @throws Error if address is missing or invalid
 */
function requireAddress(envKey: string): Address {
    const value = import.meta.env[envKey];
    if (!value) {
        throw new Error(`Missing required env variable: ${envKey}`);
    }
    if (!ADDRESS_REGEX.test(value)) {
        throw new Error(`Invalid address format for ${envKey}: ${value}`);
    }
    return value as Address;
}

/**
 * Get optional address from env, returns undefined if not set
 */
function optionalAddress(envKey: string): Address | undefined {
    const value = import.meta.env[envKey];
    if (!value) return undefined;
    if (!ADDRESS_REGEX.test(value)) {
        console.warn(`Invalid address format for ${envKey}: ${value}`);
        return undefined;
    }
    return value as Address;
}

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

export const riseTestnet = {
    id: 11155931,
    name: 'Rise Testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://testnet.riselabs.xyz'] },
    },
    blockExplorers: {
        default: { name: 'Rise Explorer', url: 'https://explorer.testnet.riselabs.xyz' },
    },
} as const;

// =============================================================================
// CONTRACT ADDRESSES (from .env)
// =============================================================================

/** VyreCasino - Central orchestrator for all games */
export const VYRECASINO_ADDRESS = requireAddress('VITE_VYRECASINO_ADDRESS');

/** VyreJackCore - Blackjack game logic (called via VyreCasino) */
export const VYREJACKCORE_ADDRESS = requireAddress('VITE_VYREJACKCORE_ADDRESS');

/** VyreTreasury - Secure vault for casino funds */
export const VYRETREASURY_ADDRESS = requireAddress('VITE_VYRETREASURY_ADDRESS');

/** CHIP Token - Primary betting token */
export const CHIP_TOKEN_ADDRESS = requireAddress('VITE_CHIP_TOKEN_ADDRESS');

/** USDC Token - Alternative betting token */
export const USDC_TOKEN_ADDRESS = requireAddress('VITE_USDC_TOKEN_ADDRESS');

/** CHIP Faucet - Get test CHIP tokens */
export const CHIP_FAUCET_ADDRESS = requireAddress('VITE_CHIP_FAUCET_ADDRESS');

// =============================================================================
// LEGACY STANDALONE CONTRACT (VyreJackETH - uses native ETH)
// =============================================================================

/** Legacy VyreJack standalone contract (ETH betting) */
export const VYREJACK_LEGACY_ADDRESS =
    optionalAddress('VITE_VYREJACK_ADDRESS') ||
    ('0xe17C645aE8dC321B41BA00bbc8B9E392342A0cA2' as Address);

/**
 * @deprecated Use VYREJACKCORE_ADDRESS for new architecture
 */
export function getVyreJackAddress(): Address {
    return VYREJACK_LEGACY_ADDRESS;
}

/** @deprecated Use VYREJACKCORE_ADDRESS */
export const VYREJACK_ADDRESS = VYREJACK_LEGACY_ADDRESS;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Get default betting token (CHIP) */
export function getDefaultBettingToken(): Address {
    return CHIP_TOKEN_ADDRESS;
}

/** Get all whitelisted betting tokens */
export function getWhitelistedTokens(): Address[] {
    return [CHIP_TOKEN_ADDRESS, USDC_TOKEN_ADDRESS];
}

// Log loaded addresses in development
if (import.meta.env.DEV) {
    console.log('🎰 VyreCasino contracts loaded:', {
        casino: VYRECASINO_ADDRESS,
        game: VYREJACKCORE_ADDRESS,
        treasury: VYRETREASURY_ADDRESS,
        chip: CHIP_TOKEN_ADDRESS,
    });
}
