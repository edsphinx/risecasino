/**
 * useSessionKey - Session key hook without wagmi
 * REFACTORED: Simplified to align with Meteoro pattern
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  getActiveSessionKey,
  ensureSessionKey,
  revokeSessionKey,
  getSessionKeyTimeRemaining,
  isSessionKeyValid,
  clearAllSessionKeys,
  type SessionKeyData,
} from '@/services/sessionKey.service';
import { logger } from '@/lib/logger';
import type { TimeRemaining } from '@vyrejack/shared';

export interface UseSessionKeyReturn {
  hasSessionKey: boolean;
  sessionExpiry: TimeRemaining | null;
  keyPair: { publicKey: string; privateKey: string } | null;
  isCreating: boolean;
  create: () => Promise<boolean>;
  revoke: () => Promise<void>;
}

export function useSessionKey(address: `0x${string}` | null): UseSessionKeyReturn {
  const [sessionData, setSessionData] = useState<SessionKeyData | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load existing session key on mount or address change
  useEffect(() => {
    if (!address) {
      setSessionData(null);
      return;
    }

    const restoreFromLocalStorage = () => {
      // getActiveSessionKey now handles validation internally
      const existingKey = getActiveSessionKey(address);

      logger.log('🔑 [useSessionKey] Restore check:', {
        address,
        storageKey: `vyrejack_session_key_${address.toLowerCase()}`,
        found: !!existingKey,
        publicKey: existingKey?.publicKey?.slice(0, 20),
        expiry: existingKey ? new Date(existingKey.expiry * 1000).toLocaleString() : 'N/A',
      });

      if (existingKey) {
        setSessionData(existingKey);
        logger.log('🔑 [useSessionKey] Session key restored successfully');
      } else {
        setSessionData(null);
        logger.log('🔑 [useSessionKey] No local session key found - user needs to create one');
      }
    };

    restoreFromLocalStorage();
  }, [address]);

  // Update timer periodically
  useEffect(() => {
    if (!sessionData) return;

    // Update every minute if more than 1 hour remaining, every second if less
    // Or just every 5 seconds is fine for UI
    const interval = setInterval(() => {
      if (!isSessionKeyValid(sessionData)) {
        logger.log('🔑 [useSessionKey] Key expired during polling');
        setSessionData(null);
      } else {
        // Force re-render to update time remaining
        setSessionData({ ...sessionData });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionData?.publicKey]);

  const hasSessionKey = Boolean(sessionData && isSessionKeyValid(sessionData));

  const timeRemaining: TimeRemaining | null = useMemo(() => {
    if (!sessionData) return null;

    const remaining = getSessionKeyTimeRemaining(sessionData);
    return {
      hours: remaining.hours,
      minutes: remaining.minutes % 60,
      seconds: remaining.seconds % 60,
      expired: remaining.expired,
    };
  }, [sessionData]);

  const keyPair = useMemo(() => {
    if (!sessionData) return null;
    return {
      publicKey: sessionData.publicKey,
      privateKey: sessionData.privateKey,
    };
  }, [sessionData]);

  const create = useCallback(async (): Promise<boolean> => {
    if (!address) return false;

    try {
      setIsCreating(true);
      // Ensure uses trusting logic now
      const newKey = await ensureSessionKey(address);
      setSessionData(newKey);
      return true;
    } catch (err) {
      logger.error('🔑 Failed to create session key:', err);
      // If ensure fails, it might be permission rejected
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [address]);

  const revoke = useCallback(async (): Promise<void> => {
    if (!sessionData?.publicKey) return;

    try {
      await revokeSessionKey(sessionData.publicKey);
      setSessionData(null);
    } catch (err) {
      logger.error('🔑 Failed to revoke session key:', err);
      // Force clear anyway
      clearAllSessionKeys();
      setSessionData(null);
    }
  }, [sessionData]);

  return {
    hasSessionKey,
    sessionExpiry: timeRemaining,
    keyPair,
    isCreating,
    create,
    revoke,
  };
}
