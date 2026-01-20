/**
 * Stores Index
 *
 * Central export for all Zustand stores.
 */

export {
  useGameStore,
  selectLastGameResult,
  selectShowingResult,
  selectAccumulatedCards,
} from './gameStore';
export type { HandSnapshot, CardAccumulator } from './gameStore';

// Re-export GameResult from shared types (source of truth)
export type { GameResult } from '@vyrejack/shared';

export {
  useBalanceStore,
  selectBalance,
  selectAllowance,
  selectIsApproved,
  selectFormattedBalance,
} from './balanceStore';

export {
  useSessionStore,
  selectSessionKey,
  selectHasSessionKey,
  selectHasHydrated,
  selectIsCreating,
  selectSessionError,
  revokeOrphanedRemoteKeys,
} from './sessionStore';
export type { SessionKeyData } from './sessionStore';
