/**
 * Session Store (Zustand)
 *
 * Single source of truth for session key state.
 * Uses zustand/persist to automatically sync with localStorage.
 *
 * ⚡ ARCHITECTURE:
 * - Eliminates race conditions via onRehydrateStorage callback
 * - hasHydrated flag prevents premature onboarding
 * - Consistent with gameStore/balanceStore patterns
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  address: string;
  context?: TokenContext;
}

interface SessionState {
  // Session key data (persisted)
  sessionKey: SessionKeyData | null;

  // Hydration state (NOT persisted)
  hasHydrated: boolean;

  // Operation states
  isCreating: boolean;
  error: string | null;
}

interface SessionActions {
  // Set session key (internal use)
  setSessionKey: (key: SessionKeyData | null) => void;

  // Create new session key via wallet provider
  createSessionKey: (
    walletAddress: string,
    tokenContext?: TokenContext
  ) => Promise<SessionKeyData | null>;

  // Revoke current session key
  revokeSessionKey: () => Promise<void>;

  // Clear all local session data
  clearSession: () => void;

  // Check if session key is valid
  isValid: () => boolean;

  // Get time remaining
  getTimeRemaining: () => { hours: number; minutes: number; seconds: number; expired: boolean };

  // Sign with session key
  sign: (digest: `0x${string}`) => string | null;

  // Mark hydration complete (called by persist middleware)
  setHasHydrated: (state: boolean) => void;
}

type SessionStore = SessionState & SessionActions;

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'vyrejack-session';
const SESSION_DURATION_SECONDS = 100 * 365 * 24 * 60 * 60; // 100 years

// =============================================================================
// STORE
// =============================================================================

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sessionKey: null,
      hasHydrated: false,
      isCreating: false,
      error: null,

      setSessionKey: (key) => set({ sessionKey: key, error: null }),

      setHasHydrated: (state) => set({ hasHydrated: state }),

      isValid: () => {
        const { sessionKey } = get();
        if (!sessionKey?.publicKey || !sessionKey?.privateKey) return false;
        const now = Math.floor(Date.now() / 1000);
        return sessionKey.expiry > now;
      },

      getTimeRemaining: () => {
        const { sessionKey } = get();
        if (!sessionKey?.expiry) {
          return { hours: 0, minutes: 0, seconds: 0, expired: true };
        }
        const now = Math.floor(Date.now() / 1000);
        const secondsRemaining = Math.max(0, sessionKey.expiry - now);
        return {
          seconds: secondsRemaining % 60,
          minutes: Math.floor(secondsRemaining / 60) % 60,
          hours: Math.floor(secondsRemaining / 3600),
          expired: secondsRemaining <= 0,
        };
      },

      sign: (digest) => {
        const { sessionKey, isValid } = get();
        if (!sessionKey?.privateKey || !isValid()) {
          logger.error('[SessionStore] No valid session key for signing');
          return null;
        }
        return Signature.toHex(
          P256.sign({
            payload: digest,
            privateKey: sessionKey.privateKey as `0x${string}`,
          })
        );
      },

      createSessionKey: async (walletAddress, tokenContext = 'ALL') => {
        if (!walletAddress) {
          set({ error: 'Wallet address required' });
          return null;
        }

        const provider = getProvider();
        if (!provider) {
          set({ error: 'Wallet provider not available' });
          return null;
        }

        set({ isCreating: true, error: null });

        try {
          // Revoke existing key from relay if present
          const { sessionKey: existingKey } = get();
          if (existingKey?.publicKey) {
            logger.log('[SessionStore] Revoking existing key from relay');
            try {
              await (provider as any).request({
                method: 'wallet_revokePermissions',
                params: [{ address: walletAddress, id: existingKey.publicKey }],
              });
            } catch (err) {
              logger.warn('[SessionStore] Failed to revoke existing key:', err);
            }
          }

          // Generate new P256 key pair
          const privateKey = P256.randomPrivateKey();
          const publicKey = PublicKey.toHex(P256.getPublicKey({ privateKey }), {
            includePrefix: false,
          });
          const expiry = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

          // Request permissions from wallet
          const spendLimits = getSpendLimits(tokenContext);
          logger.log('[SessionStore] Requesting permissions...');

          await (provider as any).request({
            method: 'wallet_grantPermissions',
            params: [
              {
                key: { type: 'p256', publicKey },
                expiry,
                permissions: { calls: GAME_CALLS, spend: spendLimits },
                feeToken: { symbol: 'native', limit: '0.01' },
              },
            ],
          });

          // Create and save session data
          const newKey: SessionKeyData = {
            privateKey,
            publicKey,
            expiry,
            createdAt: Date.now(),
            address: walletAddress,
            context: tokenContext,
          };

          set({ sessionKey: newKey, isCreating: false });
          logger.log('[SessionStore] Session key created successfully');

          return newKey;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create session key';
          logger.error('[SessionStore] Error:', err);
          set({ error: message, isCreating: false });
          return null;
        }
      },

      revokeSessionKey: async () => {
        const { sessionKey } = get();
        if (!sessionKey?.publicKey) return;

        const provider = getProvider();
        if (provider && sessionKey.address) {
          try {
            await (provider as any).request({
              method: 'wallet_revokePermissions',
              params: [{ address: sessionKey.address, id: sessionKey.publicKey }],
            });
            logger.log('[SessionStore] Session key revoked from relay');
          } catch (err) {
            logger.warn('[SessionStore] Failed to revoke from relay:', err);
          }
        }

        set({ sessionKey: null });
      },

      clearSession: () => {
        set({ sessionKey: null, error: null });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Only persist sessionKey (not transient state)
      partialize: (state) => ({ sessionKey: state.sessionKey }),

      // Callback when hydration completes - THIS SOLVES THE RACE CONDITION
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          logger.log('[SessionStore] Hydrated from localStorage', {
            hasKey: !!state.sessionKey,
            publicKey: state.sessionKey?.publicKey?.slice(0, 20),
          });
        }
      },
    }
  )
);

// =============================================================================
// SELECTORS
// =============================================================================

export const selectSessionKey = (state: SessionStore) => state.sessionKey;
export const selectHasSessionKey = (state: SessionStore) =>
  state.hasHydrated && state.sessionKey !== null && state.isValid();
export const selectHasHydrated = (state: SessionStore) => state.hasHydrated;
export const selectIsCreating = (state: SessionStore) => state.isCreating;
export const selectSessionError = (state: SessionStore) => state.error;

// =============================================================================
// UTILITY - Check for orphaned remote keys and revoke them
// =============================================================================

export async function revokeOrphanedRemoteKeys(walletAddress: string): Promise<number> {
  const provider = getProvider();
  if (!provider) return 0;

  const localKey = useSessionStore.getState().sessionKey;
  const localPublicKey = localKey?.publicKey?.toLowerCase();

  try {
    const keysResponse = await (provider as any).request({
      method: 'wallet_getKeys',
      params: [{ address: walletAddress }],
    });

    const chainId = '0xaa39db'; // Rise Testnet
    const keys = keysResponse?.[chainId] || [];
    let revokedCount = 0;

    for (const key of keys) {
      if (key.role === 'admin') continue;
      if (localPublicKey && key.publicKey?.toLowerCase() === localPublicKey) continue;

      const now = Math.floor(Date.now() / 1000);
      const expiry = parseInt(key.expiry, 16);
      if (expiry <= now) continue;

      logger.log(`[SessionStore] Revoking orphaned key: ${key.publicKey.slice(0, 20)}...`);
      try {
        await (provider as any).request({
          method: 'wallet_revokePermissions',
          params: [{ address: walletAddress, id: key.publicKey }],
        });
        revokedCount++;
      } catch {
        // Continue on failure
      }
    }

    if (revokedCount > 0) {
      logger.log(`[SessionStore] Revoked ${revokedCount} orphaned keys`);
    }
    return revokedCount;
  } catch (err) {
    logger.warn('[SessionStore] Error checking orphaned keys:', err);
    return 0;
  }
}
