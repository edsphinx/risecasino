/**
 * Game Store (Zustand)
 *
 * Global state for game-related data that must persist across component remounts.
 *
 * ARCHITECTURE:
 * - SSOT (Single Source of Truth) for all game cards
 * - gameCards stores ALL cards immediately when events arrive
 * - revealedCount controls WHEN cards become visible (animation progress)
 * - Components derive display via: cards.slice(0, revealedCount)
 * - gamePhase tracks the current phase of the game flow
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

export type GamePhase =
  | 'idle' // No active game
  | 'betting' // Player selected bet, waiting to confirm
  | 'waiting_vrf' // VRF in progress, show riffle shuffle
  | 'dealing_initial' // Animating initial 4 cards
  | 'player_turn' // Player actions (hit/stand/double)
  | 'dealer_reveal' // Revealing dealer hidden card
  | 'dealer_hitting' // Animating dealer additional cards
  | 'showing_result'; // Result overlay visible

interface GameState {
  // Last game result - persists after game ends for overlay display
  lastGameResult: HandSnapshot | null;

  // Whether game result overlay should be visible
  showingResult: boolean;

  // V8: Last randomness source used (for debug/transparency)
  lastRandomnessSource: { isVRF: boolean; source: string } | null;

  // Game phase tracking
  gamePhase: GamePhase;

  // SSOT: Single Source of Truth for game cards
  gameCards: {
    playerCards: number[]; // ALL player cards in current game
    dealerCards: number[]; // ALL dealer cards (including hidden)
    dealerHiddenCard: number | null; // The actual hidden card value
  };

  // SSOT: Revealed count controls visibility (animation progress)
  revealedCount: {
    player: number; // How many player cards are revealed
    dealer: number; // How many dealer cards are revealed
  };

  // SSOT: Whether dealer hidden card has been flipped
  isHiddenCardFlipped: boolean;
}

interface GameActions {
  // Set the game result (called when GamePlayed event received)
  setLastGameResult: (result: HandSnapshot | null) => void;

  // Clear result and reset for new game
  clearLastResult: () => void;

  // V8: Set randomness source
  setRandomnessSource: (source: { isVRF: boolean; source: string } | null) => void;

  // Set game phase
  setGamePhase: (phase: GamePhase) => void;

  // Reset all game state for new game
  resetAnimationState: () => void;

  // SSOT: Add card to game cards (called from CardDealt event)
  addGameCard: (card: number, isDealer: boolean, isHidden: boolean) => void;

  // SSOT: Reveal next card (increment revealed count)
  revealNextCard: (isDealer: boolean) => void;

  // SSOT: Flip dealer hidden card
  flipHiddenCard: () => void;

  // SSOT: Clear game cards for new game
  clearGameCards: () => void;

  // SSOT: Reveal all cards instantly (for result display)
  revealAllCards: () => void;

  // SSOT: Batch-hydrate cards from contract state (single set() call, no orchestrator thrash)
  hydrateFromContract: (playerCards: number[], dealerCards: number[], phase: GamePhase) => void;
}

export type GameStore = GameState & GameActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialSSOTState = {
  gameCards: {
    playerCards: [] as number[],
    dealerCards: [] as number[],
    dealerHiddenCard: null as number | null,
  },
  revealedCount: {
    player: 0,
    dealer: 0,
  },
  isHiddenCardFlipped: false,
};

const initialState: GameState = {
  lastGameResult: null,
  showingResult: false,
  lastRandomnessSource: null,
  gamePhase: 'idle' as GamePhase,
  ...initialSSOTState,
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
    }),

  // V8: Set randomness source for debug/transparency
  setRandomnessSource: (source) => set({ lastRandomnessSource: source }),

  setGamePhase: (phase) => set({ gamePhase: phase }),

  resetAnimationState: () =>
    set({
      gamePhase: 'idle' as GamePhase,
      ...initialSSOTState,
    }),

  // SSOT: Add card to game cards
  addGameCard: (card, isDealer, isHidden) =>
    set((state) => {
      if (isDealer) {
        if (isHidden) {
          return {
            gameCards: {
              ...state.gameCards,
              dealerCards: [...state.gameCards.dealerCards, card],
              dealerHiddenCard: card,
            },
          };
        }
        return {
          gameCards: {
            ...state.gameCards,
            dealerCards: [...state.gameCards.dealerCards, card],
          },
        };
      }
      return {
        gameCards: {
          ...state.gameCards,
          playerCards: [...state.gameCards.playerCards, card],
        },
      };
    }),

  // SSOT: Reveal next card (increment revealed count)
  revealNextCard: (isDealer) =>
    set((state) => ({
      revealedCount: {
        ...state.revealedCount,
        [isDealer ? 'dealer' : 'player']: state.revealedCount[isDealer ? 'dealer' : 'player'] + 1,
      },
    })),

  // SSOT: Flip dealer hidden card
  flipHiddenCard: () => set({ isHiddenCardFlipped: true }),

  // SSOT: Clear game cards for new game
  clearGameCards: () =>
    set({
      ...initialSSOTState,
    }),

  // SSOT: Reveal all cards instantly (for result display)
  revealAllCards: () =>
    set((state) => ({
      revealedCount: {
        player: state.gameCards.playerCards.length,
        dealer: state.gameCards.dealerCards.length,
      },
      isHiddenCardFlipped: true,
      gamePhase: 'showing_result' as GamePhase,
    })),

  // SSOT: Batch-hydrate from contract — single set() call prevents orchestrator thrash
  hydrateFromContract: (playerCards, dealerCards, phase) =>
    set({
      gameCards: {
        playerCards,
        dealerCards,
        dealerHiddenCard: dealerCards.length >= 2 ? dealerCards[1] : null,
      },
      revealedCount: {
        player: playerCards.length,
        dealer: dealerCards.length,
      },
      isHiddenCardFlipped: false,
      gamePhase: phase,
    }),
}));

// =============================================================================
// SELECTORS (for optimized subscriptions)
// =============================================================================

export const selectLastGameResult = (state: GameStore) => state.lastGameResult;
export const selectShowingResult = (state: GameStore) => state.showingResult;
export const selectRandomnessSource = (state: GameStore) => state.lastRandomnessSource;

// Game phase
export const selectGamePhase = (state: GameStore) => state.gamePhase;

// SSOT selectors
export const selectGameCards = (state: GameStore) => state.gameCards;
export const selectRevealedCount = (state: GameStore) => state.revealedCount;
export const selectIsHiddenCardFlipped = (state: GameStore) => state.isHiddenCardFlipped;

// SSOT derived selectors - these are the cards to DISPLAY
export const selectDisplayPlayerCards = (state: GameStore) =>
  state.gameCards.playerCards.slice(0, state.revealedCount.player);

export const selectDisplayDealerCards = (state: GameStore) => {
  const cards = state.gameCards.dealerCards.slice(0, state.revealedCount.dealer);
  // Replace hidden card with -1 if not flipped
  if (cards.length >= 2 && !state.isHiddenCardFlipped) {
    return [cards[0], -1, ...cards.slice(2)];
  }
  return cards;
};
