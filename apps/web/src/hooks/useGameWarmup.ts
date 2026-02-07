/**
 * useGameWarmup - Preload resources before gameplay starts
 *
 * This hook "warms up" everything needed for fast first game:
 * - Session key manager (dynamic import)
 * - Rise Wallet provider + hydration
 * - RPC connection (first contract read)
 * - Contract ABIs (already in memory via imports)
 *
 * Call this early (e.g., on page mount) so when user clicks "Deal",
 * everything is already loaded and cached.
 */

import { useEffect, useState } from 'preact/hooks';
import { logger } from '@/lib/logger';
import { waitForHydration, getProvider } from '@/lib/riseWallet';
import { TokenService } from '@/services/token.service';
import { CHIP_TOKEN_ADDRESS, VYRECASINO_ADDRESS } from '@/lib/contract';

interface WarmupState {
  isWarmedUp: boolean;
  isWarmingUp: boolean;
  warmupTime: number | null;
}

export function useGameWarmup(userAddress: `0x${string}` | null): WarmupState {
  const [state, setState] = useState<WarmupState>({
    isWarmedUp: false,
    isWarmingUp: false,
    warmupTime: null,
  });

  useEffect(() => {
    if (!userAddress) return;
    if (state.isWarmedUp || state.isWarmingUp) return;

    const warmup = async () => {
      const startTime = performance.now();
      setState((s) => ({ ...s, isWarmingUp: true }));
      logger.log('[Warmup] Starting pre-game warmup...');

      try {
        // 1. Wait for Porto hydration (session key persistence)
        logger.log('[Warmup] 1/4 Hydrating Porto store...');
        await waitForHydration();

        // 2. Preload session key manager (dynamic import)
        logger.log('[Warmup] 2/4 Loading session key manager...');
        await import('@/services/sessionKey.service');

        // 3. Get provider ready (creates RiseWallet singleton)
        logger.log('[Warmup] 3/4 Initializing provider...');
        getProvider();

        // 4. Make first RPC call to warm up connection + cache token metadata
        logger.log('[Warmup] 4/4 Warming up RPC connection...');
        await Promise.all([
          // Cache token decimals and symbol
          TokenService.getDecimals(CHIP_TOKEN_ADDRESS),
          TokenService.getSymbol(CHIP_TOKEN_ADDRESS),
          // Pre-fetch user balance
          TokenService.getBalance(CHIP_TOKEN_ADDRESS, userAddress),
          // Pre-fetch allowance
          TokenService.getAllowance(CHIP_TOKEN_ADDRESS, userAddress, VYRECASINO_ADDRESS),
        ]);

        const warmupTime = Math.round(performance.now() - startTime);
        logger.log(`[Warmup] ✅ Complete in ${warmupTime}ms`);

        setState({
          isWarmedUp: true,
          isWarmingUp: false,
          warmupTime,
        });
      } catch (error) {
        logger.warn('[Warmup] Error during warmup (non-fatal):', error);
        // Still mark as warmed up - we tried, and the actual action will retry
        setState({
          isWarmedUp: true,
          isWarmingUp: false,
          warmupTime: null,
        });
      }
    };

    warmup();
  }, [userAddress, state.isWarmedUp, state.isWarmingUp]);

  return state;
}
