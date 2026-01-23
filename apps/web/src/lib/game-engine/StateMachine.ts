/**
 * StateMachine - Pure TypeScript Game State Management
 *
 * Manages game state without any framework dependencies.
 * Uses subscription pattern for state change notifications.
 *
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import type {
    EngineGameState,
    GamePhase,
    CardIndex,
    StateListener,
} from './types';
import { VALID_TRANSITIONS } from './types';

/**
 * Creates the initial game state
 */
function createInitialState(): EngineGameState {
    return {
        phase: 'idle',
        playerCards: [],
        dealerCards: [],
        dealerHiddenCard: null,
        isHiddenRevealed: false,
        isDoubled: false,
        playerHandValue: null,
        dealerHandValue: null,
    };
}

/**
 * StateMachine class
 *
 * Handles all game state mutations and notifies subscribers.
 */
export class StateMachine {
    private state: EngineGameState;
    private listeners: Set<StateListener>;

    constructor() {
        this.state = createInitialState();
        this.listeners = new Set();
    }

    // =========================================================================
    // STATE ACCESS
    // =========================================================================

    /**
     * Get a copy of the current state
     */
    getState(): EngineGameState {
        return {
            ...this.state,
            playerCards: [...this.state.playerCards],
            dealerCards: [...this.state.dealerCards],
            playerHandValue: this.state.playerHandValue
                ? { ...this.state.playerHandValue }
                : null,
            dealerHandValue: this.state.dealerHandValue
                ? { ...this.state.dealerHandValue }
                : null,
        };
    }

    /**
     * Get current game phase
     */
    getPhase(): GamePhase {
        return this.state.phase;
    }

    // =========================================================================
    // CARD OPERATIONS
    // =========================================================================

    /**
     * Add a card to player or dealer hand
     */
    addCard(card: CardIndex, isDealer: boolean, isHidden: boolean): void {
        if (isDealer) {
            this.state.dealerCards = [...this.state.dealerCards, card];
            if (isHidden) {
                this.state.dealerHiddenCard = card;
            }
        } else {
            this.state.playerCards = [...this.state.playerCards, card];
        }
        this.notify();
    }

    /**
     * Reveal the dealer's hidden card
     */
    revealHiddenCard(): void {
        this.state.isHiddenRevealed = true;
        this.notify();
    }

    // =========================================================================
    // PHASE TRANSITIONS
    // =========================================================================

    /**
     * Check if transition to target phase is valid
     */
    canTransitionTo(targetPhase: GamePhase): boolean {
        const validTargets = VALID_TRANSITIONS[this.state.phase];
        return validTargets.includes(targetPhase);
    }

    /**
     * Set game phase (validates transition)
     */
    setPhase(phase: GamePhase): void {
        // Allow transition even if invalid (game logic handles this)
        // Future: throw error on invalid transition
        this.state.phase = phase;
        this.notify();
    }

    // =========================================================================
    // SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribe to state changes
     * @returns Unsubscribe function
     */
    subscribe(listener: StateListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Notify all subscribers of state change
     */
    private notify(): void {
        const stateCopy = this.getState();
        this.listeners.forEach((listener) => listener(stateCopy));
    }

    // =========================================================================
    // RESET
    // =========================================================================

    /**
     * Reset to initial state
     */
    reset(): void {
        this.state = createInitialState();
        this.notify();
    }
}
