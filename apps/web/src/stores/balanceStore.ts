/**
 * Balance Store (Zustand)
 *
 * Single source of truth for token balance and allowance state.
 * Eliminates polling by centralizing balance updates.
 *
 * ⚡ ARCHITECTURE:
 * - One WebSocket listener for Transfer events (not per-component)
 * - Instant updates on game resolved events
 * - No more multiple useTokenBalance instances
 */

import { create } from 'zustand';
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { TokenService } from '@/services/token.service';
import { VYRECASINO_ADDRESS, riseTestnet } from '@/lib/contract';
import { logger } from '@/lib/logger';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';

// WebSocket config
const WSS_URL = 'wss://testnet.riselabs.xyz/ws';
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

// =============================================================================
// TYPES
// =============================================================================

interface BalanceState {
  // Token balance
  balance: TokenBalance | null;
  allowance: AllowanceState | null;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // WebSocket connection status
  isWsConnected: boolean;

  // Configuration
  token: `0x${string}` | null;
  account: `0x${string}` | null;
  spender: `0x${string}`;
}

interface BalanceActions {
  // Initialize store with token and account
  initialize: (token: `0x${string}`, account: `0x${string}`) => void;

  // Fetch balance from chain
  refresh: () => Promise<void>;

  // Update balance optimistically (for immediate UI feedback)
  setBalance: (balance: TokenBalance | null) => void;

  // Update allowance
  setAllowance: (allowance: AllowanceState | null) => void;

  // Set WebSocket connection status
  setWsConnected: (connected: boolean) => void;

  // Reset store
  reset: () => void;
}

type BalanceStore = BalanceState & BalanceActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: BalanceState = {
  balance: null,
  allowance: null,
  isLoading: false,
  error: null,
  isWsConnected: false,
  token: null,
  account: null,
  spender: VYRECASINO_ADDRESS,
};

// Debounce tracking
let lastRefreshTime = 0;
const REFRESH_DEBOUNCE_MS = 500;

// =============================================================================
// STORE
// =============================================================================

export const useBalanceStore = create<BalanceStore>((set, get) => ({
  ...initialState,

  initialize: (token, account) => {
    set({ token, account });
    // Immediately fetch
    get().refresh();
  },

  refresh: async () => {
    const { token, account, spender } = get();

    if (!token || !account) {
      set({ balance: null, allowance: null });
      return;
    }

    // Debounce rapid calls
    const now = Date.now();
    if (now - lastRefreshTime < REFRESH_DEBOUNCE_MS) {
      return;
    }
    lastRefreshTime = now;

    set({ isLoading: true, error: null });

    try {
      const [balance, allowance] = await Promise.all([
        TokenService.getBalance(token, account),
        TokenService.getAllowance(token, account, spender),
      ]);

      set({ balance, allowance, isLoading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch balance';
      logger.error('[BalanceStore] Error:', message);
      set({ error: message, isLoading: false });
    }
  },

  setBalance: (balance) => set({ balance }),

  setAllowance: (allowance) => set({ allowance }),

  setWsConnected: (connected) => set({ isWsConnected: connected }),

  reset: () => set(initialState),
}));

// =============================================================================
// SELECTORS
// =============================================================================

export const selectBalance = (state: BalanceStore) => state.balance;
export const selectAllowance = (state: BalanceStore) => state.allowance;
export const selectIsApproved = (state: BalanceStore) => state.allowance?.isApproved ?? false;
export const selectFormattedBalance = (state: BalanceStore) =>
  state.balance ? parseFloat(state.balance.formatted).toFixed(2) : '0.00';

// =============================================================================
// GLOBAL EVENT LISTENERS
// =============================================================================

let wsCleanup: (() => void) | null = null;
let gameEventCleanup: (() => void) | null = null;

/**
 * ⚡ Setup global event listeners for balance updates
 * Call this ONCE at app initialization (e.g., in _app.tsx or App.tsx)
 */
export function setupBalanceListeners() {
  const store = useBalanceStore.getState();

  // Setup game resolved event listener
  const handleGameResolved = () => {
    logger.log('[BalanceStore] Game resolved, refreshing balance');
    setTimeout(() => store.refresh(), 200);
  };
  window.addEventListener('vyrejack:gameResolved', handleGameResolved);
  gameEventCleanup = () => window.removeEventListener('vyrejack:gameResolved', handleGameResolved);

  logger.log('[BalanceStore] Global event listeners initialized');
}

/**
 * ⚡ Setup WebSocket listener for Transfer events
 * Call this after initialize() when token/account are available
 */
export function setupTransferListener() {
  const { token, account } = useBalanceStore.getState();

  if (!token || !account) {
    logger.warn('[BalanceStore] Cannot setup WebSocket: token or account not set');
    return;
  }

  // Cleanup previous listener
  if (wsCleanup) {
    wsCleanup();
    wsCleanup = null;
  }

  try {
    const client = createPublicClient({
      chain: riseTestnet as Parameters<typeof createPublicClient>[0]['chain'],
      transport: webSocket(WSS_URL, { reconnect: true, retryCount: 5 }),
    });

    const unwatch = client.watchEvent({
      address: token,
      event: TRANSFER_EVENT,
      onLogs: (logs) => {
        for (const log of logs) {
          const { from, to } = log.args as { from: `0x${string}`; to: `0x${string}` };
          if (
            from?.toLowerCase() === account.toLowerCase() ||
            to?.toLowerCase() === account.toLowerCase()
          ) {
            logger.log('[BalanceStore] Transfer detected, refreshing');
            useBalanceStore.getState().refresh();
            break;
          }
        }
      },
      onError: (err) => {
        logger.error('[BalanceStore] WebSocket error:', err);
        useBalanceStore.setState({ isWsConnected: false });
      },
    });

    useBalanceStore.setState({ isWsConnected: true });
    wsCleanup = unwatch;
    logger.log('[BalanceStore] WebSocket Transfer listener active');
  } catch (err) {
    logger.error('[BalanceStore] Failed to setup WebSocket:', err);
  }
}

/**
 * Cleanup all listeners (call on app unmount)
 */
export function cleanupBalanceListeners() {
  if (wsCleanup) {
    wsCleanup();
    wsCleanup = null;
  }
  if (gameEventCleanup) {
    gameEventCleanup();
    gameEventCleanup = null;
  }
  logger.log('[BalanceStore] Listeners cleaned up');
}
