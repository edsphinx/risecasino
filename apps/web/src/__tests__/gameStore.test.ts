/**
 * Game Store Tests
 *
 * Tests for the card state management in gameStore.
 * These tests validate the SSOT (Single Source of Truth) architecture.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/stores/gameStore';

describe('gameStore - Card State Management', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useGameStore.getState().clearGameCards();
    useGameStore.getState().resetAnimationState();
  });

  describe('addGameCard', () => {
    it('adds player card to SSOT', () => {
      const { addGameCard } = useGameStore.getState();

      addGameCard(10, false, false); // 10 = Jack of Spades, not dealer, not hidden

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([10]);
      expect(state.gameCards.dealerCards).toEqual([]);
    });

    it('adds dealer card to SSOT', () => {
      const { addGameCard } = useGameStore.getState();

      addGameCard(51, true, false); // King of Clubs, dealer, not hidden

      const state = useGameStore.getState();
      expect(state.gameCards.dealerCards).toEqual([51]);
      expect(state.gameCards.playerCards).toEqual([]);
    });

    it('tracks hidden dealer card correctly', () => {
      const { addGameCard } = useGameStore.getState();

      addGameCard(20, true, false); // First dealer card - visible
      addGameCard(51, true, true); // Second dealer card - hidden

      const state = useGameStore.getState();
      expect(state.gameCards.dealerCards).toEqual([20, 51]);
      expect(state.gameCards.dealerHiddenCard).toBe(51);
    });

    it('does NOT duplicate hidden card on reveal (critical bug fix)', () => {
      const { addGameCard, flipHiddenCard } = useGameStore.getState();

      // Initial deal
      addGameCard(25, true, false); // First dealer card
      addGameCard(51, true, true); // Hidden card (K Clubs)

      expect(useGameStore.getState().gameCards.dealerCards).toHaveLength(2);

      // Flip hidden card (should NOT add a new card)
      flipHiddenCard();

      // Verify still only 2 cards
      const state = useGameStore.getState();
      expect(state.gameCards.dealerCards).toHaveLength(2);
      expect(state.gameCards.dealerCards).toEqual([25, 51]);
      expect(state.isHiddenCardFlipped).toBe(true);
    });
  });

  describe('revealNextCard', () => {
    it('increments player reveal count', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(10, false, false);
      addGameCard(20, false, false);

      expect(useGameStore.getState().revealedCount.player).toBe(0);

      revealNextCard(false); // Reveal player card
      expect(useGameStore.getState().revealedCount.player).toBe(1);

      revealNextCard(false); // Reveal another
      expect(useGameStore.getState().revealedCount.player).toBe(2);
    });

    it('increments dealer reveal count', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(30, true, false);
      addGameCard(40, true, true);

      revealNextCard(true); // Reveal dealer card
      expect(useGameStore.getState().revealedCount.dealer).toBe(1);
    });
  });

  describe('selectDisplayPlayerCards (derived state)', () => {
    it('returns empty array when no cards revealed', () => {
      const { addGameCard } = useGameStore.getState();

      addGameCard(10, false, false);
      addGameCard(20, false, false);

      // Cards exist but revealed count is 0
      const state = useGameStore.getState();
      const display = state.gameCards.playerCards.slice(0, state.revealedCount.player);
      expect(display).toEqual([]);
    });

    it('returns only revealed cards', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(10, false, false);
      addGameCard(20, false, false);
      addGameCard(30, false, false);

      revealNextCard(false); // Reveal 1
      revealNextCard(false); // Reveal 2

      const state = useGameStore.getState();
      const display = state.gameCards.playerCards.slice(0, state.revealedCount.player);
      expect(display).toEqual([10, 20]); // Only first 2
    });
  });

  describe('selectDisplayDealerCards (with hidden card logic)', () => {
    it('shows -1 for hidden card when not flipped', () => {
      const { addGameCard, revealNextCard } = useGameStore.getState();

      addGameCard(25, true, false); // Visible
      addGameCard(51, true, true); // Hidden

      revealNextCard(true); // Reveal 1st
      revealNextCard(true); // Reveal 2nd (still hidden)

      const state = useGameStore.getState();
      const cards = state.gameCards.dealerCards.slice(0, state.revealedCount.dealer);

      // Apply hidden card logic
      const display =
        cards.length >= 2 && !state.isHiddenCardFlipped ? [cards[0], -1, ...cards.slice(2)] : cards;

      expect(display).toEqual([25, -1]);
    });

    it('shows actual card after flip', () => {
      const { addGameCard, revealNextCard, flipHiddenCard } = useGameStore.getState();

      addGameCard(25, true, false);
      addGameCard(51, true, true);

      revealNextCard(true);
      revealNextCard(true);
      flipHiddenCard();

      const state = useGameStore.getState();
      const cards = state.gameCards.dealerCards.slice(0, state.revealedCount.dealer);
      const display = state.isHiddenCardFlipped ? cards : [cards[0], -1, ...cards.slice(2)];

      expect(display).toEqual([25, 51]);
    });
  });

  describe('clearGameCards', () => {
    it('resets all card state for new game', () => {
      const { addGameCard, revealNextCard, flipHiddenCard, clearGameCards } =
        useGameStore.getState();

      // Setup some state
      addGameCard(10, false, false);
      addGameCard(20, true, true);
      revealNextCard(false);
      revealNextCard(true);
      flipHiddenCard();

      // Clear
      clearGameCards();

      const state = useGameStore.getState();
      expect(state.gameCards.playerCards).toEqual([]);
      expect(state.gameCards.dealerCards).toEqual([]);
      expect(state.gameCards.dealerHiddenCard).toBeNull();
      expect(state.revealedCount.player).toBe(0);
      expect(state.revealedCount.dealer).toBe(0);
      expect(state.isHiddenCardFlipped).toBe(false);
    });
  });

  describe('revealAllCards', () => {
    it('instantly reveals all cards (for result display)', () => {
      const { addGameCard, revealAllCards } = useGameStore.getState();

      addGameCard(10, false, false);
      addGameCard(20, false, false);
      addGameCard(30, true, false);
      addGameCard(40, true, true);

      revealAllCards();

      const state = useGameStore.getState();
      expect(state.revealedCount.player).toBe(2);
      expect(state.revealedCount.dealer).toBe(2);
      expect(state.isHiddenCardFlipped).toBe(true);
    });
  });
});

describe('gameStore - Hand Value Calculation', () => {
  // Helper to calculate hand value (same logic as in components)
  const calculateValue = (cards: number[]): number => {
    let value = 0;
    let aces = 0;

    for (const card of cards) {
      const rank = card % 13;
      if (rank === 0) {
        aces++;
        value += 11;
      } else if (rank >= 10) {
        value += 10;
      } else {
        value += rank + 1;
      }
    }

    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  };

  it('calculates correct value for number cards', () => {
    expect(calculateValue([1, 2, 3])).toBe(9); // 2 + 3 + 4 = 9
  });

  it('calculates face cards as 10', () => {
    expect(calculateValue([10, 11, 12])).toBe(30); // J + Q + K = 30
  });

  it('calculates Ace as 11 when safe', () => {
    expect(calculateValue([0, 9])).toBe(21); // A + 10 = 21 (Blackjack)
  });

  it('calculates Ace as 1 when would bust', () => {
    expect(calculateValue([0, 10, 11])).toBe(21); // A + J + Q = 21 (A becomes 1)
  });

  it('handles multiple Aces correctly', () => {
    expect(calculateValue([0, 0, 9])).toBe(12); // A + A + 10 = 12 (both aces = 1)
    expect(calculateValue([0, 0])).toBe(12); // A + A = 12 (one = 11, one = 1)
  });
});
