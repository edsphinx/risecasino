/**
 * useRiseWallet - Compositor hook for Rise Wallet functionality
 * Combines useWalletConnection, useSessionKey, and auto-session logic
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { formatEther } from 'viem';
import { useWalletConnection } from './useWalletConnection';
import { useSessionKey } from './useSessionKey';
import { getProvider } from '@/lib/riseWallet';
import { logger } from '@/lib/logger';
import type { UseRiseWalletReturn } from '@vyrejack/shared';

// LocalStorage keys
const ONBOARDING_SEEN_KEY = 'vyrejack_fastmode_onboarding_seen';
const SKIP_FASTMODE_KEY = 'vyrejack_skip_fastmode';

export function useRiseWallet(): UseRiseWalletReturn {
  const connection = useWalletConnection();
  const sessionKey = useSessionKey(connection.address);
  const [balance, setBalance] = useState<bigint | null>(null);

  // Auto session flow states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  const [skipFastMode, setSkipFastMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SKIP_FASTMODE_KEY) === 'true';
  });
  const [wasConnected, setWasConnected] = useState(false);

  // Fetch balance
  useEffect(() => {
    if (!connection.address) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const provider = getProvider();
        const result = await provider.request({
          method: 'eth_getBalance',
          params: [connection.address!, 'latest'],
        });
        // Validate result before BigInt conversion
        if (typeof result === 'string' && result.startsWith('0x')) {
          setBalance(BigInt(result));
        } else {
          setBalance(null);
        }
      } catch {
        setBalance(null);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [connection.address]);

  // Auto-create session on connection (for returning users)
  useEffect(() => {
    // Detect fresh connection (was disconnected, now connected)
    if (connection.isConnected && !wasConnected) {
      setWasConnected(true);

      // If user already has a valid session key, don't show onboarding
      if (sessionKey.hasSessionKey) {
        logger.log('🔑 [useRiseWallet] Already has valid session key, skipping onboarding');
        return;
      }

      // If user explicitly skipped fast mode, don't annoy them
      if (skipFastMode) {
        logger.log('🔑 [useRiseWallet] User skipped fast mode, not showing onboarding');
        return;
      }

      // No session key and user hasn't skipped → ALWAYS show onboarding
      // Even if they've seen it before (they might need to create a new key)
      logger.log('🔑 [useRiseWallet] No session key, showing onboarding');
      setShowOnboarding(true);
    }

    // Reset when disconnected
    if (!connection.isConnected && wasConnected) {
      setWasConnected(false);
      setShowOnboarding(false);
      setShowExpiryModal(false);
    }
  }, [connection.isConnected, wasConnected, skipFastMode, sessionKey.hasSessionKey]);

  // Track previous session state to detect expiry
  const [hadSessionKey, setHadSessionKey] = useState(false);

  // Update hadSessionKey when session state changes
  // Reset after expiry modal is dismissed to allow multiple session expirations
  useEffect(() => {
    if (sessionKey.hasSessionKey) {
      setHadSessionKey(true);
    }
  }, [sessionKey.hasSessionKey]);

  // Detect session expiry - when we HAD a key but now we don't
  useEffect(() => {
    if (!connection.isConnected || skipFastMode) return;

    // If we HAD a session but now we don't (it expired), show modal
    if (hadSessionKey && !sessionKey.hasSessionKey && !showOnboarding && !showExpiryModal) {
      logger.log('🔑 Session expired - showing modal');
      setShowExpiryModal(true);
    }
  }, [
    sessionKey.hasSessionKey,
    hadSessionKey,
    connection.isConnected,
    skipFastMode,
    showOnboarding,
    showExpiryModal,
  ]);

  // Calculate warning (24 hours before expiry for long-duration keys)
  // Only show warning in last 24 hours, return hours remaining
  const expiryWarningMinutes = (() => {
    if (!sessionKey.sessionExpiry || sessionKey.sessionExpiry.expired) return null;
    const totalHours = sessionKey.sessionExpiry.hours;
    // Only warn when less than 24 hours remaining
    if (totalHours < 24 && totalHours >= 0) {
      return sessionKey.sessionExpiry.hours * 60 + sessionKey.sessionExpiry.minutes;
    }
    return null;
  })();

  // Disconnect WITHOUT revoking session key
  // Session keys persist across connections - only explicit revoke removes them
  const disconnect = () => {
    connection.disconnect();
  };

  const formatBalance = () => {
    if (balance === null) return '0';
    return formatEther(balance);
  };

  // Handle onboarding dismissal
  const dismissOnboarding = useCallback(
    async (enableFastMode: boolean) => {
      setShowOnboarding(false);
      localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');

      if (enableFastMode) {
        await sessionKey.create();
      } else {
        localStorage.setItem(SKIP_FASTMODE_KEY, 'true');
        setSkipFastMode(true);
      }
    },
    [sessionKey.create]
  );

  // Handle expiry modal dismissal
  const dismissExpiryModal = useCallback(
    async (extend: boolean) => {
      setShowExpiryModal(false);
      setHadSessionKey(false); // Reset so we can detect next expiry

      if (extend) {
        await sessionKey.create();
      } else {
        // User chose to continue without - set skip flag for this session only
        // (not persisted, so next visit will show onboarding again)
      }
    },
    [sessionKey.create]
  );

  return useMemo(
    () => ({
      // Connection
      address: connection.address,
      isConnected: connection.isConnected,
      isConnecting: connection.isConnecting || sessionKey.isCreating,
      error: connection.error,
      connect: connection.connect,
      disconnect,

      // Balance
      balance,
      formatBalance,

      // Session Key
      hasSessionKey: sessionKey.hasSessionKey,
      sessionExpiry: sessionKey.sessionExpiry,
      createSessionKey: sessionKey.create,
      revokeSessionKey: sessionKey.revoke,
      isCreatingSession: sessionKey.isCreating,

      // Auto Session Flow
      showOnboarding,
      showExpiryModal,
      expiryWarningMinutes,
      dismissOnboarding,
      dismissExpiryModal,

      // Wallet Recovery
      showRecoveryModal: connection.showRecoveryModal,
      openRecoveryModal: connection.openRecoveryModal,
      closeRecoveryModal: connection.closeRecoveryModal,
      handleRecoveryComplete: connection.handleRecoveryComplete,

      // Internal for useGameActions
      keyPair: sessionKey.keyPair,
    }),
    [
      connection.address,
      connection.isConnected,
      connection.isConnecting,
      connection.error,
      connection.connect,
      connection.showRecoveryModal,
      connection.openRecoveryModal,
      connection.closeRecoveryModal,
      connection.handleRecoveryComplete,
      sessionKey.isCreating,
      sessionKey.hasSessionKey,
      sessionKey.sessionExpiry,
      sessionKey.create,
      sessionKey.revoke,
      sessionKey.keyPair,
      disconnect,
      balance,
      formatBalance,
      showOnboarding,
      showExpiryModal,
      expiryWarningMinutes,
      dismissOnboarding,
      dismissExpiryModal,
    ]
  );
}
