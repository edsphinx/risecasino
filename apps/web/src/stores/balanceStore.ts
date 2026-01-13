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
import { TokenService } from '@/services/token.service';
import { VYRECASINO_ADDRESS } from '@/lib/contract';
import { logger } from '@/lib/logger';
import type { TokenBalance, AllowanceState } from '@vyrejack/shared';

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
