/**
 * useGameState - Compositor hook for VyreJackCore game state
 *
 * Combines:
 * - Read-only game state from useGameService (NO POLLING)
 * - WebSocket events from useGameEvents (real-time updates)
 * - SSOT card management via gameStore
 *
 * ARCHITECTURE:
 * - SSOT gameCards is the ONLY card source (no fallback layers)
 * - CardDealt events populate gameCards + trigger reveal
 * - GameResolved event builds HandSnapshot from SSOT
 * - useAnimationOrchestrator handles staggered reveal timing
 *
 * PERFORMANCE:
 * - NO POLLING - WebSocket events trigger state updates
 * - Instant card display via SSOT + revealedCount
 */

import { useCallback, useRef, useMemo, useEffect } from 'preact/hooks';
import { useGameService } from './useGameService';
import { useGameStore, selectLastGameResult, selectShowingResult } from '@/stores/gameStore';
import { useGameEvents, type GameResolvedEvent, type CardDealtEvent } from './useGameEvents';
import { logger } from '@/lib/logger';
import type { VyreJackGame, GameResult } from '@vyrejack/shared';

// =============================================================================
// TYPES
// =============================================================================

// VyreJackGameState enum values (from VyreJackCore.sol)
const IDLE = 0;
const WAITING_VRF = 1; // WaitingForDeal
const PLAYER_TURN = 2;
const WAITING_HIT_VRF = 3;
const WAITING_DOUBLE_VRF = 4;
const DEALER_TURN = 5;
// Final states
const PLAYER_WIN = 6;
const DEALER_WIN = 7;
const PUSH = 8;
const PLAYER_BLACKJACK = 9;

// Suppress unused variable warnings
void WAITING_DOUBLE_VRF;
void DEALER_TURN;

export interface UseGameStateCasinoReturn {
  // Game state
  game: VyreJackGame | null;
  isFetching: boolean;

  // Last game result
  lastGameResult: {
    playerCards: number[];
    dealerCards: number[];
    playerValue: number;
    dealerValue: number;
    bet: bigint;
    result: GameResult;
    payout: bigint;
  } | null;
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
}

// =============================================================================
// HOOK
// =============================================================================

export function useGameState(player: `0x${string}` | null): UseGameStateCasinoReturn {
  // Read-only game state (NO POLLING)
  const service = useGameService(player);

  // ZUSTAND: Use global store for persistent game results
  const lastGameResult = useGameStore(selectLastGameResult);
  const showingResult = useGameStore(selectShowingResult);
  const {
    clearLastResult: storeClearResult,
    setGamePhase,
    setLastGameResult,
    // SSOT actions
    addGameCard,
    revealNextCard,
    clearGameCards,
    flipHiddenCard,
  } = useGameStore();

  const serviceRef = useRef(service);
  serviceRef.current = service;

  // SSOT: Hydrate gameCards from contract state on mount/game change
  // This ensures SSOT is synced when page reloads with active game
  const lastHydratedGameRef = useRef<string | null>(null);
  const hasHydratedThisSession = useRef(false);

  useEffect(() => {
    const game = service.game;

    // Reset tracking when game ends
    if (!game || game.playerCards.length === 0) {
      lastHydratedGameRef.current = null;
      hasHydratedThisSession.current = false;
      return;
    }

    const gameKey = `${game.playerCards.join(',')}-${game.dealerCards.join(',')}`;

    if (lastHydratedGameRef.current === gameKey) return;

    // Only hydrate on PAGE RELOAD when SSOT is empty but contract has cards
    const ssotState = useGameStore.getState();
    const ssotHasCards = ssotState.gameCards.playerCards.length > 0;
    const contractHasCards = game.playerCards.length > 0;

    if (contractHasCards && !ssotHasCards && !hasHydratedThisSession.current) {
      const currentPhase = useGameStore.getState().gamePhase;
      if (currentPhase !== 'idle') {
        logger.log('[HYDRATION] Skipping - gamePhase is:', currentPhase);
        return;
      }

      const gameState = game.state;
      const isGameActive =
        gameState !== IDLE && gameState !== undefined && !isFinalState(gameState);
      if (!isGameActive) {
        logger.log('[HYDRATION] Skipping - game not active, state:', gameState);
        return;
      }

      logger.log('[HYDRATION] Hydrating SSOT from contract:', game);
      hasHydratedThisSession.current = true;

      clearGameCards();

      game.playerCards.forEach((card: number) => {
        addGameCard(card, false, false);
        revealNextCard(false);
      });

      game.dealerCards.forEach((card: number, i: number) => {
        const isHidden = i === 1;
        addGameCard(card, true, isHidden);
        revealNextCard(true);
      });

      lastHydratedGameRef.current = gameKey;
    }
  }, [service.game, clearGameCards, addGameCard, revealNextCard]);

  // Handle CardDealt event - populate SSOT
  const handleCardDealt = useCallback(
    (event: CardDealtEvent) => {
      logger.log('[GameStateCasino] CardDealt:', event);

      // Phase tracking: transition to dealing_initial on first card
      const currentPhase = useGameStore.getState().gamePhase;
      if (currentPhase === 'waiting_vrf' || currentPhase === 'idle') {
        setGamePhase('dealing_initial');
      }

      // Check if this is the hidden card being revealed (duplicate event)
      // Contract emits CardDealt BOTH when dealing hidden card AND when revealing it
      const currentGameCards = useGameStore.getState().gameCards;
      const isHiddenCardReveal =
        event.isDealer && event.faceUp && currentGameCards.dealerHiddenCard === event.card;

      if (isHiddenCardReveal) {
        logger.log('[GameStateCasino] Skipping duplicate hidden card reveal:', event.card);
        flipHiddenCard();
        return;
      }

      // Add card and reveal immediately
      const isHidden = event.isDealer && !event.faceUp;
      addGameCard(event.card, event.isDealer, isHidden);
      revealNextCard(event.isDealer);
    },
    [addGameCard, revealNextCard, setGamePhase, flipHiddenCard]
  );

  // Handle GameResolved event from WebSocket
  const handleGameResolved = useCallback(
    (event: GameResolvedEvent) => {
      logger.log('[GameStateCasino] GameResolved:', event);

      // Set dealer reveal phase
      setGamePhase('dealer_reveal');

      // Flip the dealer's hidden card face-up
      flipHiddenCard();

      // Small delay to allow any final CardDealt events to arrive
      setTimeout(() => {
        const currentService = serviceRef.current;

        // Get cards from SSOT (single source)
        const ssotCards = useGameStore.getState().gameCards;
        let playerCards = [...ssotCards.playerCards];
        let dealerCards = [...ssotCards.dealerCards];

        // Fallback to contract only if SSOT is empty (shouldn't happen normally)
        if (playerCards.length < 2 && currentService.game?.playerCards?.length) {
          playerCards = [...currentService.game.playerCards];
          logger.log('[GameStateCasino] SSOT empty, using contract player cards:', playerCards);
        }
        if (dealerCards.length < 1 && currentService.game?.dealerCards?.length) {
          dealerCards = [...currentService.game.dealerCards];
          logger.log('[GameStateCasino] SSOT empty, using contract dealer cards:', dealerCards);
        }

        // Calculate hand values (event values are 0, so we calculate locally)
        const playerValue =
          event.playerFinalValue > 0
            ? event.playerFinalValue
            : calculateLocalHandValue(playerCards);
        const dealerValue =
          event.dealerFinalValue > 0
            ? event.dealerFinalValue
            : calculateLocalHandValue(dealerCards);

        logger.log('[GameStateCasino] Hand values:', {
          playerValue,
          dealerValue,
          result: event.result,
          payout: event.payout.toString(),
        });

        // Build hand snapshot and set result
        setLastGameResult({
          result: event.result,
          payout: event.payout,
          playerValue,
          dealerValue,
          playerCards,
          dealerCards,
          bet: 0n,
        });

        // Dispatch global event for wallet balance refresh
        window.dispatchEvent(new CustomEvent('vyrejack:gameResolved'));

        // Refetch after overlay has time to display
        setTimeout(() => {
          currentService.refetch();
        }, 5000);
      }, 50);
    },
    [setGamePhase, flipHiddenCard, setLastGameResult]
  );

  const clearLastResult = useCallback(() => {
    storeClearResult();
  }, [storeClearResult]);

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

  const isWaitingVRF = useMemo(() => {
    const state = service.game?.state;
    return state === WAITING_VRF || state === WAITING_HIT_VRF;
  }, [service.game]);

  return {
    game: service.game,
    isFetching: service.isFetching,

    lastGameResult,
    clearLastResult,

    isEventConnected,

    hasActiveGame,
    isPlayerTurn,
    isWaitingVRF,
    isGameEnded,
    showingResult,

    refetch: service.refetch,
  };
}
