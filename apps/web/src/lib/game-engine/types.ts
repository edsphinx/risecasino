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

// Game phase and transitions (centralized in shared)
export type { GamePhase, CardIndex, SuitIndex, Rank, EngineGameResult } from '@vyrejack/shared';
export { VALID_TRANSITIONS, RESULT_PHASES } from '@vyrejack/shared';

// Re-export cards from shared
export { Suit, RANK_NAMES, SUIT_SYMBOLS } from '@vyrejack/shared';
export type { CardDisplay } from '@vyrejack/shared';

// =============================================================================
// ENGINE-SPECIFIC STATE
// =============================================================================

import type { HandValue, GamePhase, CardIndex } from '@vyrejack/shared';

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
// PLAYER ACTIONS - Engine specific event
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
