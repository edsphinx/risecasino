/**
 * Game Store (Zustand)
 *
 * Global state for game-related data that must persist across component remounts.
 * This fixes the overlay disappearing bug where lastGameResult was lost on re-render.
 *
 * ⚡ ARCHITECTURE:
 * - Single source of truth for game result state
 * - Persists across component unmount/remount cycles
 * - Separates state from UI components
 */

import { create } from 'zustand';
import type { GameResult } from '@vyrejack/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface HandSnapshot {
  result: GameResult;
  payout: bigint;
  playerValue: number;
  dealerValue: number;
  playerCards: number[];
  dealerCards: number[];
  bet: bigint;
}

export interface CardAccumulator {
  playerCards: number[];
  dealerCards: number[];
  dealerHiddenCard: number | null;
}

interface GameState {
  // Last game result - persists after game ends for overlay display
  lastGameResult: HandSnapshot | null;

  // Accumulated cards from WebSocket CardDealt events
  accumulatedCards: CardAccumulator;

  // Card snapshot taken just before an action
  cardSnapshot: CardAccumulator | null;

  // Whether game result overlay should be visible
  showingResult: boolean;

  // V8: Last randomness source used (for debug/transparency)
  lastRandomnessSource: { isVRF: boolean; source: string } | null;
}

interface GameActions {
  // Set the game result (called when GamePlayed event received)
  setLastGameResult: (result: HandSnapshot | null) => void;

  // Clear result and reset for new game
  clearLastResult: () => void;

  // Update accumulated cards from CardDealt events
  addCard: (card: number, isDealer: boolean, faceUp: boolean) => void;

  // Clear accumulated cards for new game
  resetCards: () => void;

  // Take snapshot of current cards before action
  snapshotCards: () => void;

  // Clear snapshot
  clearSnapshot: () => void;

  // V8: Set randomness source
  setRandomnessSource: (source: { isVRF: boolean; source: string } | null) => void;
}

type GameStore = GameState & GameActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: GameState = {
  lastGameResult: null,
  accumulatedCards: {
    playerCards: [],
    dealerCards: [],
    dealerHiddenCard: null,
  },
  cardSnapshot: null,
  showingResult: false,
  lastRandomnessSource: null,
};

// =============================================================================
// STORE
// =============================================================================

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setLastGameResult: (result) =>
    set({
      lastGameResult: result,
      showingResult: result !== null,
    }),

  clearLastResult: () =>
    set({
      lastGameResult: null,
      showingResult: false,
      accumulatedCards: initialState.accumulatedCards,
      cardSnapshot: null,
    }),

  addCard: (card, isDealer, faceUp) =>
    set((state) => {
      const newAccumulated = { ...state.accumulatedCards };

      if (isDealer) {
        if (!faceUp && newAccumulated.dealerHiddenCard === null) {
          // Hidden card (face down)
          newAccumulated.dealerHiddenCard = card;
        }
        // Always add to dealer cards array
        if (!newAccumulated.dealerCards.includes(card)) {
          newAccumulated.dealerCards = [...newAccumulated.dealerCards, card];
        }
      } else {
        // Player card
        if (!newAccumulated.playerCards.includes(card)) {
          newAccumulated.playerCards = [...newAccumulated.playerCards, card];
        }
      }

      return { accumulatedCards: newAccumulated };
    }),

  resetCards: () =>
    set({
      accumulatedCards: initialState.accumulatedCards,
      cardSnapshot: null,
    }),

  snapshotCards: () =>
    set((state) => ({
      cardSnapshot: { ...state.accumulatedCards },
    })),

  clearSnapshot: () => set({ cardSnapshot: null }),

  // V8: Set randomness source for debug/transparency
  setRandomnessSource: (source) => set({ lastRandomnessSource: source }),
}));

// =============================================================================
// SELECTORS (for optimized subscriptions)
// =============================================================================

export const selectLastGameResult = (state: GameStore) => state.lastGameResult;
export const selectShowingResult = (state: GameStore) => state.showingResult;
export const selectAccumulatedCards = (state: GameStore) => state.accumulatedCards;
export const selectRandomnessSource = (state: GameStore) => state.lastRandomnessSource;
