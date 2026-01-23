/**
 * GameEngine Type Definitions
 *
 * Re-exports shared types and adds engine-specific types.
 * ⚠️ STRICT TYPING: Never use `any` - always create proper interfaces.
 */

// =============================================================================
// RE-EXPORTS FROM SHARED - Single source of truth
// =============================================================================

// Types that match contract exactly
export { GameState } from '@vyrejack/shared';
export type { HandValue, GameAction, GameResult } from '@vyrejack/shared';

// Re-export cards from shared
export { Suit, RANK_NAMES, SUIT_SYMBOLS } from '@vyrejack/shared';
export type { CardDisplay } from '@vyrejack/shared';

// =============================================================================
// GAME PHASE - String alias for GameState enum (for easier frontend usage)
// =============================================================================

export type GamePhase =
    | 'idle' // GameState.Idle
    | 'waiting_for_deal' // GameState.WaitingForDeal
    | 'player_turn' // GameState.PlayerTurn
    | 'waiting_for_hit' // GameState.WaitingForHit
    | 'waiting_for_double' // GameState.WaitingForDouble
    | 'dealer_turn' // GameState.DealerTurn
    | 'player_win' // GameState.PlayerWin
    | 'dealer_win' // GameState.DealerWin
    | 'push' // GameState.Push
    | 'player_blackjack'; // GameState.PlayerBlackjack

// Valid phase transitions map
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

// Result phases for determining game outcome
export const RESULT_PHASES: GamePhase[] = ['player_win', 'dealer_win', 'push', 'player_blackjack'];

// =============================================================================
// CARD TYPES - Engine specific
// =============================================================================

/** Card index 0-51 mapping to standard deck */
export type CardIndex = number;

/** Card suit derived from index: Math.floor(index / 13) */
export type SuitIndex = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣

/** Card rank derived from index: index % 13 */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// Legacy constant names for backward compatibility
export const SUIT_NAMES: Record<SuitIndex, string> = {
    0: '♠',
    1: '♥',
    2: '♦',
    3: '♣',
};

// =============================================================================
// GAME STATE - Engine specific state
// =============================================================================

import type { HandValue } from '@vyrejack/shared';

export interface EngineGameState {
    phase: GamePhase;
    playerCards: CardIndex[];
    dealerCards: CardIndex[];
    dealerHiddenCard: CardIndex | null;
    isHiddenRevealed: boolean;
    isDoubled: boolean;
    playerHandValue: HandValue | null;
    dealerHandValue: HandValue | null;
}

// =============================================================================
// PLAYER ACTIONS - Using GameAction from shared
// =============================================================================

export type PlayerAction = 'hit' | 'stand' | 'double' | 'surrender';

export interface PlayerActionEvent {
    action: PlayerAction;
    timestamp: number;
}

// =============================================================================
// CARD POSITION - Animation specific
// =============================================================================

export interface CardPosition {
    x: number;
    y: number;
    rotation: number;
    scale: number;
}

// =============================================================================
// CARD ELEMENT - DOM specific
// =============================================================================

export interface CardElement {
    id: string;
    element: HTMLElement;
    cardIndex: CardIndex;
    isDealer: boolean;
    isFaceUp: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface GameEngineConfig {
    containerId: string;
    animationSpeed?: 'slow' | 'normal' | 'fast';
    deckPosition?: { x: number; y: number };
}

export const DEFAULT_CONFIG: Required<Omit<GameEngineConfig, 'containerId'>> = {
    animationSpeed: 'normal',
    deckPosition: { x: 0, y: -200 },
};

// =============================================================================
// ANIMATION TIMING
// =============================================================================

export interface AnimationTiming {
    dealDuration: number;
    dealStagger: number;
    flipDuration: number;
    winCelebration: number;
    loseShake: number;
}

export const TIMING_PRESETS: Record<'slow' | 'normal' | 'fast', AnimationTiming> = {
    slow: {
        dealDuration: 1.2,
        dealStagger: 0.5,
        flipDuration: 0.6,
        winCelebration: 0.8,
        loseShake: 0.6,
    },
    normal: {
        dealDuration: 0.8,
        dealStagger: 0.35,
        flipDuration: 0.4,
        winCelebration: 0.6,
        loseShake: 0.4,
    },
    fast: {
        dealDuration: 0.5,
        dealStagger: 0.2,
        flipDuration: 0.25,
        winCelebration: 0.4,
        loseShake: 0.3,
    },
};

// =============================================================================
// EVENTS / LISTENERS
// =============================================================================

export type StateListener = (state: EngineGameState) => void;

export interface CardDealtEventData {
    cardIndex: CardIndex;
    isDealer: boolean;
    isHidden: boolean;
}
