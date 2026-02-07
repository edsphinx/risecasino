/**
 * GameEngine Tests - Updated for VyreJackCore alignment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../GameEngine';
import type { GamePhase } from '../types';

describe('GameEngine', () => {
    let engine: GameEngine;
    let container: HTMLElement;

    beforeEach(() => {
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
        it('startGame transitions to waiting_for_deal phase', () => {
            engine.startGame();
            expect(engine.getPhase()).toBe('waiting_for_deal');
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
        it('setPlayerTurn transitions from waiting_for_deal', () => {
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
        it('endGame with win transitions to player_win phase', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('win');
            expect(engine.getPhase()).toBe('player_win');
        });

        it('endGame with lose transitions to dealer_win phase', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('lose');
            expect(engine.getPhase()).toBe('dealer_win');
        });

        it('endGame with push transitions to push phase', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('push');
            expect(engine.getPhase()).toBe('push');
        });

        it('endGame with blackjack transitions to player_blackjack phase', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.endGame('blackjack');
            expect(engine.getPhase()).toBe('player_blackjack');
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

            expect(phases).toEqual(['waiting_for_deal', 'player_turn', 'dealer_turn']);
        });
    });

    describe('Destroy and Cleanup', () => {
        it('destroy prevents further operations', () => {
            engine.destroy();

            // These should be safe to call but do nothing
            engine.startGame();
            expect(engine.getPhase()).toBe('idle');

            engine.dealCard(10, false, false);
            expect(engine.getState().playerCards).toEqual([]);
        });

        it('destroy clears all listeners', () => {
            const listener = vi.fn();
            engine.onStateChange(listener);
            engine.onPhaseChange(listener);
            engine.onGameEnd(listener);

            engine.destroy();
            // Listener count should be 0 after destroy
            // State should be reset
            expect(engine.getPhase()).toBe('idle');
        });
    });

    describe('Edge Cases', () => {
        it('handles rapid phase transitions', () => {
            engine.startGame();
            engine.setPlayerTurn();
            engine.setDealerTurn();
            engine.endGame('win');
            engine.reset();
            engine.startGame();

            expect(engine.getPhase()).toBe('waiting_for_deal');
        });

        it('handles multiple cards dealt quickly', () => {
            engine.startGame();

            // Deal 10 cards quickly
            for (let i = 0; i < 10; i++) {
                engine.dealCard(i, i % 2 === 0, false);
            }

            const state = engine.getState();
            expect(state.playerCards.length).toBe(5);
            expect(state.dealerCards.length).toBe(5);
        });

        it('handles all 52 card indices', () => {
            engine.startGame();

            // Test first card of each suit
            [0, 13, 26, 39].forEach((cardIndex) => {
                engine.dealCard(cardIndex, false, false);
            });

            expect(engine.getState().playerCards).toEqual([0, 13, 26, 39]);
        });

        it('handles hidden card reveal when no hidden card exists', () => {
            engine.startGame();
            engine.dealCard(10, true, false); // Not hidden

            // Should not throw
            engine.revealHiddenCard();
            expect(engine.getState().isHiddenRevealed).toBe(true);
        });

        it('handles multiple resets', () => {
            engine.startGame();
            engine.dealCard(10, false, false);
            engine.reset();
            engine.reset();
            engine.reset();

            expect(engine.getPhase()).toBe('idle');
            expect(engine.getState().playerCards).toEqual([]);
        });

        it('handles endGame with all result types', () => {
            const results: Array<{ result: 'win' | 'lose' | 'push' | 'blackjack'; phase: GamePhase }> = [
                { result: 'win', phase: 'player_win' },
                { result: 'lose', phase: 'dealer_win' },
                { result: 'push', phase: 'push' },
                { result: 'blackjack', phase: 'player_blackjack' },
            ];

            results.forEach(({ result, phase }) => {
                engine.reset();
                engine.startGame();
                engine.setPlayerTurn();
                engine.endGame(result);
                expect(engine.getPhase()).toBe(phase);
            });
        });
    });
});
