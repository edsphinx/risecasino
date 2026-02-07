import type { Address } from 'viem';

/**
 * Game state enum matching VyreJackCore.GameState exactly
 * IMPORTANT: Order must match the Solidity contract
 */
export enum GameState {
  Idle = 0, // No active game
  WaitingForDeal = 1, // Awaiting initial 4 cards from VRF
  PlayerTurn = 2, // Player can hit/stand/double/surrender
  WaitingForHit = 3, // Awaiting hit card from VRF
  WaitingForDouble = 4, // Awaiting double card from VRF
  DealerTurn = 5, // Dealer is drawing
  PlayerWin = 6, // Player won
  DealerWin = 7, // Dealer won
  Push = 8, // Tie - bet returned
  PlayerBlackjack = 9, // Player got natural 21
}

/**
 * Game data from smart contract
 */
export interface GameData {
  player: Address;
  bet: bigint;
  playerCards: readonly number[];
  dealerCards: readonly number[];
  state: GameState;
  timestamp: bigint;
  isDoubled: boolean;
}

/**
 * Hand value with soft indicator and game state
 */
export interface HandValue {
  value: number;
  isSoft: boolean;
  isBust: boolean;
  isBlackjack: boolean;
}

/**
 * Bet limits from contract
 */
export interface BetLimits {
  min: bigint;
  max: bigint;
}

/**
 * Game action types
 */
export type GameAction = 'hit' | 'stand' | 'double' | 'surrender';

/**
 * Game result for UI display
 */
export type GameResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

/**
 * Game result without null (for completed games)
 */
export type EngineGameResult = 'win' | 'lose' | 'push' | 'blackjack';

// =============================================================================
// GAME PHASE - String alias for GameState enum (for easier frontend usage)
// =============================================================================

/**
 * GamePhase - String alias matching VyreJackCore.GameState
 * Provides a more ergonomic string-based API for frontend components
 */
export type GamePhase =
  | 'idle' // GameState.Idle (0)
  | 'waiting_for_deal' // GameState.WaitingForDeal (1)
  | 'player_turn' // GameState.PlayerTurn (2)
  | 'waiting_for_hit' // GameState.WaitingForHit (3)
  | 'waiting_for_double' // GameState.WaitingForDouble (4)
  | 'dealer_turn' // GameState.DealerTurn (5)
  | 'player_win' // GameState.PlayerWin (6)
  | 'dealer_win' // GameState.DealerWin (7)
  | 'push' // GameState.Push (8)
  | 'player_blackjack'; // GameState.PlayerBlackjack (9)

/**
 * Valid phase transitions map for state machine validation
 */
export const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  idle: ['waiting_for_deal'],
  waiting_for_deal: ['player_turn', 'player_blackjack', 'dealer_win', 'push'],
  player_turn: ['waiting_for_hit', 'waiting_for_double', 'dealer_turn', 'dealer_win'],
  waiting_for_hit: ['player_turn', 'dealer_win', 'dealer_turn'],
  waiting_for_double: ['dealer_turn', 'dealer_win'],
  dealer_turn: ['player_win', 'dealer_win', 'push'],
  player_win: ['idle'],
  dealer_win: ['idle'],
  push: ['idle'],
  player_blackjack: ['idle'],
};

/**
 * Result phases for determining game outcome
 */
export const RESULT_PHASES: GamePhase[] = ['player_win', 'dealer_win', 'push', 'player_blackjack'];

// =============================================================================
// CARD INDEX TYPES - Standard deck representation
// =============================================================================

/**
 * Card index 0-51 mapping to standard deck
 * suit = Math.floor(cardIndex / 13)  // 0=♠, 1=♥, 2=♦, 3=♣
 * rank = cardIndex % 13              // 0=A, 1=2, ..., 12=K
 */
export type CardIndex = number;

/**
 * Card suit derived from index: Math.floor(index / 13)
 */
export type SuitIndex = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣

/**
 * Card rank derived from index: index % 13
 */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
