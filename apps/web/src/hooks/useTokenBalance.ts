/**
 * useTokenBalance Hook
 *
 * Reactive token balance with EVENT-DRIVEN updates (no polling).
 *
 * ⚡ PERFORMANCE OPTIMIZATIONS:
 * 1. WebSocket listener for ERC20 Transfer events
 * 2. Game event listener for immediate post-game refresh
 * 3. No polling - only fetches on mount and events
 * 4. No unnecessary re-renders (useMemo for derived values)
 * 5. Cache in service layer (TokenService.decimalsCache)
 *
 * 🔧 MAINTAINABILITY:
 * - Uses TokenService for all contract reads (DRY)
 * - Types from @vyrejack/shared (centralized)
 * - Pure logic, minimal network calls
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { TokenService } from '@/services';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';
import { VYRECASINO_ADDRESS, riseTestnet } from '@/lib/contract';
import { logger } from '@/lib/logger';

const WSS_URL = 'wss://testnet.riselabs.xyz/ws';

// ERC20 Transfer event signature
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

interface UseTokenBalanceOptions {
  /** Spender address for allowance check (default: VyreCasino) */
  spender?: `0x${string}`;
  /** Disable WebSocket events (for static reads) */
  disableEvents?: boolean;
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
}

/**
 * Hook for reactive token balance and allowance state
 * Uses WebSocket events for real-time updates instead of polling
 *
 * @example
 * const { balance, isApproved, refresh } = useTokenBalance(CHIP_TOKEN, account);
 */
export function useTokenBalance(
  token: `0x${string}` | null,
  account: `0x${string}` | null,
  options: UseTokenBalanceOptions = {}
): UseTokenBalanceReturn {
  const { spender = VYRECASINO_ADDRESS, disableEvents = false } = options;

  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [allowance, setAllowance] = useState<AllowanceState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we've fetched at least once
  const hasFetchedRef = useRef(false);
  const unwatchRef = useRef<(() => void) | null>(null);

  // Fetch balance and allowance
  const refresh = useCallback(async () => {
    if (!token || !account) {
      setBalance(null);
      setAllowance(null);
      return;
    }

    // Only log on first fetch to reduce noise
    if (!hasFetchedRef.current) {
      logger.log('[useTokenBalance] Initial fetch for:', { token, account });
    }

    setIsLoading(true);
    setError(null);

    try {
      const [balanceResult, allowanceResult] = await Promise.all([
        TokenService.getBalance(token, account),
        TokenService.getAllowance(token, account, spender),
      ]);

      setBalance(balanceResult);
      setAllowance(allowanceResult);
      hasFetchedRef.current = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch balance';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [token, account, spender]);

  // Initial fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ⚡ EVENT-DRIVEN: Listen for Transfer events via WebSocket
  useEffect(() => {
    if (disableEvents || !token || !account) {
      return;
    }

    let cleanup: (() => void) | undefined;

    const setupWebSocket = async () => {
      try {
        const client = createPublicClient({
          chain: riseTestnet as Parameters<typeof createPublicClient>[0]['chain'],
          transport: webSocket(WSS_URL),
        });

        // Watch for Transfer events TO or FROM this account
        const unwatch = client.watchEvent({
          address: token,
          event: TRANSFER_EVENT,
          onLogs: (logs) => {
            for (const log of logs) {
              const { from, to } = log.args as { from: `0x${string}`; to: `0x${string}` };
              // If this account sent or received tokens, refresh
              if (from?.toLowerCase() === account.toLowerCase() ||
                to?.toLowerCase() === account.toLowerCase()) {
                logger.log('[useTokenBalance] Transfer detected, refreshing balance');
                refresh();
                break; // Only refresh once per batch
              }
            }
          },
          onError: (err) => {
            logger.error('[useTokenBalance] WebSocket error:', err);
          },
        });

        unwatchRef.current = unwatch;
        cleanup = unwatch;
      } catch (err) {
        logger.error('[useTokenBalance] Failed to setup WebSocket:', err);
      }
    };

    setupWebSocket();

    return () => {
      if (cleanup) cleanup();
      if (unwatchRef.current) {
        unwatchRef.current();
        unwatchRef.current = null;
      }
    };
  }, [token, account, disableEvents, refresh]);

  // ⚡ EVENT-DRIVEN: Listen for game resolved events
  useEffect(() => {
    const handleGameResolved = () => {
      logger.log('[useTokenBalance] Game resolved, refreshing balance');
      // Small delay to ensure blockchain state is updated
      setTimeout(refresh, 200);
    };

    window.addEventListener('vyrejack:gameResolved', handleGameResolved);
    return () => {
      window.removeEventListener('vyrejack:gameResolved', handleGameResolved);
    };
  }, [refresh]);

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
  };
}
