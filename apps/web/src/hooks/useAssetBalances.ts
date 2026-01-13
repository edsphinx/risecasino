/**
 * useAssetBalances - Hook for fetching multiple asset balances and approval status
 *
 * ⚡ PERFORMANCE: 
 * - Parallel fetches, uses TokenService caching
 * - Polling only when tab is active (same as useTokenBalance)
 * - Event-driven refresh on game resolved
 * 
 * Returns balances and approval status for USDC only (ETH is native)
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { TokenService } from '@/services/token.service';
import { USDC_TOKEN_ADDRESS } from '@/lib/contract';
import { useTabFocus } from './useTabFocus';
import { logger } from '@/lib/logger';

// Token logo URLs (same as GameVersionSelector)
const TOKEN_LOGOS = {
  usdc: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
} as const;

export interface AssetInfo {
  symbol: string;
  balance: string;
  balanceRaw: bigint;
  decimals: number;
  isApproved: boolean;
  icon: string;
}

export interface UseAssetBalancesReturn {
  assets: AssetInfo[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 10000; // 10 seconds, same as useTokenBalance

export function useAssetBalances(account: `0x${string}` | null): UseAssetBalancesReturn {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isActiveTab = useTabFocus();

  const fetchAssets = useCallback(async () => {
    if (!account) {
      setAssets([]);
      return;
    }

    setIsLoading(true);

    try {
      // Fetch USDC balance and approval (ETH is handled separately as native)
      const [usdcBalance, usdcAllowance] = await Promise.all([
        TokenService.getBalance(USDC_TOKEN_ADDRESS, account),
        TokenService.getAllowance(USDC_TOKEN_ADDRESS, account),
      ]);

      setAssets([
        {
          symbol: 'USDC',
          balance: parseFloat(usdcBalance.formatted).toFixed(2),
          balanceRaw: usdcBalance.raw,
          decimals: usdcBalance.decimals,
          isApproved: usdcAllowance.isApproved,
          icon: TOKEN_LOGOS.usdc,
        },
      ]);
    } catch (error) {
      logger.error('[useAssetBalances] Error fetching:', error);
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  // Initial fetch
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // ⚡ OPTIMIZATION: Poll only when tab is active (same as useTokenBalance)
  useEffect(() => {
    if (!isActiveTab || !account) {
      return;
    }

    const interval = setInterval(fetchAssets, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isActiveTab, account, fetchAssets]);

  // Listen for game resolved events for immediate refresh
  useEffect(() => {
    const handleGameResolved = () => {
      // Small delay to allow blockchain state to update
      setTimeout(() => fetchAssets(), 1000);
    };

    window.addEventListener('vyrejack:gameResolved', handleGameResolved);
    return () => window.removeEventListener('vyrejack:gameResolved', handleGameResolved);
  }, [fetchAssets]);

  return {
    assets,
    isLoading,
    refresh: fetchAssets,
  };
}
