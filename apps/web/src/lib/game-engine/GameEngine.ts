/**
 * GameEngine - Main Game Orchestrator
 *
 * Coordinates StateMachine, CardRenderer, and AnimationController
 * to provide a complete game experience.
 *
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import { StateMachine } from './StateMachine';
import { CardRenderer } from './CardRenderer';
import { AnimationController } from './AnimationController';
import type {
    GameEngineConfig,
    EngineGameState,
    GamePhase,
    GameResult,
    CardIndex,
    CardPosition,
    StateListener,
} from './types';
import { DEFAULT_CONFIG, TIMING_PRESETS } from './types';

/**
 * Phase change listener type
 */
type PhaseListener = (phase: GamePhase) => void;

/**
 * Game end listener type
 */
type GameEndListener = (result: GameResult) => void;

/**
 * GameEngine class
 *
 * Main orchestrator for the blackjack game.
 * Handles card dealing, animations, and game state.
 */
export class GameEngine {
    private config: Required<GameEngineConfig>;
    private stateMachine: StateMachine;
    private renderer: CardRenderer;
    private animator: AnimationController;

    private dealQueue: { cardIndex: CardIndex; isDealer: boolean; isHidden: boolean }[];
    private phaseListeners: Set<PhaseListener>;
    private gameEndListeners: Set<GameEndListener>;
    private isDestroyed: boolean;

    constructor(config: GameEngineConfig) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };

        this.stateMachine = new StateMachine();
        this.renderer = new CardRenderer(this.config.containerId);
        this.animator = new AnimationController(
            TIMING_PRESETS[this.config.animationSpeed]
        );

        this.dealQueue = [];
        this.phaseListeners = new Set();
        this.gameEndListeners = new Set();
        this.isDestroyed = false;

        // Subscribe to state machine changes for phase notifications
        this.stateMachine.subscribe((state) => {
            this.notifyPhaseListeners(state.phase);
        });
    }

    // =========================================================================
    // GAME FLOW
    // =========================================================================

    /**
     * Start a new game - transitions to dealing phase
     */
    startGame(): void {
        if (this.isDestroyed) return;
        this.stateMachine.setPhase('dealing');
    }

    /**
     * Transition to player turn
     */
    setPlayerTurn(): void {
        if (this.isDestroyed) return;
        this.stateMachine.setPhase('player_turn');
    }

    /**
     * Transition to dealer turn
     */
    setDealerTurn(): void {
        if (this.isDestroyed) return;
        this.stateMachine.setPhase('dealer_turn');
    }

    /**
     * End the game with a result
     */
    endGame(result: GameResult): void {
        if (this.isDestroyed) return;

        this.stateMachine.setPhase('result');

        // Trigger result animation
        const playerCards = this.getPlayerCardElements();
        // TODO: Add dealer card animation for push result

        if (result === 'win' || result === 'blackjack') {
            this.animator.animateWin(playerCards);
        } else if (result === 'lose') {
            this.animator.animateLose(playerCards);
        }
        // push has no special animation

        // Notify listeners
        this.gameEndListeners.forEach((listener) => listener(result));
    }

    // =========================================================================
    // CARD OPERATIONS
    // =========================================================================

    /**
     * Deal a card with animation
     */
    dealCard(cardIndex: CardIndex, isDealer: boolean, isHidden: boolean): void {
        if (this.isDestroyed) return;

        // Add to state
        this.stateMachine.addCard(cardIndex, isDealer, isHidden);

        // Create and render card
        const cardEl = this.renderer.createCard(cardIndex, isDealer);
        this.renderer.addToZone(cardEl, isDealer);

        // Set face up/down based on hidden
        if (!isHidden) {
            this.renderer.setFaceUp(cardEl, true);
        }

        // Animate from deck
        const deckPos = this.renderer.getDeckPosition();
        const from: CardPosition = {
            x: deckPos.x,
            y: deckPos.y,
            rotation: -180,
            scale: 0.7,
        };

        const targetPos = this.calculateCardPosition(isDealer);
        const delay = this.dealQueue.length * 0.35;

        this.dealQueue.push({ cardIndex, isDealer, isHidden });
        this.animator.animateDeal(cardEl, from, targetPos, delay);
    }

    /**
     * Reveal the dealer's hidden card
     */
    revealHiddenCard(): void {
        if (this.isDestroyed) return;

        this.stateMachine.revealHiddenCard();

        // Find hidden card element and animate flip
        const hiddenCardIndex = this.stateMachine.getState().dealerHiddenCard;
        if (hiddenCardIndex !== null) {
            const cards = this.getDealerCardElements();
            // Hidden card is typically at index 1
            if (cards[1]) {
                this.animator.animateFlip(cards[1], () => {
                    this.renderer.setFaceUp(cards[1], true);
                });
            }
        }
    }

    // =========================================================================
    // RESET
    // =========================================================================

    /**
     * Reset game to initial state
     */
    reset(): void {
        this.animator.killAll();
        this.renderer.removeAllCards();
        this.stateMachine.reset();
        this.dealQueue = [];
    }

    /**
     * Destroy the engine and cleanup
     */
    destroy(): void {
        this.isDestroyed = true;
        this.reset();
        this.phaseListeners.clear();
        this.gameEndListeners.clear();
    }

    // =========================================================================
    // STATE ACCESS
    // =========================================================================

    /**
     * Get current state
     */
    getState(): EngineGameState {
        return this.stateMachine.getState();
    }

    /**
     * Get current phase
     */
    getPhase(): GamePhase {
        return this.stateMachine.getPhase();
    }

    // =========================================================================
    // SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: StateListener): () => void {
        return this.stateMachine.subscribe(listener);
    }

    /**
     * Subscribe to phase changes
     */
    onPhaseChange(listener: PhaseListener): () => void {
        this.phaseListeners.add(listener);
        return () => this.phaseListeners.delete(listener);
    }

    /**
     * Subscribe to game end events
     */
    onGameEnd(listener: GameEndListener): () => void {
        this.gameEndListeners.add(listener);
        return () => this.gameEndListeners.delete(listener);
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    private notifyPhaseListeners(phase: GamePhase): void {
        this.phaseListeners.forEach((listener) => listener(phase));
    }

    private calculateCardPosition(isDealer: boolean): CardPosition {
        const zone = isDealer
            ? this.renderer.getDealerZone()
            : this.renderer.getPlayerZone();
        const cards = zone.children.length;

        return {
            x: cards * 30, // Stack offset
            y: 0,
            rotation: 0,
            scale: 1,
        };
    }

    private getPlayerCardElements(): HTMLElement[] {
        const zone = this.renderer.getPlayerZone();
        return Array.from(zone.children) as HTMLElement[];
    }

    private getDealerCardElements(): HTMLElement[] {
        const zone = this.renderer.getDealerZone();
        return Array.from(zone.children) as HTMLElement[];
    }
}
