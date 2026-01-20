/**
 * useSessionKey - Session key hook using Zustand store
 *
 * REFACTORED: Now uses sessionStore for state management.
 * The store handles persistence and hydration, eliminating race conditions.
 */

import { useMemo, useEffect } from 'preact/hooks';
import { useSessionStore, selectHasHydrated, selectIsCreating, selectSessionError } from '@/stores';
import { logger } from '@/lib/logger';
import type { TimeRemaining } from '@vyrejack/shared';

export interface UseSessionKeyReturn {
  hasSessionKey: boolean;
  hasHydrated: boolean;
  sessionExpiry: TimeRemaining | null;
  keyPair: { publicKey: string; privateKey: string } | null;
  isCreating: boolean;
  error: string | null;
  create: () => Promise<boolean>;
  revoke: () => Promise<void>;
}

export function useSessionKey(address: `0x${string}` | null): UseSessionKeyReturn {
  // Use Zustand store with selectors for optimized re-renders
  const sessionKey = useSessionStore((state) => state.sessionKey);
  const hasHydrated = useSessionStore(selectHasHydrated);
  const isCreating = useSessionStore(selectIsCreating);
  const error = useSessionStore(selectSessionError);

  // Get store actions
  const createSessionKey = useSessionStore((state) => state.createSessionKey);
  const revokeSessionKey = useSessionStore((state) => state.revokeSessionKey);
  const getTimeRemaining = useSessionStore((state) => state.getTimeRemaining);
  const isValid = useSessionStore((state) => state.isValid);

  // Debug logging on mount and state changes
  useEffect(() => {
    logger.log('🔑 [useSessionKey] State change:', {
      hasHydrated,
      address: address?.slice(0, 10),
      sessionKeyAddress: sessionKey?.address?.slice(0, 10),
      sessionKeyPublicKey: sessionKey?.publicKey?.slice(0, 20),
      isValid: sessionKey ? isValid() : false,
    });
  }, [hasHydrated, address, sessionKey, isValid]);

  // Check if session key is valid and matches current address
  const hasValidSessionKey = useMemo(() => {
    if (!hasHydrated) return false;
    if (!sessionKey) return false;
    if (!isValid()) return false;

    // If we have an address, verify it matches
    if (address && sessionKey.address) {
      return sessionKey.address.toLowerCase() === address.toLowerCase();
    }

    // If no address connected yet but we have a key, still consider it valid
    // The address check will happen when wallet connects
    return true;
  }, [hasHydrated, sessionKey, address, isValid]);

  const timeRemaining: TimeRemaining | null = useMemo(() => {
    if (!sessionKey || !isValid()) return null;
    const remaining = getTimeRemaining();
    return {
      hours: remaining.hours,
      minutes: remaining.minutes,
      seconds: remaining.seconds,
      expired: remaining.expired,
    };
  }, [sessionKey, getTimeRemaining, isValid]);

  const keyPair = useMemo(() => {
    if (!sessionKey) return null;
    // Only return keyPair if address matches (or no address provided)
    if (address && sessionKey.address) {
      if (sessionKey.address.toLowerCase() !== address.toLowerCase()) {
        return null;
      }
    }
    return {
      publicKey: sessionKey.publicKey,
      privateKey: sessionKey.privateKey,
    };
  }, [sessionKey, address]);

  const create = async (): Promise<boolean> => {
    if (!address) {
      logger.error('[useSessionKey] No address provided');
      return false;
    }
    const result = await createSessionKey(address);
    return result !== null;
  };

  const revoke = async (): Promise<void> => {
    await revokeSessionKey();
  };

  return {
    hasSessionKey: hasValidSessionKey,
    hasHydrated,
    sessionExpiry: timeRemaining,
    keyPair,
    isCreating,
    error,
    create,
    revoke,
  };
}
