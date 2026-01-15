/**
 * useGameState - Compositor hook for VyreJackCore game state
 *
 * Combines:
 * - Read-only game state from useGameService (NO POLLING)
 * - WebSocket events from useGameEvents (real-time updates)
 * - Card accumulation from CardDealt events
 * - Snapshot mechanism for result preservation
 *
 * This follows the same architecture as useGameState for VyreJack ETH.
 *
 * ⚡ PERFORMANCE:
 * - NO POLLING - WebSocket events trigger state updates
 * - Card accumulation for smooth UI updates
 * - 50ms delay allows all CardDealt events to arrive before processing GameResolved
 *
 * 🔧 MAINTAINABILITY:
 * - Single compositor hook combines all state sources
 * - Clean separation: reads (service) vs events (WebSocket) vs writes (actions)
 * - Reusable for CHIP and USDC games
 */

import { useCallback, useRef, useMemo } from 'preact/hooks';
import { useGameService } from './useGameService';
import {
  useGameStore,
  selectLastGameResult,
  selectAccumulatedCards,
  selectShowingResult,
} from '@/stores/gameStore';
import { useGameEvents, type GameResolvedEvent, type CardDealtEvent } from './useGameEvents';
import { logger } from '@/lib/logger';
import type { VyreJackGame, GameResult } from '@vyrejack/shared';

// =============================================================================
// TYPES
// =============================================================================

// VyreJackGameState enum values (from VyreJackCore.sol)
// Must match contract exactly!
const IDLE = 0; // No active game
const WAITING_VRF = 1; // WaitingForDeal - awaiting initial 4 cards
const PLAYER_TURN = 2; // Player can hit/stand/double
const WAITING_HIT_VRF = 3; // WaitingForHit - awaiting hit card
const WAITING_DOUBLE_VRF = 4; // WaitingForDouble - awaiting double card
const DEALER_TURN = 5; // Dealer is drawing
// Final states (game ended)
const PLAYER_WIN = 6;
const DEALER_WIN = 7;
const PUSH = 8;
const PLAYER_BLACKJACK = 9;

// Suppress unused variable warnings
void WAITING_DOUBLE_VRF;
void DEALER_TURN;

// Card accumulator for smooth display
interface CardAccumulator {
  playerCards: number[];
  dealerCards: number[];
  dealerHiddenCard: number | null; // Second card, revealed at end
}

// Snapshot of hand when game ends
interface HandSnapshot {
  playerCards: number[];
  dealerCards: number[];
  playerValue: number;
  dealerValue: number;
  bet: bigint;
  result: GameResult;
  payout: bigint;
}

export interface UseGameStateCasinoReturn {
  // Game state
  game: VyreJackGame | null;
  playerValue: number;
  dealerValue: number;
  isFetching: boolean;

  // Card accumulator for display
  accumulatedCards: CardAccumulator;

  // Last game result with snapshot
  lastGameResult: HandSnapshot | null;
  clearLastResult: () => void;

  // WebSocket status
  isEventConnected: boolean;

  // Derived state
  hasActiveGame: boolean;
  isPlayerTurn: boolean;
  isWaitingVRF: boolean;
  isGameEnded: boolean;
  showingResult: boolean;

  // Actions
  refetch: () => Promise<void>;
  snapshotCards: () => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isFinalState(state: number | undefined): boolean {
  return (
    state === PLAYER_WIN || state === DEALER_WIN || state === PUSH || state === PLAYER_BLACKJACK
  );
}

/**
 * Calculate blackjack hand value from card indices
 * Card index format: 0-51 where (index % 13) gives rank (0=Ace, 1=2, ..., 12=King)
 */
function calculateLocalHandValue(cards: number[]): number {
  if (!cards || cards.length === 0) return 0;

  let value = 0;
  let aces = 0;

  for (const card of cards) {
    const rank = card % 13; // 0=Ace, 1=2, ..., 9=10, 10=J, 11=Q, 12=K

    if (rank === 0) {
      // Ace
      aces++;
      value += 11;
    } else if (rank >= 10) {
      // Face cards (J, Q, K)
      value += 10;
    } else {
      // Number cards (2-10)
      value += rank + 1;
    }
  }

  // Adjust aces from 11 to 1 if needed
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

// =============================================================================
// HOOK
// =============================================================================

export function useGameState(player: `0x${string}` | null): UseGameStateCasinoReturn {
  // Read-only game state (NO POLLING)
  const service = useGameService(player);

  // ⚡ ZUSTAND: Use global store for persistent game results
  const lastGameResult = useGameStore(selectLastGameResult);
  const accumulatedCards = useGameStore(selectAccumulatedCards);
  const showingResult = useGameStore(selectShowingResult);
  const {
    setLastGameResult,
    clearLastResult: storeCllearResult,
    addCard,
    resetCards,
  } = useGameStore();

  // Snapshot ref - backup of cards before action
  const cardSnapshotRef = useRef<CardAccumulator | null>(null);

  // Refs to get latest values in delayed callback
  const accumulatedCardsRef = useRef(accumulatedCards);
  accumulatedCardsRef.current = accumulatedCards;

  const serviceRef = useRef(service);
  serviceRef.current = service;

  // Take snapshot of current cards (call before actions)
  const snapshotCards = useCallback(() => {
    const snapshot: CardAccumulator = {
      playerCards:
        accumulatedCards.playerCards.length > 0
          ? [...accumulatedCards.playerCards]
          : [...(service.game?.playerCards ?? [])],
      dealerCards:
        accumulatedCards.dealerCards.length > 0
          ? [...accumulatedCards.dealerCards]
          : [...(service.game?.dealerCards ?? [])],
      dealerHiddenCard: accumulatedCards.dealerHiddenCard,
    };
    cardSnapshotRef.current = snapshot;
    logger.log('[GameStateCasino] Cards snapshot taken:', snapshot);
  }, [accumulatedCards, service.game]);

  // Handle CardDealt event - accumulate cards
  const handleCardDealt = useCallback(
    (event: CardDealtEvent) => {
      logger.log('[GameStateCasino] CardDealt:', event);

      // Use Zustand store's addCard
      addCard(event.card, event.isDealer, event.faceUp);

      // DO NOT refetch here - it causes re-render loops!
      // Events are the source of truth for card accumulation
    },
    [] // No dependencies - pure state update
  );

  // Handle GameResolved event from WebSocket (V6 GamePlayed event)
  // Deduplication is handled in useGameEvents by txHash+logIndex
  const handleGameResolved = useCallback(
    (event: GameResolvedEvent) => {
      logger.log('[GameStateCasino] GameResolved:', event);

      // Log current accumulated state BEFORE timeout
      logger.log('[GameStateCasino] Cards BEFORE delay:', {
        accumulatedPlayer: accumulatedCardsRef.current.playerCards,
        accumulatedDealer: accumulatedCardsRef.current.dealerCards,
        hiddenCard: accumulatedCardsRef.current.dealerHiddenCard,
      });

      // Delay 50ms to allow CardDealt events to be processed first
      // Rise is very fast, events may arrive nearly simultaneously
      setTimeout(() => {
        const currentAccumulated = accumulatedCardsRef.current;
        const currentService = serviceRef.current;
        const currentSnapshot = cardSnapshotRef.current;

        // Get cards from multiple sources (best available)
        // Priority: accumulated > snapshot > contract state
        let playerCards: number[] = [];
        let dealerCards: number[] = [];

        if (currentAccumulated.playerCards.length >= 2) {
          playerCards = [...currentAccumulated.playerCards];
          logger.log('[GameStateCasino] Using accumulated player cards:', playerCards);
        } else if (currentSnapshot?.playerCards.length) {
          playerCards = [...currentSnapshot.playerCards];
          logger.log('[GameStateCasino] Using snapshot player cards:', playerCards);
        } else if (currentService.game?.playerCards?.length) {
          playerCards = [...currentService.game.playerCards];
          logger.log('[GameStateCasino] Using contract player cards:', playerCards);
        }

        if (currentAccumulated.dealerCards.length >= 1) {
          dealerCards = [...currentAccumulated.dealerCards];
          // Add hidden card if exists
          if (
            currentAccumulated.dealerHiddenCard !== null &&
            !dealerCards.includes(currentAccumulated.dealerHiddenCard)
          ) {
            dealerCards.splice(1, 0, currentAccumulated.dealerHiddenCard);
          }
          logger.log('[GameStateCasino] Using accumulated dealer cards:', dealerCards);
        } else if (currentSnapshot?.dealerCards.length) {
          dealerCards = [...currentSnapshot.dealerCards];
          if (currentSnapshot.dealerHiddenCard !== null) {
            dealerCards.splice(1, 0, currentSnapshot.dealerHiddenCard);
          }
          logger.log('[GameStateCasino] Using snapshot dealer cards:', dealerCards);
        } else if (currentService.game?.dealerCards?.length) {
          dealerCards = [...currentService.game.dealerCards];
          logger.log('[GameStateCasino] Using contract dealer cards:', dealerCards);
        }

        // Use event values if provided, otherwise calculate locally from cards
        // GamePlayed event doesn't include final values (they're 0), so we calculate
        const playerValue =
          event.playerFinalValue > 0
            ? event.playerFinalValue
            : calculateLocalHandValue(playerCards);
        const dealerValue =
          event.dealerFinalValue > 0
            ? event.dealerFinalValue
            : calculateLocalHandValue(dealerCards);

        logger.log('[GameStateCasino] Hand values (calculated if 0):', {
          playerValue,
          dealerValue,
          eventPlayerValue: event.playerFinalValue,
          eventDealerValue: event.dealerFinalValue,
          result: event.result,
          payout: event.payout.toString(),
        });

        // Use Zustand store
        setLastGameResult({
          result: event.result,
          payout: event.payout,
          playerValue,
          dealerValue,
          playerCards,
          dealerCards,
          bet: 0n,
        });

        // Clear accumulated cards for next game via store
        resetCards();
        cardSnapshotRef.current = null;

        // Dispatch global event for wallet balance refresh
        window.dispatchEvent(new CustomEvent('vyrejack:gameResolved'));

        // DEFERRED: Refetch after overlay has time to display
        // The overlay displays for ~5s, so we wait until user interaction or timeout
        setTimeout(() => {
          currentService.refetch();
        }, 5000);
      }, 50); // 50ms delay - matches ETH version, Rise Chain is fast
    },
    [] // No dependencies - we use refs for current values
  );

  const clearLastResult = useCallback(() => {
    storeCllearResult();
    cardSnapshotRef.current = null;
  }, [storeCllearResult]);

  // WebSocket listener for game events
  const { isConnected: isEventConnected } = useGameEvents(player, {
    onGameResolved: handleGameResolved,
    onCardDealt: handleCardDealt,
  });

  // Derived state
  const isGameEnded = useMemo(() => {
    return isFinalState(service.game?.state);
  }, [service.game]);

  const hasActiveGame = useMemo(() => {
    return (
      service.game !== null && service.game.state !== IDLE && !isFinalState(service.game.state)
    );
  }, [service.game]);

  const isPlayerTurn = useMemo(() => {
    return service.game?.state === PLAYER_TURN;
  }, [service.game]);

  // VRF waiting states - game is waiting for randomness callback
  const isWaitingVRF = useMemo(() => {
    const state = service.game?.state;
    return state === WAITING_VRF || state === WAITING_HIT_VRF;
  }, [service.game]);

  // showingResult already from store selector above

  return {
    // Game state
    game: service.game,
    playerValue: service.playerValue,
    dealerValue: service.dealerValue,
    isFetching: service.isFetching,

    // Card accumulator
    accumulatedCards,

    // Last result with snapshot
    lastGameResult,
    clearLastResult,

    // WebSocket
    isEventConnected,

    // Derived state
    hasActiveGame,
    isPlayerTurn,
    isWaitingVRF,
    isGameEnded,
    showingResult,

    // Actions
    refetch: service.refetch,
    snapshotCards,
  };
}
