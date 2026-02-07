/**
 * GameEngine Public API
 *
 * Re-exports all public types and classes.
 */

export { StateMachine } from './StateMachine';
export { CardRenderer } from './CardRenderer';
export { AnimationController } from './AnimationController';
export { GameEngine } from './GameEngine';
export {
    calculateHandValue,
    canDouble,
    canSurrender,
    shouldDealerHit,
} from './handValue';

export type {
    GamePhase,
    CardIndex,
    Suit,
    Rank,
    EngineGameState,
    CardPosition,
    CardElement,
    GameEngineConfig,
    AnimationTiming,
    StateListener,
    CardDealtEventData,
    HandValue,
    GameResult,
} from './types';

export {
    VALID_TRANSITIONS,
    SUIT_SYMBOLS,
    RANK_NAMES,
    DEFAULT_CONFIG,
    TIMING_PRESETS,
} from './types';
