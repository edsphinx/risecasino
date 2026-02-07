/**
 * useWalletConnection - Wallet connection without wagmi
 * Uses RiseWallet singleton + localStorage (Meteoro pattern)
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { getProvider } from '@/lib/riseWallet';
import { logger } from '@/lib/logger';
import { logEvent, registerUser } from '@/lib/api';
import {
  recordConnectionFailure,
  clearConnectionFailures,
  isCorruptedStateError,
} from '@/lib/walletRecovery';

// Storage key
const WALLET_STORAGE_KEY = 'vyrejack.wallet';

// Number of failures before showing recovery modal
const FAILURE_THRESHOLD = 2;

export interface WalletData {
  address: `0x${string}`;
}

export interface UseWalletConnectionReturn {
  address: `0x${string}` | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  showRecoveryModal: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  openRecoveryModal: () => void;
  closeRecoveryModal: () => void;
  handleRecoveryComplete: () => void;
}

/**
 * Get saved wallet from localStorage
 */
function getSavedWallet(): WalletData | null {
  try {
    const data = localStorage.getItem(WALLET_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Save wallet to localStorage
 */
function saveWallet(address: `0x${string}`): void {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ address }));
}

/**
 * Remove wallet from localStorage
 */
function removeWallet(): void {
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

export function useWalletConnection(): UseWalletConnectionReturn {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const savedWallet = getSavedWallet();
      if (!savedWallet) return;

      try {
        // Import Rise Wallet and wait for hydration
        const { getRiseWallet, waitForHydration } = await import('@/lib/riseWallet');
        await waitForHydration();

        const rw = getRiseWallet();

        // Use eth_accounts (not wallet_connect) to check for existing session
        // eth_accounts is NON-INTERACTIVE - it returns accounts silently if already authorized
        // This is the Meteoro pattern that enables "keyless" experience
        const accounts = await (
          rw.provider as {
            request: (args: { method: string }) => Promise<`0x${string}`[]>;
          }
        ).request({
          method: 'eth_accounts',
        });

        if (accounts && accounts.length > 0) {
          const restoredAddress = accounts[0];
          // Verify it matches our saved address
          if (restoredAddress.toLowerCase() === savedWallet.address.toLowerCase()) {
            logger.log('🔗 Wallet silently restored via eth_accounts:', restoredAddress);
            setAddress(restoredAddress);
            setIsConnected(true);
            clearConnectionFailures();
            return;
          } else {
            logger.log('🔗 Different account returned, clearing saved wallet');
            removeWallet();
          }
        } else {
          logger.log('🔗 No accounts from eth_accounts, session not available');
          // Don't remove saved wallet - user can manually reconnect
        }
      } catch (err) {
        logger.warn('🔗 Could not restore wallet session:', err);
        // Don't remove saved wallet - user can manually reconnect
      }
    };

    restoreSession();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const provider = getProvider();

      // METEORO PATTERN: Use eth_requestAccounts instead of wallet_connect
      // eth_requestAccounts triggers OAuth popup and persists to Porto IndexedDB correctly
      logger.log('🔗 Connecting to Rise Wallet via eth_requestAccounts...');

      const accounts = await (
        provider as {
          request: (args: { method: string }) => Promise<`0x${string}`[]>;
        }
      ).request({
        method: 'eth_requestAccounts',
      });

      if (!accounts?.length) {
        throw new Error('No accounts returned');
      }

      const walletAddress = accounts[0];
      logger.log('🔗 Connected via eth_requestAccounts:', walletAddress);

      setAddress(walletAddress);
      setIsConnected(true);
      saveWallet(walletAddress);
      clearConnectionFailures(); // Clear failures on success

      // Log event & register user (fire-and-forget)
      logEvent('wallet_connect', walletAddress, { provider: 'rise_wallet' }).catch(() => {});
      registerUser(walletAddress).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect';

      // Track failures for potential corrupted state
      if (isCorruptedStateError(err)) {
        const failureCount = recordConnectionFailure();
        logger.warn(`🔗 Connection failure #${failureCount}:`, message);

        if (failureCount >= FAILURE_THRESHOLD) {
          // Show recovery modal
          setShowRecoveryModal(true);
          setError(null); // Don't show error if we're showing the modal
          return;
        }
      }

      if (message.includes('rejected') || message.includes('cancelled')) {
        setError('Connection was cancelled');
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // EIP-1193 event listeners: detect account changes and disconnects
  useEffect(() => {
    if (!isConnected) return;

    let provider: ReturnType<typeof getProvider>;
    try {
      provider = getProvider();
    } catch {
      return;
    }

    // Type-safe access to EIP-1193 event methods (Porto may or may not implement these)
    const eip1193 = provider as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    if (!eip1193.on || !eip1193.removeListener) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accts = accounts as string[];
      if (!accts || accts.length === 0) {
        logger.log('🔗 Wallet accounts changed: disconnected');
        setAddress(null);
        setIsConnected(false);
        removeWallet();
      } else if (accts[0].toLowerCase() !== address?.toLowerCase()) {
        logger.log('🔗 Wallet account changed to:', accts[0]);
        const newAddr = accts[0] as `0x${string}`;
        setAddress(newAddr);
        saveWallet(newAddr);
      }
    };

    const handleDisconnect = () => {
      logger.log('🔗 Wallet disconnect event received');
      setAddress(null);
      setIsConnected(false);
      removeWallet();
    };

    eip1193.on('accountsChanged', handleAccountsChanged);
    eip1193.on('disconnect', handleDisconnect);

    return () => {
      eip1193.removeListener!('accountsChanged', handleAccountsChanged);
      eip1193.removeListener!('disconnect', handleDisconnect);
    };
  }, [isConnected, address]);

  const disconnect = useCallback(() => {
    const prevAddress = address;
    setAddress(null);
    setIsConnected(false);
    setError(null);
    removeWallet();
    logger.log('🔗 Disconnected');

    // Log disconnect event (fire-and-forget)
    if (prevAddress) {
      logEvent('wallet_disconnect', prevAddress).catch(() => {});
    }
  }, [address]);

  const openRecoveryModal = useCallback(() => {
    setShowRecoveryModal(true);
  }, []);

  const closeRecoveryModal = useCallback(() => {
    setShowRecoveryModal(false);
  }, []);

  const handleRecoveryComplete = useCallback(() => {
    setShowRecoveryModal(false);
    setError(null);
    clearConnectionFailures();
    // Trigger reconnect after a small delay
    setTimeout(() => {
      connect();
    }, 500);
  }, [connect]);

  return {
    address,
    isConnected,
    isConnecting,
    error,
    showRecoveryModal,
    connect,
    disconnect,
    openRecoveryModal,
    closeRecoveryModal,
    handleRecoveryComplete,
  };
}
