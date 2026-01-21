/**
 * Token Service - ERC20 Token Operations
 *
 * Pure functions for reading token state.
 * No React dependencies - usable by frontend and backend.
 *
 * ⚡ PERFORMANCE OPTIMIZATIONS:
 * 1. Singleton publicClient (avoid recreation)
 * 2. Promise.all for parallel reads
 * 3. decimalsCache (immutable, never expires)
 * 4. symbolCache (immutable, never expires)
 * 5. nameCache (immutable, never expires)
 *
 * 🔧 MAINTAINABILITY:
 * - Uses centralized ABIs from @vyrejack/shared
 * - Pure functions, no React dependencies
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { ERC20_ABI } from '@vyrejack/shared';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';
import { riseTestnet, VYRECASINO_ADDRESS } from '@/lib/contract';
import { logger } from '@/lib/logger';

// ⚡ Shared public client - singleton pattern
const publicClient = createPublicClient({
  chain: riseTestnet,
  transport: http(),
});

// ⚡ Token metadata caches - immutable data, cache forever
const decimalsCache = new Map<string, number>();
const symbolCache = new Map<string, string>();
const nameCache = new Map<string, string>();

// ⚡ Allowance cache - 30s TTL to reduce redundant calls
const ALLOWANCE_CACHE_TTL_MS = 30000;
const allowanceCache = new Map<string, { result: AllowanceState; expiry: number }>();

/**
 * Invalidate allowance cache for a specific owner
 * Call this after approval transactions
 */
function invalidateAllowanceCache(token?: string, owner?: string): void {
  if (!token && !owner) {
    // Clear all
    allowanceCache.clear();
    logger.log('[TokenService] Allowance cache cleared');
    return;
  }

  const tokenLower = token?.toLowerCase();
  const ownerLower = owner?.toLowerCase();

  for (const key of allowanceCache.keys()) {
    const shouldDelete =
      (tokenLower && key.includes(tokenLower)) || (ownerLower && key.includes(ownerLower));
    if (shouldDelete) {
      allowanceCache.delete(key);
    }
  }
  logger.log('[TokenService] Allowance cache invalidated for:', { token, owner });
}

/**
 * Get token decimals (cached forever - immutable)
 * ⚡ Cache hit avoids RPC call entirely
 */
async function getDecimals(token: `0x${string}`): Promise<number> {
  const key = token.toLowerCase();
  if (decimalsCache.has(key)) {
    return decimalsCache.get(key)!;
  }

  const decimals = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  decimalsCache.set(key, decimals);
  return decimals;
}

/**
 * Get token balance for account
 */
async function getBalance(token: `0x${string}`, account: `0x${string}`): Promise<TokenBalance> {
  const [raw, decimals] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    }),
    getDecimals(token),
  ]);

  return {
    raw,
    formatted: formatUnits(raw, decimals),
    decimals,
  };
}

/**
 * Get allowance for spender (defaults to VyreCasino)
 * ⚡ Uses 30s TTL cache to reduce redundant calls
 */
async function getAllowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}` = VYRECASINO_ADDRESS
): Promise<AllowanceState> {
  // ⚡ Check cache first
  const cacheKey = `${token}-${owner}-${spender}`.toLowerCase();
  const cached = allowanceCache.get(cacheKey);

  if (cached && cached.expiry > Date.now()) {
    logger.log('[TokenService] getAllowance CACHE HIT:', cacheKey.slice(0, 30));
    return cached.result;
  }

  logger.log('[TokenService] getAllowance called:', {
    token: token,
    owner: owner,
    spender: spender,
  });

  const amount = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });

  // Consider "unlimited" if allowance is greater than 1e30
  const isUnlimited = amount > 10n ** 30n;
  const isApproved = amount > 0n;

  const result: AllowanceState = {
    amount,
    isUnlimited,
    isApproved,
  };

  // ⚡ Cache result with TTL
  allowanceCache.set(cacheKey, { result, expiry: Date.now() + ALLOWANCE_CACHE_TTL_MS });

  logger.log('[TokenService] getAllowance result:', {
    amount: amount.toString(),
    isUnlimited,
    isApproved,
  });

  return result;
}

/**
 * Get token symbol (cached forever - immutable)
 * ⚡ Cache hit avoids RPC call entirely
 */
async function getSymbol(token: `0x${string}`): Promise<string> {
  const key = token.toLowerCase();
  if (symbolCache.has(key)) {
    return symbolCache.get(key)!;
  }

  const symbol = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'symbol',
  });

  symbolCache.set(key, symbol);
  return symbol;
}

/**
 * Get token name (cached forever - immutable)
 * ⚡ Cache hit avoids RPC call entirely
 */
async function getName(token: `0x${string}`): Promise<string> {
  const key = token.toLowerCase();
  if (nameCache.has(key)) {
    return nameCache.get(key)!;
  }

  const name = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'name',
  });

  nameCache.set(key, name);
  return name;
}

/**
 * Get full token info
 */
async function getTokenInfo(token: `0x${string}`) {
  const [name, symbol, decimals] = await Promise.all([
    getName(token),
    getSymbol(token),
    getDecimals(token),
  ]);

  return { address: token, name, symbol, decimals };
}

export const TokenService = {
  getBalance,
  getAllowance,
  getDecimals,
  getSymbol,
  getName,
  getTokenInfo,
  invalidateAllowanceCache,
  publicClient,
} as const;
