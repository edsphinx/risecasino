import { P256, Signature, PublicKey } from 'ox';
import { getProvider } from '@/lib/riseWallet';
import { GAME_CALLS, getSpendLimits, type TokenContext } from '@/lib/gamePermissions';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface SessionKeyData {
  privateKey: string;
  publicKey: string;
  expiry: number;
  createdAt: number;
  address: string; // Wallet address this key belongs to
  context?: TokenContext; // Context this key was created for (ETH/CHIP/USDC)
}

export type { TokenContext };

// Configuration
const SESSION_KEY_STORAGE_PREFIX = 'vyrejack_session_key';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Cache active key in memory
let activeKeyPair: SessionKeyData | null = null;

// =============================================================================
// STORAGE HELPERS
// =============================================================================

function getStorageKey(walletAddress: string): string {
  if (!walletAddress) return 'vyrejack_session_key_unknown';
  // Store one key per wallet address to support multi-account switching
  return `${SESSION_KEY_STORAGE_PREFIX}_${walletAddress.toLowerCase()}`;
}

export function getActiveSessionKey(walletAddress?: string | null): SessionKeyData | null {
  // 1. Check in-memory cache first
  if (activeKeyPair) {
    // If no address specified, return cached key (legacy behavior support)
    // If address specified, ensure it matches
    if (
      !walletAddress ||
      (activeKeyPair.address && activeKeyPair.address.toLowerCase() === walletAddress.toLowerCase())
    ) {
      if (isSessionKeyValid(activeKeyPair)) {
        return activeKeyPair;
      }
    } else {
      // Address mismatch, clear cache
      activeKeyPair = null;
    }
  }

  // 2. Check localStorage
  // We strictly require walletAddress to lookup from storage to prevent leaking keys between accounts
  if (!walletAddress) {
    return null;
  }

  try {
    const storageKey = getStorageKey(walletAddress);
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      const data = JSON.parse(stored) as SessionKeyData;

      // Basic integrity check
      if (data.publicKey && data.privateKey && data.expiry) {
        // Expiry check
        if (isSessionKeyValid(data)) {
          logger.log(
            `🔑 [Session] Key restored from localStorage for ${walletAddress.slice(0, 6)}...`
          );
          activeKeyPair = data;
          return data;
        } else {
          logger.log(
            `🔑 [Session] Stored key expired for ${walletAddress.slice(0, 6)}... clearing.`
          );
          localStorage.removeItem(storageKey);
        }
      }
    }
  } catch (e) {
    logger.error('Error reading session key from storage:', e);
  }

  return null;
}

export function isSessionKeyValid(sessionKey: SessionKeyData | null): boolean {
  if (!sessionKey || !sessionKey.publicKey || !sessionKey.privateKey) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (sessionKey.expiry <= now) {
    return false;
  }

  return true;
}

/**
 * Check if we have a valid session key ready to use for this address
 */
export function hasUsableSessionKey(walletAddress: string | null): boolean {
  return getActiveSessionKey(walletAddress) !== null;
}

// =============================================================================
// CORE ACTIONS - METEORO PATTERN
// =============================================================================

/**
 * Ensure we have a valid session key - reuse existing or create new
 * This is the PREFERRED function to call
 */
export async function ensureSessionKey(
  walletAddress: string,
  tokenContext: TokenContext = 'ALL'
): Promise<SessionKeyData> {
  if (!walletAddress) throw new Error('Wallet address required');

  // 1. Trust LocalStorage first (Meteoro pattern)
  // We DO NOT validate against Porto DB here. Trust the key exists.
  // If it fails at the time, we'll handle it then.
  const existingKey = getActiveSessionKey(walletAddress);

  if (existingKey && isSessionKeyValid(existingKey)) {
    // STRICT CONTEXT CHECK (Modified for Universal Keys)
    const currentContext = existingKey.context || 'ETH';

    // Universal Key Check: 'ALL' context is valid for EVERYTHING
    if (currentContext === 'ALL') {
      logger.log(`🔑 [Session] Reusing Universal ('ALL') session key for ${tokenContext}`);
      return existingKey;
    }

    // Exact Match Check
    if (currentContext === tokenContext) {
      logger.log(`🔑 [Session] Reusing valid ${currentContext} session key`);
      return existingKey;
    }

    logger.log(
      `🔑 [Session] Context mismatch (Found: ${currentContext}, Needed: ${tokenContext}). Creating new key...`
    );
  }

  // 2. Create new if missing or mismatch
  logger.log(`🔑 [Session] No valid key found for ${tokenContext}, creating new one...`);
  return createSessionKey(walletAddress, tokenContext);
}

export async function createSessionKey(
  walletAddress: string,
  tokenContext: TokenContext = 'ALL'
): Promise<SessionKeyData> {
  if (!walletAddress) throw new Error('Wallet address required');

  // IMPORTANT: Clear any existing session key FIRST to avoid relay conflicts
  // This prevents "duplicate call" errors when the relay has cached the old publicKey
  const existingKey = getActiveSessionKey(walletAddress);
  if (existingKey) {
    logger.log('🔑 [Session] Clearing existing session key before creating new one');
    const storageKey = getStorageKey(walletAddress);
    localStorage.removeItem(storageKey);
    activeKeyPair = null;
  }

  const provider = getProvider();
  if (!provider) throw new Error('Wallet provider not available');

  logger.log(`🔑 [Session] Creating NEW session key for ${tokenContext}...`);

  // 1. Generate P256 Key Pair
  const privateKey = P256.randomPrivateKey();
  const publicKey = PublicKey.toHex(P256.getPublicKey({ privateKey }), {
    includePrefix: false,
  });

  const expiry = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  // 2. Request Permissions
  const spendLimits = getSpendLimits(tokenContext);
  logger.log('🔑 [Session] Requesting permissions with limits:', spendLimits);

  const permissionParams = [
    {
      key: {
        type: 'p256',
        publicKey: publicKey,
      },
      expiry: expiry,
      permissions: {
        calls: GAME_CALLS,
        spend: spendLimits,
      },
      // feeToken specifies which token to use for gas fees and limit
      // Porto schema: { symbol: 'native' | TokenSymbol, limit: 'decimal_string' }
      feeToken: {
        symbol: 'native', // Native ETH/gas token
        limit: '0.01', // Limit in human-readable units (Porto parses this)
      },
    },
  ];

  console.log('--- GRANT PERMISSIONS PARAMS ---');
  console.dir(permissionParams, { depth: null });
  console.log('--------------------------------');

  await (provider as any).request({
    method: 'wallet_grantPermissions',
    params: permissionParams,
  });

  // 3. Save to Storage
  const sessionKeyData: SessionKeyData = {
    privateKey,
    publicKey,
    expiry,
    createdAt: Date.now(),
    address: walletAddress,
    context: tokenContext,
  };

  const storageKey = getStorageKey(walletAddress);
  localStorage.setItem(storageKey, JSON.stringify(sessionKeyData));
  activeKeyPair = sessionKeyData;

  logger.log(
    '🔑 [Session] Key created and saved! Expires:',
    new Date(expiry * 1000).toLocaleString()
  );

  return sessionKeyData;
}

export function clearAllSessionKeys() {
  activeKeyPair = null;

  // Clear persistent storage matching our prefix
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SESSION_KEY_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((k) => localStorage.removeItem(k));
  logger.log('🔑 [Session] All session keys cleared from storage');
}

export async function revokeSessionKey(publicKey: string) {
  try {
    const provider = getProvider();
    if (provider) {
      await (provider as any).request({
        method: 'wallet_revokePermissions',
        params: [{ publicKey }],
      });
    }
  } catch (error) {
    logger.warn('Error revoking permission (non-critical):', error);
  }
  // Always clear local
  clearAllSessionKeys();
}

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

export function signWithSessionKey(digest: `0x${string}`, sessionKey: SessionKeyData): string {
  if (!sessionKey?.privateKey) {
    throw new Error('No valid session key for signing');
  }

  return Signature.toHex(
    P256.sign({
      payload: digest,
      privateKey: sessionKey.privateKey as `0x${string}`,
    })
  );
}

export function getSessionKeyTimeRemaining(sessionKey: SessionKeyData | null) {
  if (!sessionKey || !sessionKey.expiry) {
    return { seconds: 0, minutes: 0, hours: 0, expired: true };
  }

  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, sessionKey.expiry - now);

  return {
    seconds: secondsRemaining,
    minutes: Math.floor(secondsRemaining / 60),
    hours: Math.floor(secondsRemaining / 3600),
    expired: secondsRemaining <= 0,
  };
}
