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
import { getRandomCardDelay } from '@/config/animationTiming';

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

// ⚡ ANIMATION QUEUE SYSTEM
export type GamePhase =
  | 'idle' // No active game
  | 'betting' // Player selected bet, waiting to confirm
  | 'waiting_vrf' // VRF in progress, show riffle shuffle
  | 'dealing_initial' // Animating initial 4 cards
  | 'flipping_initial' // Flipping initial cards
  | 'player_turn' // Player actions (hit/stand/double)
  | 'dealer_reveal' // Revealing dealer hidden card
  | 'dealer_hitting' // Animating dealer additional cards
  | 'result_pause' // Pause before showing result
  | 'showing_result'; // Result overlay visible

export interface AnimationQueueItem {
  id: string; // Unique ID for tracking
  type: 'deal_card' | 'flip_card' | 'reveal_result' | 'pause';
  payload: {
    card?: number;
    isDealer?: boolean;
    faceUp?: boolean;
    cardIndex?: number; // for flip_card
    result?: HandSnapshot; // for reveal_result
    durationMs?: number; // for pause
  };
  delayMs: number; // delay before this item
  processed: boolean; // whether this item has been processed
}

interface GameState {
  // Last game result - persists after game ends for overlay display
  lastGameResult: HandSnapshot | null;

  // Accumulated cards from WebSocket CardDealt events (for logic)
  accumulatedCards: CardAccumulator;

  // Card snapshot taken just before an action
  cardSnapshot: CardAccumulator | null;

  // Whether game result overlay should be visible
  showingResult: boolean;

  // V8: Last randomness source used (for debug/transparency)
  lastRandomnessSource: { isVRF: boolean; source: string } | null;

  // ⚡ ANIMATION QUEUE STATE
  gamePhase: GamePhase;
  animationQueue: AnimationQueueItem[];

  // Visible cards (what UI renders) - separate from accumulated
  visiblePlayerCards: number[];
  visibleDealerCards: number[];

  // Flipped cards (face-up state) - indices into visible arrays
  flippedPlayerIndices: number[];
  flippedDealerIndices: number[];

  // Whether animation processor is running
  isProcessingQueue: boolean;

  // 🎯 SSOT: Single Source of Truth for game cards
  gameCards: {
    playerCards: number[]; // ALL player cards in current game
    dealerCards: number[]; // ALL dealer cards (including hidden)
    dealerHiddenCard: number | null; // The actual hidden card value
  };

  // 🎯 SSOT: Revealed count controls visibility (animation progress)
  revealedCount: {
    player: number; // How many player cards are revealed
    dealer: number; // How many dealer cards are revealed
  };

  // 🎯 SSOT: Whether dealer hidden card has been flipped
  isHiddenCardFlipped: boolean;
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

  // ⚡ ANIMATION QUEUE ACTIONS
  setGamePhase: (phase: GamePhase) => void;

  // Queue a card deal animation
  queueCardDeal: (card: number, isDealer: boolean, faceUp: boolean) => void;

  // Queue a card flip animation
  queueCardFlip: (cardIndex: number, isDealer: boolean) => void;

  // Queue result reveal
  queueResult: (result: HandSnapshot) => void;

  // Process next item in queue (called by animation processor)
  processNextQueueItem: () => AnimationQueueItem | null;

  // Mark item as processed
  markItemProcessed: (itemId: string) => void;

  // Add visible card (called when deal animation completes)
  addVisibleCard: (card: number, isDealer: boolean) => void;

  // Add flipped index (called when flip animation completes)
  addFlippedIndex: (index: number, isDealer: boolean) => void;

  // Clear animation state for new game
  resetAnimationState: () => void;

  // Set processing flag
  setProcessingQueue: (isProcessing: boolean) => void;

  // 🎯 SSOT: Add card to game cards (called from CardDealt event)
  addGameCard: (card: number, isDealer: boolean, isHidden: boolean) => void;

  // 🎯 SSOT: Reveal next card (increment revealed count)
  revealNextCard: (isDealer: boolean) => void;

  // 🎯 SSOT: Flip dealer hidden card
  flipHiddenCard: () => void;

  // 🎯 SSOT: Clear game cards for new game
  clearGameCards: () => void;

  // 🎯 SSOT: Reveal all cards instantly (for result display)
  revealAllCards: () => void;
}

type GameStore = GameState & GameActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialAnimationState = {
  gamePhase: 'idle' as GamePhase,
  animationQueue: [] as AnimationQueueItem[],
  visiblePlayerCards: [] as number[],
  visibleDealerCards: [] as number[],
  flippedPlayerIndices: [] as number[],
  flippedDealerIndices: [] as number[],
  isProcessingQueue: false,
};

// 🎯 SSOT initial state
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
  accumulatedCards: {
    playerCards: [],
    dealerCards: [],
    dealerHiddenCard: null,
  },
  cardSnapshot: null,
  showingResult: false,
  lastRandomnessSource: null,
  ...initialAnimationState,
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

  // ⚡ ANIMATION QUEUE ACTION IMPLEMENTATIONS
  setGamePhase: (phase) => set({ gamePhase: phase }),

  queueCardDeal: (card, isDealer, faceUp) =>
    set((state) => {
      const newItem: AnimationQueueItem = {
        id: `deal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'deal_card',
        payload: { card, isDealer, faceUp },
        delayMs: getRandomCardDelay(),
        processed: false,
      };
      return { animationQueue: [...state.animationQueue, newItem] };
    }),

  queueCardFlip: (cardIndex, isDealer) =>
    set((state) => {
      const newItem: AnimationQueueItem = {
        id: `flip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'flip_card',
        payload: { cardIndex, isDealer },
        delayMs: 100, // Small delay after card lands
        processed: false,
      };
      return { animationQueue: [...state.animationQueue, newItem] };
    }),

  queueResult: (result) =>
    set((state) => {
      const newItem: AnimationQueueItem = {
        id: `result-${Date.now()}`,
        type: 'reveal_result',
        payload: { result },
        delayMs: 3000, // 3 second pause before result
        processed: false,
      };
      return { animationQueue: [...state.animationQueue, newItem] };
    }),

  processNextQueueItem: () => {
    let nextItem: AnimationQueueItem | null = null;
    useGameStore.setState((state) => {
      const unprocessed = state.animationQueue.find((item) => !item.processed);
      if (unprocessed) {
        nextItem = unprocessed;
      }
      return {}; // No state change, just reading
    });
    return nextItem;
  },

  markItemProcessed: (itemId) =>
    set((state) => ({
      animationQueue: state.animationQueue.map((item) =>
        item.id === itemId ? { ...item, processed: true } : item
      ),
    })),

  addVisibleCard: (card, isDealer) =>
    set((state) => {
      if (isDealer) {
        // Prevent duplicate cards
        if (state.visibleDealerCards.includes(card)) {
          return {};
        }
        return {
          visibleDealerCards: [...state.visibleDealerCards, card],
        };
      }
      // Prevent duplicate cards
      if (state.visiblePlayerCards.includes(card)) {
        return {};
      }
      return {
        visiblePlayerCards: [...state.visiblePlayerCards, card],
      };
    }),

  addFlippedIndex: (index, isDealer) =>
    set((state) => {
      if (isDealer) {
        // Prevent duplicate indices
        if (state.flippedDealerIndices.includes(index)) {
          return {};
        }
        return {
          flippedDealerIndices: [...state.flippedDealerIndices, index],
        };
      }
      // Prevent duplicate indices
      if (state.flippedPlayerIndices.includes(index)) {
        return {};
      }
      return {
        flippedPlayerIndices: [...state.flippedPlayerIndices, index],
      };
    }),

  resetAnimationState: () =>
    set({
      ...initialAnimationState,
      ...initialSSOTState,
    }),

  setProcessingQueue: (isProcessing) => set({ isProcessingQueue: isProcessing }),

  // 🎯 SSOT: Add card to game cards
  addGameCard: (card, isDealer, isHidden) =>
    set((state) => {
      // 🔍 DEBUG: Trace card additions
      console.log('[SSOT] addGameCard:', {
        card,
        isDealer,
        isHidden,
        currentPlayerCards: state.gameCards.playerCards,
        currentDealerCards: state.gameCards.dealerCards,
        stack: new Error().stack?.split('\n').slice(2, 5).join('\n'),
      });

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

  // 🎯 SSOT: Reveal next card (increment revealed count)
  revealNextCard: (isDealer) =>
    set((state) => ({
      revealedCount: {
        ...state.revealedCount,
        [isDealer ? 'dealer' : 'player']: state.revealedCount[isDealer ? 'dealer' : 'player'] + 1,
      },
    })),

  // 🎯 SSOT: Flip dealer hidden card
  flipHiddenCard: () => set({ isHiddenCardFlipped: true }),

  // 🎯 SSOT: Clear game cards for new game
  clearGameCards: () =>
    set({
      ...initialSSOTState,
    }),

  // 🎯 SSOT: Reveal all cards instantly (for result display)
  revealAllCards: () =>
    set((state) => ({
      revealedCount: {
        player: state.gameCards.playerCards.length,
        dealer: state.gameCards.dealerCards.length,
      },
      isHiddenCardFlipped: true,
    })),
}));

// =============================================================================
// SELECTORS (for optimized subscriptions)
// =============================================================================

export const selectLastGameResult = (state: GameStore) => state.lastGameResult;
export const selectShowingResult = (state: GameStore) => state.showingResult;
export const selectAccumulatedCards = (state: GameStore) => state.accumulatedCards;
export const selectRandomnessSource = (state: GameStore) => state.lastRandomnessSource;

// ⚡ Animation selectors
export const selectGamePhase = (state: GameStore) => state.gamePhase;
export const selectAnimationQueue = (state: GameStore) => state.animationQueue;
export const selectVisiblePlayerCards = (state: GameStore) => state.visiblePlayerCards;
export const selectVisibleDealerCards = (state: GameStore) => state.visibleDealerCards;
export const selectFlippedPlayerIndices = (state: GameStore) => state.flippedPlayerIndices;
export const selectFlippedDealerIndices = (state: GameStore) => state.flippedDealerIndices;
export const selectIsProcessingQueue = (state: GameStore) => state.isProcessingQueue;

// 🎯 SSOT selectors
export const selectGameCards = (state: GameStore) => state.gameCards;
export const selectRevealedCount = (state: GameStore) => state.revealedCount;
export const selectIsHiddenCardFlipped = (state: GameStore) => state.isHiddenCardFlipped;

// 🎯 SSOT derived selectors - these are the cards to DISPLAY
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
