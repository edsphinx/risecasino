/**
 * useTokenBalance Hook
 *
 * Reactive token balance with optimized polling and caching.
 *
 * ⚡ PERFORMANCE OPTIMIZATIONS:
 * 1. Polling only when tab is active (useTabFocus)
 * 2. Configurable poll interval (default 10s, adjustable)
 * 3. Immediate refresh on demand
 * 4. No unnecessary re-renders (useMemo for derived values)
 * 5. Cache in service layer (TokenService.decimalsCache)
 *
 * 🔧 MAINTAINABILITY:
 * - Uses TokenService for all contract reads (DRY)
 * - Types from @vyrejack/shared (centralized)
 * - Pure logic, no side effects beyond polling
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { useTabFocus } from './useTabFocus';
import { TokenService } from '@/services';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';
import { VYRECASINO_ADDRESS } from '@/lib/contract';
import { logger } from '@/lib/logger';

interface UseTokenBalanceOptions {
  /** Polling interval in ms (default: 10000) */
  pollInterval?: number;
  /** Spender address for allowance check (default: VyreCasino) */
  spender?: `0x${string}`;
  /** Disable polling (for static reads) */
  disablePolling?: boolean;
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
 *
 * @example
 * const { balance, isApproved, refresh } = useTokenBalance(CHIP_TOKEN, account);
 */
export function useTokenBalance(
  token: `0x${string}` | null,
  account: `0x${string}` | null,
  options: UseTokenBalanceOptions = {}
): UseTokenBalanceReturn {
  const { pollInterval = 10000, spender = VYRECASINO_ADDRESS, disablePolling = false } = options;

  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [allowance, setAllowance] = useState<AllowanceState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveTab = useTabFocus();

  // Fetch balance and allowance
  const refresh = useCallback(async () => {
    if (!token || !account) {
      setBalance(null);
      setAllowance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      logger.log('[useTokenBalance] Fetching for:', {
        token,
        account,
        spender,
      });
      const [balanceResult, allowanceResult] = await Promise.all([
        TokenService.getBalance(token, account),
        TokenService.getAllowance(token, account, spender),
      ]);

      setBalance(balanceResult);
      setAllowance(allowanceResult);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch balance';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [token, account, spender]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ⚡ OPTIMIZATION: Poll only when tab is active
  useEffect(() => {
    if (disablePolling || !isActiveTab || !token || !account) {
      return;
    }

    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [disablePolling, isActiveTab, token, account, pollInterval, refresh]);

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
