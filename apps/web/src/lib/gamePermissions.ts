/**
 * Game Permissions Configuration
 * Defines session key permissions for VyreCasino architecture
 * 
 * Based on Porto schema analysis (porto-rise/src/core/internal/schema/key.ts):
 * - limit: hex string or bigint (e.g., "0x3e8" or 1000n)
 * - period: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
 * - token: optional - if omitted = native ETH, if provided = ERC20 address
 */

import { keccak256, toHex, parseUnits } from 'viem';
import {
    VYRECASINO_ADDRESS,
    VYREJACKCORE_ADDRESS,
    CHIP_TOKEN_ADDRESS,
    USDC_TOKEN_ADDRESS,
} from './contract';

// Token context type for game versions
export type TokenContext = 'ETH' | 'CHIP' | 'USDC' | 'ALL';

/**
 * Compute function selector from signature
 */
export function getFunctionSelector(signature: string): `0x${string}` {
    return keccak256(toHex(signature)).slice(0, 10) as `0x${string}`;
}

// Contract addresses - lowercase for Porto compatibility
const CASINO_ADDRESS = VYRECASINO_ADDRESS.toLowerCase() as `0x${string}`;
const GAME_ADDRESS = VYREJACKCORE_ADDRESS.toLowerCase() as `0x${string}`;

/**
 * Allowed contract calls for session key
 * COMPLETE SET - All functions players need to call
 */
export const GAME_CALLS = [
    // === VyreCasino - Game & Referrals ===
    { to: CASINO_ADDRESS, signature: getFunctionSelector('play(address,address,uint256,bytes)') },
    { to: CASINO_ADDRESS, signature: getFunctionSelector('setReferrer(address)') },
    { to: CASINO_ADDRESS, signature: getFunctionSelector('claimReferralEarnings(address)') },

    // === VyreJackCore - Game Actions ===
    { to: GAME_ADDRESS, signature: getFunctionSelector('hit()') },
    { to: GAME_ADDRESS, signature: getFunctionSelector('stand()') },
    { to: GAME_ADDRESS, signature: getFunctionSelector('double()') },
    { to: GAME_ADDRESS, signature: getFunctionSelector('surrender()') },
    { to: GAME_ADDRESS, signature: getFunctionSelector('retryVRF()') },

    // === ERC20 - Token Approval ===
    { to: USDC_TOKEN_ADDRESS.toLowerCase() as `0x${string}`, signature: getFunctionSelector('approve(address,uint256)') },
    { to: CHIP_TOKEN_ADDRESS.toLowerCase() as `0x${string}`, signature: getFunctionSelector('approve(address,uint256)') },
];

// Spend permission type matching Porto schema
type SpendPermission = {
    limit: string;
    period: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
    token?: `0x${string}`;
};

/**
 * Get spend limits based on token context
 * Returns correct format for Porto grantPermissions:
 * - ETH: no token field (native)
 * - CHIP/USDC: with token address (ERC20)
 */
export function getSpendLimits(tokenContext?: TokenContext): SpendPermission[] {
    // Daily limits as HEX strings (Porto validation requires ^0x pattern)
    const LIMIT_100_18_DECIMALS = `0x${parseUnits('100', 18).toString(16)}`;
    const LIMIT_100_6_DECIMALS = `0x${parseUnits('100', 6).toString(16)}`;

    switch (tokenContext) {
        case 'ETH':
            return [{
                limit: LIMIT_100_18_DECIMALS,
                period: 'day',
            }];

        case 'CHIP':
            return [{
                limit: LIMIT_100_18_DECIMALS,
                period: 'day',
                token: CHIP_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
            }];

        case 'USDC':
            return [{
                limit: LIMIT_100_6_DECIMALS,
                period: 'day',
                token: USDC_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
            }];

        case 'ALL':
            return [
                {
                    limit: LIMIT_100_18_DECIMALS,
                    period: 'day',
                },
                {
                    limit: LIMIT_100_6_DECIMALS,
                    period: 'day',
                    token: USDC_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
                }
            ];

        default:
            return [];
    }
}

/**
 * Get game permissions based on token context
 */
export function getGamePermissions(tokenContext?: TokenContext) {
    return {
        calls: GAME_CALLS,
        spend: getSpendLimits(tokenContext),
    };
}

// Legacy export for backward compatibility (empty spend limits)
export const SPEND_LIMITS: SpendPermission[] = [];
export const GAME_PERMISSIONS = {
    calls: GAME_CALLS,
    spend: SPEND_LIMITS,
};

/**
 * Check if a contract call is permitted by session key
 */
export function isCallPermitted(to: string, data: string): boolean {
    if (!to || !data) return false;

    const functionSelector = data.slice(0, 10).toLowerCase();
    const targetAddress = to.toLowerCase();

    return GAME_CALLS.some((call) => {
        const permittedAddress = call.to?.toLowerCase();
        const permittedSelector = call.signature?.toLowerCase();

        const addressMatch = !permittedAddress || permittedAddress === targetAddress;
        const selectorMatch = !permittedSelector || permittedSelector === functionSelector;

        return addressMatch && selectorMatch;
    });
}

