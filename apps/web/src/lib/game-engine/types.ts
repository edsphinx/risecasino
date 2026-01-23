/**
 * GameEngine Type Definitions
 *
 * All types used by the GameEngine modules.
 * ⚠️ STRICT TYPING: Never use `any` - always create proper interfaces.
 */

// =============================================================================
// GAME PHASE - Matches VyreJackCore.GameState enum
// =============================================================================

export type GamePhase =
    | 'idle' // No active game
    | 'waiting_for_deal' // Awaiting initial 4 cards from VRF
    | 'player_turn' // Player can hit/stand/double/surrender
    | 'waiting_for_hit' // Awaiting hit card from VRF
    | 'waiting_for_double' // Awaiting double card from VRF
    | 'dealer_turn' // Dealer is drawing
    | 'player_win' // Player won
    | 'dealer_win' // Dealer won
    | 'push' // Tie - bet returned
    | 'player_blackjack'; // Player got natural 21

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
// CARD TYPES
// =============================================================================

/** Card index 0-51 mapping to standard deck */
export type CardIndex = number;

/** Card suit derived from index: Math.floor(index / 13) */
export type Suit = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣

/** Card rank derived from index: index % 13 */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const SUIT_NAMES: Record<Suit, string> = {
    0: '♠',
    1: '♥',
    2: '♦',
    3: '♣',
};

export const RANK_NAMES: Record<Rank, string> = {
    0: 'A',
    1: '2',
    2: '3',
    3: '4',
    4: '5',
    5: '6',
    6: '7',
    7: '8',
    8: '9',
    9: '10',
    10: 'J',
    11: 'Q',
    12: 'K',
};

// =============================================================================
// GAME STATE
// =============================================================================

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
// PLAYER ACTIONS - Matches VyreJackCore player functions
// =============================================================================

export type PlayerAction = 'hit' | 'stand' | 'double' | 'surrender';

export interface PlayerActionEvent {
    action: PlayerAction;
    timestamp: number;
}

// =============================================================================
// CARD POSITION
// =============================================================================

export interface CardPosition {
    x: number;
    y: number;
    rotation: number;
    scale: number;
}

// =============================================================================
// CARD ELEMENT
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

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Result type for calculations */
export interface HandValue {
    value: number;
    isSoft: boolean; // Has ace counted as 11
    isBust: boolean;
    isBlackjack: boolean;
}

/** Game result */
export type GameResult = 'win' | 'lose' | 'push' | 'blackjack';
