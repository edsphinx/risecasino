/**
 * useTokenBalance Hook
 *
 * Reactive token balance with EVENT-DRIVEN updates.
 *
 * ⚡ UPDATE TRIGGERS:
 * 1. WebSocket listener for ERC20 Transfer events (primary)
 * 2. Game event listener for immediate post-game refresh
 * 3. Tab visibility refresh when user returns to tab
 *
 * 🛡️ FALLBACK MECHANISMS:
 * - WebSocket disconnect: auto-reconnect with exponential backoff
 * - Tab inactive: refresh on visibility change
 *
 * 🔧 MAINTAINABILITY:
 * - Uses TokenService for all contract reads (DRY)
 * - Types from @vyrejack/shared (centralized)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { useTabFocus } from './useTabFocus';
import { TokenService } from '@/services';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';
import { VYRECASINO_ADDRESS, riseTestnet } from '@/lib/contract';
import { logger } from '@/lib/logger';

const WSS_URL = 'wss://testnet.riselabs.xyz/ws';
const WS_RECONNECT_BASE_DELAY = 2000; // 2s initial reconnect delay
const WS_MAX_RECONNECT_DELAY = 30000; // Max 30s between reconnects

// ERC20 Transfer event signature
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

interface UseTokenBalanceOptions {
  /** Spender address for allowance check (default: VyreCasino) */
  spender?: `0x${string}`;
  /** Disable all automatic updates (for static reads) */
  disableAutoRefresh?: boolean;
}

interface UseTokenBalanceReturn {
  balance: TokenBalance | null;
  allowance: AllowanceState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Formatted balance for display */
  formattedBalance: string;
  /** Whether spender has any approval */
  isApproved: boolean;
  /** Whether WebSocket is connected */
  isWsConnected: boolean;
}

/**
 * Hook for reactive token balance and allowance state
 * Uses WebSocket events for real-time updates with robust fallbacks
 *
 * @example
 * const { balance, isApproved, refresh } = useTokenBalance(CHIP_TOKEN, account);
 */
export function useTokenBalance(
  token: `0x${string}` | null,
  account: `0x${string}` | null,
  options: UseTokenBalanceOptions = {}
): UseTokenBalanceReturn {
  const { spender = VYRECASINO_ADDRESS, disableAutoRefresh = false } = options;

  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [allowance, setAllowance] = useState<AllowanceState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);

  // Refs for cleanup and reconnection
  const hasFetchedRef = useRef(false);
  const unwatchRef = useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);
  const lastRefreshTimeRef = useRef(0);
  const REFRESH_DEBOUNCE_MS = 500; // Minimum time between refreshes

  // Tab focus state
  const isActiveTab = useTabFocus();

  // Fetch balance and allowance (with debounce)
  const refresh = useCallback(async () => {
    if (!token || !account) {
      setBalance(null);
      setAllowance(null);
      return;
    }

    // Debounce: skip if called within REFRESH_DEBOUNCE_MS of last call
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < REFRESH_DEBOUNCE_MS) {
      return;
    }
    lastRefreshTimeRef.current = now;

    // Only log on first fetch to reduce noise
    if (!hasFetchedRef.current) {
      logger.log('[useTokenBalance] Initial fetch for:', {
        token: token.slice(0, 10),
        account: account.slice(0, 10),
      });
    }

    setIsLoading(true);
    setError(null);

    try {
      const [balanceResult, allowanceResult] = await Promise.all([
        TokenService.getBalance(token, account),
        TokenService.getAllowance(token, account, spender),
      ]);

      if (isMountedRef.current) {
        setBalance(balanceResult);
        setAllowance(allowanceResult);
        hasFetchedRef.current = true;
      }
    } catch (e) {
      if (isMountedRef.current) {
        const message = e instanceof Error ? e.message : 'Failed to fetch balance';
        setError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [token, account, spender]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 🛡️ FALLBACK 1: Refresh when tab becomes visible again
  useEffect(() => {
    if (!disableAutoRefresh && isActiveTab && hasFetchedRef.current) {
      logger.log('[useTokenBalance] Tab became active, refreshing');
      refresh();
    }
  }, [isActiveTab, disableAutoRefresh, refresh]);

  // ⚡ PRIMARY: Listen for Transfer events via WebSocket with reconnection
  useEffect(() => {
    if (disableAutoRefresh || !token || !account) {
      return;
    }

    const setupWebSocket = () => {
      try {
        const client = createPublicClient({
          chain: riseTestnet as Parameters<typeof createPublicClient>[0]['chain'],
          transport: webSocket(WSS_URL, {
            reconnect: true,
            retryCount: 5,
          }),
        });

        // Watch for Transfer events TO or FROM this account
        const unwatch = client.watchEvent({
          address: token,
          event: TRANSFER_EVENT,
          onLogs: (logs) => {
            for (const log of logs) {
              const { from, to } = log.args as { from: `0x${string}`; to: `0x${string}` };
              // If this account sent or received tokens, refresh
              if (
                from?.toLowerCase() === account.toLowerCase() ||
                to?.toLowerCase() === account.toLowerCase()
              ) {
                logger.log('[useTokenBalance] Transfer detected, refreshing');
                refresh();
                break; // Only refresh once per batch
              }
            }
          },
          onError: (err) => {
            logger.error('[useTokenBalance] WebSocket error:', err);
            setIsWsConnected(false);

            // Schedule reconnection with exponential backoff
            if (isMountedRef.current) {
              const delay = Math.min(
                WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
                WS_MAX_RECONNECT_DELAY
              );
              reconnectAttemptRef.current++;

              logger.log(
                `[useTokenBalance] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`
              );

              reconnectTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                  setupWebSocket();
                }
              }, delay);
            }
          },
        });

        unwatchRef.current = unwatch;
        setIsWsConnected(true);
        reconnectAttemptRef.current = 0; // Reset on successful connection
      } catch (err) {
        logger.error('[useTokenBalance] Failed to setup WebSocket:', err);
        setIsWsConnected(false);
      }
    };

    setupWebSocket();

    return () => {
      if (unwatchRef.current) {
        unwatchRef.current();
        unwatchRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsWsConnected(false);
    };
  }, [token, account, disableAutoRefresh, refresh]);

  // ⚡ EVENT-DRIVEN: Listen for game resolved events
  useEffect(() => {
    if (disableAutoRefresh) return;

    const handleGameResolved = () => {
      logger.log('[useTokenBalance] Game resolved, refreshing');
      // Small delay to ensure blockchain state is updated
      setTimeout(refresh, 200);
    };

    window.addEventListener('vyrejack:gameResolved', handleGameResolved);
    return () => {
      window.removeEventListener('vyrejack:gameResolved', handleGameResolved);
    };
  }, [refresh, disableAutoRefresh]);

  // ⚡ REMOVED: Safety net polling was redundant
  // We now rely entirely on:
  // 1. WebSocket Transfer events (primary)
  // 2. Game resolved custom events
  // 3. Tab visibility refresh
  // This reduces RPC calls significantly while maintaining reactivity

  // ⚡ OPTIMIZATION: Memoized derived values
  const formattedBalance = useMemo(() => {
    if (!balance) return '0.00';
    return parseFloat(balance.formatted).toFixed(2);
  }, [balance]);

  const isApproved = useMemo(() => {
    return allowance?.isApproved ?? false;
  }, [allowance]);

  return {
    balance,
    allowance,
    isLoading,
    error,
    refresh,
    formattedBalance,
    isApproved,
    isWsConnected,
  };
}
