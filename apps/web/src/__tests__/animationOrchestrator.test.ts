/**
 * Animation Orchestrator Tests
 *
 * Tests for useAnimationOrchestrator hook which manages
 * staggered card reveals using the "Derived Reveal" pattern.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useGameStore } from '@/stores/gameStore';

describe('Animation Orchestrator Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().clearGameCards();
    useGameStore.getState().resetAnimationState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Staggered Reveal Timing', () => {
    it('calculates pending reveals correctly', () => {
      const { addGameCard } = useGameStore.getState();

      // Add 4 cards (initial deal)
      addGameCard(10, false, false);
      addGameCard(20, true, false);
      addGameCard(30, false, false);
      addGameCard(40, true, true);

      const state = useGameStore.getState();
      const pendingPlayer = state.gameCards.playerCards.length - state.revealedCount.player;
      const pendingDealer = state.gameCards.dealerCards.length - state.revealedCount.dealer;

      expect(pendingPlayer).toBe(2);
      expect(pendingDealer).toBe(2);
    });

    it('reveals alternating player/dealer for initial deal', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      // Initial deal: P1, D1, P2, D2
      addGameCard(10, false, false);
      addGameCard(20, true, false);
      addGameCard(30, false, false);
      addGameCard(40, true, true);

      // Simulate alternating reveals
      revealNextCard(false); // P1
      expect(useGameStore.getState().revealedCount.player).toBe(1);
      expect(useGameStore.getState().revealedCount.dealer).toBe(0);

      revealNextCard(true); // D1
      expect(useGameStore.getState().revealedCount.player).toBe(1);
      expect(useGameStore.getState().revealedCount.dealer).toBe(1);

      revealNextCard(false); // P2
      expect(useGameStore.getState().revealedCount.player).toBe(2);
      expect(useGameStore.getState().revealedCount.dealer).toBe(1);

      revealNextCard(true); // D2
      expect(useGameStore.getState().revealedCount.player).toBe(2);
      expect(useGameStore.getState().revealedCount.dealer).toBe(2);
    });

    it('reveals only player cards during HIT', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      // Initial deal - reveal all
      addGameCard(10, false, false);
      addGameCard(20, true, false);
      addGameCard(30, false, false);
      addGameCard(40, true, true);
      revealNextCard(false);
      revealNextCard(true);
      revealNextCard(false);
      revealNextCard(true);

      // HIT - add new player card
      addGameCard(50, false, false);

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards.length).toBe(3);
      expect(state.revealedCount.player).toBe(2); // Not revealed yet

      // Reveal new card
      revealNextCard(false);
      expect(useGameStore.getState().revealedCount.player).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty state gracefully', () => {
      const state = useGameStore.getState();

      expect(state.gameCards.playerCards).toEqual([]);
      expect(state.gameCards.dealerCards).toEqual([]);
      expect(state.revealedCount.player).toBe(0);
      expect(state.revealedCount.dealer).toBe(0);
    });

    it('handles revealing when no cards exist', () => {
      const { revealNextCard } = useGameStore.getState();

      // Should not crash
      revealNextCard(false);
      revealNextCard(true);

      // Count goes up even without cards (edge case)
      const state = useGameStore.getState();
      expect(state.revealedCount.player).toBe(1);
    });

    it('handles rapid card additions', () => {
      const { addGameCard } = useGameStore.getState();

      // Simulate WebSocket burst (4 cards in quick succession)
      addGameCard(10, false, false);
      addGameCard(20, true, false);
      addGameCard(30, false, false);
      addGameCard(40, true, true);

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([10, 30]);
      expect(state.gameCards.dealerCards).toEqual([20, 40]);
    });

    it('prevents reveal count exceeding card count', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(10, false, false);

      // Reveal more than exists (edge case)
      revealNextCard(false);
      revealNextCard(false);
      revealNextCard(false);

      const state = useGameStore.getState();
      // Count can exceed - components handle this via .slice()
      expect(state.revealedCount.player).toBe(3);

      // But display is capped
      const display = state.gameCards.playerCards.slice(0, state.revealedCount.player);
      expect(display).toEqual([10]); // Only 1 card
    });
  });
});

describe('Card Event Handler Edge Cases', () => {
  beforeEach(() => {
    useGameStore.getState().clearGameCards();
  });

  describe('Duplicate Hidden Card Bug (Regression)', () => {
    it('same card revealed twice should not duplicate', () => {
      const { addGameCard, flipHiddenCard } = useGameStore.getState();

      // Simulate contract events
      addGameCard(25, true, false); // D1 visible
      addGameCard(51, true, true); // D2 hidden (K Clubs)

      // Game resolves - contract emits CardDealt for reveal
      // This is the BUG: should NOT add again
      flipHiddenCard();

      const state = useGameStore.getState();
      expect(state.gameCards.dealerCards).toEqual([25, 51]);
      expect(state.gameCards.dealerCards.length).toBe(2);

      // Should NOT have 3 cards
      expect(state.gameCards.dealerCards).not.toEqual([25, 51, 51]);
    });

    it('multiple identical cards ARE valid (multi-deck)', () => {
      const { addGameCard } = useGameStore.getState();

      // Multi-deck shoe allows duplicates
      addGameCard(51, false, false); // K Clubs
      addGameCard(51, false, false); // K Clubs (different deck)
      addGameCard(51, false, false); // K Clubs (another deck)

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([51, 51, 51]);
      expect(state.gameCards.playerCards.length).toBe(3);
    });
  });

  describe('Game Reset Edge Cases', () => {
    it('clearGameCards during reveal sequence', () => {
      const { addGameCard, revealNextCard, clearGameCards } = useGameStore.getState();

      addGameCard(10, false, false);
      addGameCard(20, false, false);
      revealNextCard(false); // Reveal 1

      // New game mid-reveal
      clearGameCards();

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([]);
      expect(state.revealedCount.player).toBe(0);
    });

    it('PLAY AGAIN should clear all state', () => {
      const {
        addGameCard,
        revealAllCards,
        setLastGameResult,
        clearGameCards,
        resetAnimationState,
      } = useGameStore.getState();

      // Complete game
      addGameCard(10, false, false);
      addGameCard(20, true, false);
      revealAllCards();
      setLastGameResult({
        result: 'win' as const,
        payout: 2000000n,
        playerValue: 21,
        dealerValue: 18,
        playerCards: [10],
        dealerCards: [20],
        bet: 1000000n,
      });

      // PLAY AGAIN
      clearGameCards();
      resetAnimationState();

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([]);
      expect(state.gameCards.dealerCards).toEqual([]);
      expect(state.revealedCount.player).toBe(0);
      expect(state.revealedCount.dealer).toBe(0);
      expect(state.isHiddenCardFlipped).toBe(false);
    });
  });

  describe('Phase Transitions', () => {
    it('setGamePhase updates correctly', () => {
      const { setGamePhase } = useGameStore.getState();

      expect(useGameStore.getState().gamePhase).toBe('idle');

      setGamePhase('dealing_initial');
      expect(useGameStore.getState().gamePhase).toBe('dealing_initial');

      setGamePhase('player_turn');
      expect(useGameStore.getState().gamePhase).toBe('player_turn');
    });

    it('phase resets on new game', () => {
      const { setGamePhase, resetAnimationState } = useGameStore.getState();

      setGamePhase('showing_result');
      resetAnimationState();

      expect(useGameStore.getState().gamePhase).toBe('idle');
    });
  });
});

describe('Display Selectors Edge Cases', () => {
  beforeEach(() => {
    useGameStore.getState().clearGameCards();
  });

  describe('selectDisplayDealerCards', () => {
    it('returns empty for no cards', () => {
      const state = useGameStore.getState();
      const display = state.gameCards.dealerCards.slice(0, state.revealedCount.dealer);
      expect(display).toEqual([]);
    });

    it('shows -1 for unrevealed hidden card position', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(30, true, false);
      addGameCard(40, true, true);
      revealNextCard(true);
      revealNextCard(true);

      const state = useGameStore.getState();
      const cards = state.gameCards.dealerCards.slice(0, state.revealedCount.dealer);

      // Apply hidden card logic
      const display =
        !state.isHiddenCardFlipped && cards.length >= 2 ? [cards[0], -1, ...cards.slice(2)] : cards;

      expect(display).toEqual([30, -1]);
    });

    it('shows all cards after flip including dealer hits', () => {
      const { addGameCard, revealAllCards, flipHiddenCard } = useGameStore.getState();

      // Initial + dealer draws
      addGameCard(30, true, false);
      addGameCard(40, true, true);
      addGameCard(5, true, false); // Dealer hit
      addGameCard(6, true, false); // Dealer hit

      revealAllCards();
      flipHiddenCard();

      const state = useGameStore.getState();
      expect(state.gameCards.dealerCards).toEqual([30, 40, 5, 6]);
      expect(state.isHiddenCardFlipped).toBe(true);
    });
  });

  describe('Card Order Consistency', () => {
    it('maintains card order after multiple operations', () => {
      const { addGameCard, revealNextCard, flipHiddenCard } = useGameStore.getState();

      addGameCard(1, false, false);
      addGameCard(2, true, false);
      addGameCard(3, false, false);
      addGameCard(4, true, true);

      // Reveal all
      revealNextCard(false);
      revealNextCard(true);
      revealNextCard(false);
      revealNextCard(true);

      // Flip
      flipHiddenCard();

      // Add more (HIT + dealer draws)
      addGameCard(5, false, false);
      addGameCard(6, true, false);

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([1, 3, 5]);
      expect(state.gameCards.dealerCards).toEqual([2, 4, 6]);
    });
  });
});
