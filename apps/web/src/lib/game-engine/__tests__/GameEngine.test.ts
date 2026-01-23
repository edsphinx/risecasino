/**
 * GameEngine Tests (TDD)
 *
 * Tests for the main game orchestrator.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../GameEngine';
import type { GamePhase } from '../types';

describe('GameEngine', () => {
    let engine: GameEngine;
    let container: HTMLElement;

    beforeEach(() => {
        // Create test container
        container = document.createElement('div');
        container.id = 'game-engine-test';
        container.innerHTML = `
      <div class="dealer-zone" data-zone="dealer"></div>
      <div class="deck-area" data-zone="deck"></div>
      <div class="player-zone" data-zone="player"></div>
    `;
        document.body.appendChild(container);

        engine = new GameEngine({ containerId: 'game-engine-test' });
    });

    afterEach(() => {
        engine.destroy();
        document.body.removeChild(container);
    });

    describe('Initialization', () => {
        it('creates engine instance', () => {
            expect(engine).toBeDefined();
        });

        it('starts in idle phase', () => {
            expect(engine.getPhase()).toBe('idle');
        });

        it('has no cards initially', () => {
            const state = engine.getState();
            expect(state.playerCards).toEqual([]);
            expect(state.dealerCards).toEqual([]);
        });
    });

    describe('Game Flow - Starting', () => {
        it('startGame transitions to dealing phase', () => {
            engine.startGame();
            expect(engine.getPhase()).toBe('dealing');
        });
    });

    describe('Card Dealing', () => {
        it('dealCard adds card to player', () => {
            engine.startGame();
            engine.dealCard(10, false, false);

            const state = engine.getState();
            expect(state.playerCards).toContain(10);
        });

        it('dealCard adds card to dealer', () => {
            engine.startGame();
            engine.dealCard(20, true, false);

            const state = engine.getState();
            expect(state.dealerCards).toContain(20);
        });

        it('dealCard tracks hidden dealer card', () => {
            engine.startGame();
            engine.dealCard(15, true, false);
            engine.dealCard(25, true, true);

            const state = engine.getState();
            expect(state.dealerHiddenCard).toBe(25);
        });
    });

    describe('Phase Transitions', () => {
        it('setPlayerTurn transitions from dealing', () => {
            engine.startGame();
            engine.setPlayerTurn();
            expect(engine.getPhase()).toBe('player_turn');
        });

        it('setDealerTurn transitions from player_turn', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.setDealerTurn();
            expect(engine.getPhase()).toBe('dealer_turn');
        });
    });

    describe('Game End', () => {
        it('endGame transitions to result phase', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('win');
            expect(engine.getPhase()).toBe('result');
        });

        it('endGame emits result event', () => {
            const resultSpy = vi.fn();
            engine.onGameEnd(resultSpy);

            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('blackjack');

            expect(resultSpy).toHaveBeenCalledWith('blackjack');
        });
    });

    describe('Hidden Card Reveal', () => {
        it('revealHiddenCard updates state', () => {
            engine.startGame();
            engine.dealCard(15, true, false);
            engine.dealCard(25, true, true);

            expect(engine.getState().isHiddenRevealed).toBe(false);

            engine.revealHiddenCard();

            expect(engine.getState().isHiddenRevealed).toBe(true);
        });
    });

    describe('Reset', () => {
        it('reset clears all state', () => {
            engine.startGame();
            engine.dealCard(10, false, false);
            engine.dealCard(20, true, true);
            engine.setPlayerTurn();

            engine.reset();

            const state = engine.getState();
            expect(state.phase).toBe('idle');
            expect(state.playerCards).toEqual([]);
            expect(state.dealerCards).toEqual([]);
        });

        it('reset kills all animations', () => {
            engine.startGame();
            engine.dealCard(10, false, false);

            // Should not throw
            engine.reset();
            expect(engine.getPhase()).toBe('idle');
        });
    });

    describe('State Subscriptions', () => {
        it('notifies on state changes', () => {
            const listener = vi.fn();
            engine.onStateChange(listener);

            engine.startGame();

            expect(listener).toHaveBeenCalled();
        });

        it('unsubscribes correctly', () => {
            const listener = vi.fn();
            const unsub = engine.onStateChange(listener);

            engine.startGame();
            unsub();
            engine.dealCard(10, false, false);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('Phase Event Callbacks', () => {
        it('onPhaseChange fires on transitions', () => {
            const phases: GamePhase[] = [];
            engine.onPhaseChange((phase: GamePhase) => phases.push(phase));

            engine.startGame();
            engine.setPlayerTurn();
            engine.setDealerTurn();

            expect(phases).toEqual(['dealing', 'player_turn', 'dealer_turn']);
        });
    });
});
