/**
 * Casino Service - VyreCasino Contract Operations
 *
 * Pure functions for reading VyreCasino state.
 * Handles house edge, referrals, whitelisted tokens, etc.
 *
 * ⚡ PERFORMANCE OPTIMIZATIONS:
 * 1. Singleton publicClient (avoid recreation)
 * 2. Promise.all for parallel reads
 * 3. Config cache with 60s TTL (rarely changes)
 *
 * 🔧 MAINTAINABILITY:
 * - Uses centralized ABIs from @vyrejack/shared
 * - Pure functions, no React dependencies
 */

import { createPublicClient, http } from 'viem';
import { VYRECASINO_ABI } from '@vyrejack/shared';
import type { CasinoConfig } from '@vyrejack/shared';
import { riseTestnet, VYRECASINO_ADDRESS } from '@/lib/contract';

// ⚡ Shared public client - singleton pattern
const publicClient = createPublicClient({
  chain: riseTestnet,
  transport: http(),
});

// ⚡ Config cache - rarely changes, avoid unnecessary RPC calls
let configCache: { data: CasinoConfig; timestamp: number } | null = null;
const CONFIG_CACHE_TTL = 60_000; // 60 seconds

/**
 * Get casino configuration (cached for 60s)
 * ⚡ Saves 5 RPC calls when hitting cache
 */
async function getConfig(): Promise<CasinoConfig> {
  // Check cache first
  if (configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL) {
    return configCache.data;
  }

  const [houseEdgeBps, referralShareBps, treasuryShareBps, buybackShareBps, paused] =
    await Promise.all([
      publicClient.readContract({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        functionName: 'houseEdgeBps',
      }),
      publicClient.readContract({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        functionName: 'referralShareBps',
      }),
      publicClient.readContract({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        functionName: 'treasuryShareBps',
      }),
      publicClient.readContract({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        functionName: 'buybackShareBps',
      }),
      publicClient.readContract({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        functionName: 'paused',
      }),
    ]);

  const result: CasinoConfig = {
    houseEdgeBps: Number(houseEdgeBps),
    referralShareBps: Number(referralShareBps),
    treasuryShareBps: Number(treasuryShareBps),
    buybackShareBps: Number(buybackShareBps),
    paused: paused as boolean,
  };

  // Update cache
  configCache = { data: result, timestamp: Date.now() };

  return result;
}

/**
 * Check if a token is whitelisted
 */
async function isTokenWhitelisted(token: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: VYRECASINO_ADDRESS,
    abi: VYRECASINO_ABI,
    functionName: 'whitelistedTokens',
    args: [token],
  }) as Promise<boolean>;
}

/**
 * Check if a game is registered
 */
async function isGameRegistered(game: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: VYRECASINO_ADDRESS,
    abi: VYRECASINO_ABI,
    functionName: 'registeredGames',
    args: [game],
  }) as Promise<boolean>;
}

/**
 * Get referral earnings for a user and token
 */
async function getReferralEarnings(referrer: `0x${string}`, token: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: VYRECASINO_ADDRESS,
    abi: VYRECASINO_ABI,
    functionName: 'referralEarnings',
    args: [referrer, token],
  }) as Promise<bigint>;
}

/**
 * Get a player's referrer
 */
async function getReferrer(player: `0x${string}`): Promise<`0x${string}`> {
  return publicClient.readContract({
    address: VYRECASINO_ADDRESS,
    abi: VYRECASINO_ABI,
    functionName: 'referrers',
    args: [player],
  }) as Promise<`0x${string}`>;
}

/**
 * Get available chip tiers for a player
 */
async function getAvailableChipTiers(
  player: `0x${string}`,
  token: `0x${string}`
): Promise<boolean[]> {
  const result = await publicClient.readContract({
    address: VYRECASINO_ADDRESS,
    abi: VYRECASINO_ABI,
    functionName: 'getAvailableChipTiers',
    args: [player, token],
  }) as readonly boolean[];
  return [...result];
}

export const CasinoService = {
  getConfig,
  isTokenWhitelisted,
  isGameRegistered,
  getReferralEarnings,
  getReferrer,
  getAvailableChipTiers,
  publicClient,
  address: VYRECASINO_ADDRESS,
} as const;
