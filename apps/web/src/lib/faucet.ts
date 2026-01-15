/**
 * Faucet Contract Configuration
 * 
 * CHIPFaucet contract address and configuration.
 */

import { CHIP_FAUCET_ABI } from '@vyrejack/shared';
import { riseTestnet, CHIP_TOKEN_ADDRESS, CHIP_FAUCET_ADDRESS } from './contract';

export { CHIP_FAUCET_ABI };
export { riseTestnet };
export { CHIP_TOKEN_ADDRESS, CHIP_FAUCET_ADDRESS };

// Faucet configuration
export const FAUCET_CONFIG = {
    /** Amount given per claim (in CHIP, 18 decimals) */
    defaultAmountPerClaim: 1000n * 10n ** 18n,
    /** Default cooldown between claims (in seconds) */
    defaultCooldown: 3600, // 1 hour
} as const;

