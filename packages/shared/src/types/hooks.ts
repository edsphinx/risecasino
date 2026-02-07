/**
 * Hook Types
 *
 * Centralized type definitions for React hooks.
 * These types are shared across the frontend application.
 */

// =============================================================================
// GAME ACTIONS
// =============================================================================

/**
 * Available game actions for VyreJack
 */
export type GameActionName = 'hit' | 'stand' | 'double' | 'surrender' | 'retryVRF';

/**
 * Card data extracted from transaction events
 */
export interface CardDealtFromTx {
  card: number;
  isDealer: boolean;
  player: `0x${string}`;
}

/**
 * Configuration for game action hooks
 */
export interface GameActionsConfig {
  onGameEnd?: (outcome: string, payout: bigint) => void;
  onError?: (error: Error) => void;
  onTxSubmitted?: (hash: `0x${string}`) => void;
  onActionStart?: (action: GameActionName) => void;
  onActionComplete?: (action: GameActionName) => void;
}

// =============================================================================
// GAME EVENTS
// =============================================================================

/**
 * Event data for game started
 */
export interface GameStartedEvent {
  player: `0x${string}`;
  bet: bigint;
  token: `0x${string}`;
}

/**
 * Event data for card dealt
 */
export interface CardDealtEvent {
  player: `0x${string}`;
  card: number;
  isDealer: boolean;
}

/**
 * Event data for game ended
 */
export interface GameEndedEvent {
  player: `0x${string}`;
  outcome: number;
  payout: bigint;
}

/**
 * Callbacks for game event subscriptions
 */
export interface GameEventsCallbacks {
  onGameStarted?: (data: GameStartedEvent) => void;
  onCardDealt?: (data: CardDealtEvent) => void;
  onGameEnded?: (data: GameEndedEvent) => void;
  onVRFRequested?: (requestId: bigint) => void;
  onVRFFulfilled?: (requestId: bigint) => void;
  onFallbackCommit?: (player: `0x${string}`, commitHash: `0x${string}`) => void;
  onFallbackReveal?: (player: `0x${string}`, randomness: bigint) => void;
}

// =============================================================================
// GAME STATE
// =============================================================================

/**
 * Accumulated cards during game
 */
export interface CardAccumulator {
  playerCards: number[];
  dealerCards: number[];
}

/**
 * Snapshot of a hand at a point in time
 */
export interface HandSnapshot {
  cards: number[];
  value: number;
  isSoft: boolean;
}

/**
 * Warmup state for game preparation
 */
export interface WarmupState {
  isWarming: boolean;
  isReady: boolean;
  error: Error | null;
}

// =============================================================================
// TOKEN BALANCE
// =============================================================================

/**
 * Options for useTokenBalance hook
 */
export interface UseTokenBalanceOptions {
  /** Token contract address */
  tokenAddress: `0x${string}`;
  /** User wallet address */
  walletAddress?: `0x${string}`;
  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number;
}

/**
 * Return type for useTokenBalance hook
 */
export interface UseTokenBalanceReturn {
  balance: bigint;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// =============================================================================
// NAVIGATION
// =============================================================================

/**
 * Return type for useGameNavigation hook
 */
export interface UseGameNavigationReturn {
  navigateToGame: (token: 'usdc' | 'chip' | 'eth') => void;
  navigateToHome: () => void;
  currentToken: 'usdc' | 'chip' | 'eth' | null;
}
