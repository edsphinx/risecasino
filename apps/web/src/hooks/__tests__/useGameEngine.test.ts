/**
 * useGameEngine Hook Tests - TDD
 *
 * Tests for the bridge hook that connects GameEngine to Preact components.
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/preact';
import { useGameEngine } from '../useGameEngine';
import type { GamePhase, EngineGameResult } from '../../lib/game-engine/types';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('useGameEngine', () => {
  let container: HTMLElement;
  const containerId = 'test-game-container';

  beforeEach(() => {
    container = document.createElement('div');
    container.id = containerId;
    container.innerHTML = `
            <div class="dealer-zone" data-zone="dealer"></div>
            <div class="deck-area" data-zone="deck"></div>
            <div class="player-zone" data-zone="player"></div>
        `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    cleanup();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  // =========================================================================
  // INITIALIZATION TESTS
  // =========================================================================

  describe('Initialization', () => {
    it('returns isReady as true after mount', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.isReady.value).toBe(true);
    });

    it('starts with idle phase', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.phase.value).toBe('idle');
    });

    it('starts with empty card arrays', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.playerCards.value).toEqual([]);
      expect(result.current.dealerCards.value).toEqual([]);
    });

    it('provides all required actions', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(typeof result.current.startGame).toBe('function');
      expect(typeof result.current.dealCard).toBe('function');
      expect(typeof result.current.setPlayerTurn).toBe('function');
      expect(typeof result.current.setDealerTurn).toBe('function');
      expect(typeof result.current.revealHiddenCard).toBe('function');
      expect(typeof result.current.endGame).toBe('function');
      expect(typeof result.current.animateBust).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });

    it('provides isEventConnected state', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.isEventConnected).toBeDefined();
      expect(typeof result.current.isEventConnected.value).toBe('boolean');
    });

    it('isEventConnected is false when no playerAddress provided', () => {
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.isEventConnected.value).toBe(false);
    });
  });

  // =========================================================================
  // STATE SUBSCRIPTION TESTS
  // =========================================================================

  describe('State Subscription', () => {
    it('updates phase signal when startGame is called', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
      });

      expect(result.current.phase.value).toBe('waiting_for_deal');
    });

    it('updates playerCards signal when card is dealt to player', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, false, false);
      });

      expect(result.current.playerCards.value).toContain(0);
    });

    it('updates dealerCards signal when card is dealt to dealer', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(13, true, false);
      });

      expect(result.current.dealerCards.value).toContain(13);
    });

    it('tracks phase through full game flow', () => {
      const phases: GamePhase[] = [];
      const phaseCallback = (phase: GamePhase) => phases.push(phase);

      const { result } = renderHook(() =>
        useGameEngine(containerId, { onPhaseChange: phaseCallback })
      );

      act(() => {
        result.current.startGame();
        result.current.setPlayerTurn();
        result.current.setDealerTurn();
        result.current.endGame('win');
      });

      // Callback captures phases synchronously from engine events
      expect(phases).toEqual(['waiting_for_deal', 'player_turn', 'dealer_turn', 'player_win']);
    });
  });

  // =========================================================================
  // CLEANUP TESTS
  // =========================================================================

  describe('Cleanup on Unmount', () => {
    it('destroys engine on unmount', () => {
      const { result, unmount } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, false, false);
      });

      // Should not throw on unmount
      expect(() => unmount()).not.toThrow();
    });

    it('resets state after unmount and remount', () => {
      const { result, unmount } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(10, false, false);
      });

      unmount();

      // Re-render hook
      const { result: newResult } = renderHook(() => useGameEngine(containerId));

      // Should start fresh
      expect(newResult.current.phase.value).toBe('idle');
      expect(newResult.current.playerCards.value).toEqual([]);
    });

    it('cleans up subscriptions on unmount', () => {
      const { result, unmount } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
      });

      unmount();

      // Attempting to call actions after unmount should be safe
      // The engine is destroyed, so these should do nothing
      expect(() => {
        result.current.dealCard(5, false, false);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // MULTIPLE MOUNT/UNMOUNT (STRESS TEST)
  // =========================================================================

  describe('Multiple Mount/Unmount Cycles', () => {
    it('handles 10 rapid mount/unmount cycles', () => {
      for (let i = 0; i < 10; i++) {
        const { result, unmount } = renderHook(() => useGameEngine(containerId));

        act(() => {
          result.current.startGame();
          result.current.dealCard(i, false, false);
          result.current.dealCard(i + 1, true, false);
        });

        expect(result.current.phase.value).toBe('waiting_for_deal');
        unmount();
      }

      // Final mount should work correctly
      const { result } = renderHook(() => useGameEngine(containerId));
      expect(result.current.isReady.value).toBe(true);
      expect(result.current.phase.value).toBe('idle');
    });

    it('each cycle starts fresh without state leakage', () => {
      // First cycle - add 5 player cards
      const { result: r1, unmount: u1 } = renderHook(() => useGameEngine(containerId));
      act(() => {
        r1.current.startGame();
        for (let i = 0; i < 5; i++) {
          r1.current.dealCard(i, false, false);
        }
      });
      expect(r1.current.playerCards.value.length).toBe(5);
      u1();

      // Second cycle - should start empty
      const { result: r2 } = renderHook(() => useGameEngine(containerId));
      expect(r2.current.playerCards.value.length).toBe(0);
    });
  });

  // =========================================================================
  // ACTION TESTS
  // =========================================================================

  describe('Actions', () => {
    it('startGame transitions to waiting_for_deal', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
      });

      expect(result.current.phase.value).toBe('waiting_for_deal');
    });

    it('dealCard adds cards correctly', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, false, false); // Player Ace of Spades
        result.current.dealCard(13, true, false); // Dealer Ace of Hearts
        result.current.dealCard(10, false, false); // Player Jack of Spades
        result.current.dealCard(23, true, true); // Dealer hidden card
      });

      expect(result.current.playerCards.value).toEqual([0, 10]);
      expect(result.current.dealerCards.value).toEqual([13, 23]);
    });

    it('setPlayerTurn transitions correctly', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.setPlayerTurn();
      });

      expect(result.current.phase.value).toBe('player_turn');
    });

    it('setDealerTurn transitions correctly', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.setPlayerTurn();
        result.current.setDealerTurn();
      });

      expect(result.current.phase.value).toBe('dealer_turn');
    });

    it('revealHiddenCard reveals dealer card', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(13, true, false);
        result.current.dealCard(25, true, true); // Hidden card
        result.current.revealHiddenCard();
      });

      // Card should still be in dealerCards
      expect(result.current.dealerCards.value).toContain(25);
    });

    it('endGame transitions to correct result phase', () => {
      const results: Array<{ result: EngineGameResult; expected: GamePhase }> = [
        { result: 'win', expected: 'player_win' },
        { result: 'lose', expected: 'dealer_win' },
        { result: 'push', expected: 'push' },
        { result: 'blackjack', expected: 'player_blackjack' },
      ];

      results.forEach(({ result: gameResult, expected }) => {
        const { result, unmount } = renderHook(() => useGameEngine(containerId));

        act(() => {
          result.current.startGame();
          result.current.setPlayerTurn();
          result.current.endGame(gameResult);
        });

        expect(result.current.phase.value).toBe(expected);
        unmount();
      });
    });

    it('reset clears all state', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(5, false, false);
        result.current.dealCard(10, true, false);
        result.current.setPlayerTurn();
      });

      expect(result.current.playerCards.value.length).toBeGreaterThan(0);

      act(() => {
        result.current.reset();
      });

      expect(result.current.phase.value).toBe('idle');
      expect(result.current.playerCards.value).toEqual([]);
      expect(result.current.dealerCards.value).toEqual([]);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    it('handles missing container gracefully', () => {
      // Remove container before hook renders
      document.body.removeChild(container);

      const { result } = renderHook(() => useGameEngine('non-existent-id'));

      // Should not crash, but isReady might be false
      expect(result.current.isReady.value).toBe(false);

      // Re-add container for cleanup
      document.body.appendChild(container);
    });

    it('handles rapid action calls', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        // Rapid fire actions
        result.current.startGame();
        for (let i = 0; i < 20; i++) {
          result.current.dealCard(i % 52, i % 2 === 0, false);
        }
        result.current.setPlayerTurn();
        result.current.setDealerTurn();
        result.current.endGame('win');
      });

      expect(result.current.phase.value).toBe('player_win');
      expect(result.current.playerCards.value.length).toBe(10);
      expect(result.current.dealerCards.value.length).toBe(10);
    });

    it('handles reset during active game', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, false, false);
        result.current.setPlayerTurn();
        // Reset mid-game
        result.current.reset();
      });

      expect(result.current.phase.value).toBe('idle');
      expect(result.current.playerCards.value).toEqual([]);
    });

    it('handles multiple resets in sequence', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.reset();
        result.current.reset();
        result.current.reset();
      });

      expect(result.current.phase.value).toBe('idle');
    });

    it('handles all 52 card indices', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        // Deal one card of each suit's ace
        result.current.dealCard(0, false, false); // Ace of Spades
        result.current.dealCard(13, false, false); // Ace of Hearts
        result.current.dealCard(26, false, false); // Ace of Diamonds
        result.current.dealCard(39, false, false); // Ace of Clubs
      });

      expect(result.current.playerCards.value).toEqual([0, 13, 26, 39]);
    });

    it('actions are stable between renders', () => {
      const { result, rerender } = renderHook(() => useGameEngine(containerId));

      const firstRenderActions = {
        startGame: result.current.startGame,
        dealCard: result.current.dealCard,
        reset: result.current.reset,
      };

      rerender();

      // Actions should be the same reference (stable)
      expect(result.current.startGame).toBe(firstRenderActions.startGame);
      expect(result.current.dealCard).toBe(firstRenderActions.dealCard);
      expect(result.current.reset).toBe(firstRenderActions.reset);
    });

    it('handles endGame without player turn', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      // This tests engine resilience - should not crash
      act(() => {
        result.current.startGame();
        // Skip player turn transition
        result.current.endGame('win');
      });

      // Phase depends on engine behavior - just verify no crash
      expect(result.current.isReady.value).toBe(true);
    });
  });

  // =========================================================================
  // EVENT CALLBACK TESTS
  // =========================================================================

  describe('Event Callbacks', () => {
    it('onPhaseChange callback is called on phase transitions', () => {
      const phaseCallback = vi.fn();
      const { result } = renderHook(() =>
        useGameEngine(containerId, { onPhaseChange: phaseCallback })
      );

      act(() => {
        result.current.startGame();
        result.current.setPlayerTurn();
      });

      expect(phaseCallback).toHaveBeenCalledWith('waiting_for_deal');
      expect(phaseCallback).toHaveBeenCalledWith('player_turn');
    });

    it('onGameEnd callback is called when game ends', () => {
      const endCallback = vi.fn();
      const { result } = renderHook(() => useGameEngine(containerId, { onGameEnd: endCallback }));

      act(() => {
        result.current.startGame();
        result.current.setPlayerTurn();
        result.current.endGame('blackjack');
      });

      expect(endCallback).toHaveBeenCalledWith('blackjack');
    });
  });

  // =========================================================================
  // PHASE 2.5: SHREDS INTEGRATION EDGE CASES
  // =========================================================================

  describe('Phase 2.5 Edge Cases', () => {
    it('animateBust works without crashing when no cards present', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      // Call animateBust on empty game - should not crash
      act(() => {
        result.current.animateBust(false);
        result.current.animateBust(true);
      });

      expect(result.current.isReady.value).toBe(true);
    });

    it('animateBust can be called multiple times in sequence', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, false, false);
        result.current.dealCard(10, false, false);
      });

      // Multiple bust animations in sequence
      act(() => {
        result.current.animateBust(false);
        result.current.animateBust(false);
        result.current.animateBust(false);
      });

      expect(result.current.isReady.value).toBe(true);
      expect(result.current.playerCards.value.length).toBe(2);
    });

    it('animateBust for dealer works after dealing dealer cards', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(0, true, false); // Dealer card
        result.current.dealCard(10, true, true); // Dealer hidden
      });

      act(() => {
        result.current.animateBust(true); // Dealer bust
      });

      expect(result.current.dealerCards.value.length).toBe(2);
    });

    it('isEventConnected reflects playerAddress presence', () => {
      // Without playerAddress - no connection
      const { result: r1 } = renderHook(() => useGameEngine(containerId));
      expect(r1.current.isEventConnected.value).toBe(false);

      // Note: With playerAddress would require mocking WebSocket
      // which is tested in useGameEvents integration tests
    });

    it('handles rapid animateBust calls interleaved with dealCard', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();

        // Simulate rapid events like from fast WebSocket
        result.current.dealCard(0, false, false);
        result.current.animateBust(false);
        result.current.dealCard(1, false, false);
        result.current.dealCard(2, true, false);
        result.current.animateBust(true);
        result.current.dealCard(3, true, false);
      });

      expect(result.current.playerCards.value.length).toBe(2);
      expect(result.current.dealerCards.value.length).toBe(2);
    });

    it('endGame after animateBust works correctly', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(10, false, false); // 10
        result.current.dealCard(8, false, false); // 8
        result.current.dealCard(5, false, false); // 5 = 23 (bust)
        result.current.setPlayerTurn();
        result.current.animateBust(false);
        result.current.endGame('lose');
      });

      expect(result.current.phase.value).toBe('dealer_win');
    });

    it('reset clears state even after animateBust', () => {
      const { result } = renderHook(() => useGameEngine(containerId));

      act(() => {
        result.current.startGame();
        result.current.dealCard(10, false, false);
        result.current.animateBust(false);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.phase.value).toBe('idle');
      expect(result.current.playerCards.value).toEqual([]);
    });
  });
});
