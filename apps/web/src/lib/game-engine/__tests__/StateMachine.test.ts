/**
 * StateMachine Tests - Updated for VyreJackCore alignment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from '../StateMachine';
import type { GamePhase } from '../types';

describe('StateMachine', () => {
    let sm: StateMachine;

    beforeEach(() => {
        sm = new StateMachine();
    });

    describe('Initial State', () => {
        it('starts in idle phase', () => {
            expect(sm.getPhase()).toBe('idle');
        });

        it('has empty player cards', () => {
            expect(sm.getState().playerCards).toEqual([]);
        });

        it('has empty dealer cards', () => {
            expect(sm.getState().dealerCards).toEqual([]);
        });

        it('has no hidden card', () => {
            expect(sm.getState().dealerHiddenCard).toBeNull();
        });

        it('hidden is not revealed', () => {
            expect(sm.getState().isHiddenRevealed).toBe(false);
        });
    });

    describe('Adding Cards', () => {
        it('adds player card correctly', () => {
            sm.addCard(10, false, false);
            expect(sm.getState().playerCards).toEqual([10]);
        });

        it('adds multiple player cards in order', () => {
            sm.addCard(10, false, false);
            sm.addCard(20, false, false);
            sm.addCard(30, false, false);
            expect(sm.getState().playerCards).toEqual([10, 20, 30]);
        });

        it('adds dealer card correctly', () => {
            sm.addCard(15, true, false);
            expect(sm.getState().dealerCards).toEqual([15]);
        });

        it('tracks hidden dealer card', () => {
            sm.addCard(15, true, false);
            sm.addCard(25, true, true);
            expect(sm.getState().dealerCards).toEqual([15, 25]);
            expect(sm.getState().dealerHiddenCard).toBe(25);
        });

        it('only one hidden card at a time', () => {
            sm.addCard(15, true, true);
            sm.addCard(25, true, true);
            expect(sm.getState().dealerHiddenCard).toBe(25);
        });
    });

    describe('Revealing Hidden Card', () => {
        it('reveals hidden card', () => {
            sm.addCard(15, true, false);
            sm.addCard(25, true, true);
            expect(sm.getState().isHiddenRevealed).toBe(false);

            sm.revealHiddenCard();
            expect(sm.getState().isHiddenRevealed).toBe(true);
        });

        it('does nothing if no hidden card', () => {
            sm.addCard(15, true, false);
            sm.revealHiddenCard();
            expect(sm.getState().isHiddenRevealed).toBe(true);
        });
    });

    describe('Phase Transitions - VyreJackCore aligned', () => {
        it('transitions idle → waiting_for_deal', () => {
            expect(sm.canTransitionTo('waiting_for_deal')).toBe(true);
            sm.setPhase('waiting_for_deal');
            expect(sm.getPhase()).toBe('waiting_for_deal');
        });

        it('blocks invalid transition idle → player_turn', () => {
            expect(sm.canTransitionTo('player_turn')).toBe(false);
        });

        it('blocks invalid transition idle → push', () => {
            expect(sm.canTransitionTo('push')).toBe(false);
        });

        it('transitions waiting_for_deal → player_turn', () => {
            sm.setPhase('waiting_for_deal');
            expect(sm.canTransitionTo('player_turn')).toBe(true);
            sm.setPhase('player_turn');
            expect(sm.getPhase()).toBe('player_turn');
        });

        it('transitions player_turn → dealer_turn', () => {
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');
            sm.setPhase('dealer_turn');
            expect(sm.getPhase()).toBe('dealer_turn');
        });

        it('transitions player_turn → waiting_for_hit', () => {
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');
            expect(sm.canTransitionTo('waiting_for_hit')).toBe(true);
        });

        it('transitions player_turn → waiting_for_double', () => {
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');
            expect(sm.canTransitionTo('waiting_for_double')).toBe(true);
        });

        it('transitions dealer_turn → player_win', () => {
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');
            sm.setPhase('dealer_turn');
            sm.setPhase('player_win');
            expect(sm.getPhase()).toBe('player_win');
        });

        it('player_win → idle (new game)', () => {
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');
            sm.setPhase('dealer_turn');
            sm.setPhase('player_win');
            sm.setPhase('idle');
            expect(sm.getPhase()).toBe('idle');
        });
    });

    describe('Subscriptions', () => {
        it('notifies listener on card add', () => {
            const calls: number[] = [];
            sm.subscribe((state) => calls.push(state.playerCards.length));

            sm.addCard(10, false, false);
            sm.addCard(20, false, false);

            expect(calls).toEqual([1, 2]);
        });

        it('notifies listener on phase change', () => {
            const phases: GamePhase[] = [];
            sm.subscribe((state) => phases.push(state.phase));

            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');

            expect(phases).toEqual(['waiting_for_deal', 'player_turn']);
        });

        it('unsubscribes correctly', () => {
            const calls: number[] = [];
            const unsub = sm.subscribe(() => calls.push(1));

            sm.addCard(10, false, false);
            unsub();
            sm.addCard(20, false, false);

            expect(calls).toHaveLength(1);
        });
    });

    describe('Reset', () => {
        it('resets all state', () => {
            sm.addCard(10, false, false);
            sm.addCard(20, true, true);
            sm.setPhase('waiting_for_deal');
            sm.setPhase('player_turn');

            sm.reset();

            const state = sm.getState();
            expect(state.phase).toBe('idle');
            expect(state.playerCards).toEqual([]);
            expect(state.dealerCards).toEqual([]);
            expect(state.dealerHiddenCard).toBeNull();
            expect(state.isHiddenRevealed).toBe(false);
        });

        it('notifies listeners on reset', () => {
            let resetCalled = false;
            sm.subscribe((state) => {
                if (state.phase === 'idle' && state.playerCards.length === 0) {
                    resetCalled = true;
                }
            });

            sm.addCard(10, false, false);
            sm.reset();

            expect(resetCalled).toBe(true);
        });
    });
});
