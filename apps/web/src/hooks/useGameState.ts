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
import {
  useGameStore,
  selectLastGameResult,
  selectShowingResult,
  selectGamePhase,
} from '@/stores/gameStore';
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

// Suppress unused variable warning
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
    flipHiddenCard,
    hydrateFromContract,
  } = useGameStore();

  // Subscribe to gamePhase for safety-net refetch logic
  const gamePhase = useGameStore(selectGamePhase);

  const serviceRef = useRef(service);
  serviceRef.current = service;

  // Track pending timeouts for cleanup on unmount
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSOT: Hydrate gameCards from contract state on mount/game change
  // This ensures SSOT is synced when page reloads with active game
  const lastHydratedGameRef = useRef<string | null>(null);
  const hasHydratedThisSession = useRef(false);

  useEffect(() => {
    const game = service.game;
    const currentPhase = useGameStore.getState().gamePhase;
    const ssotCards = useGameStore.getState().gameCards;

    // CASE A: Game vanished on-chain while frontend was in an active phase.
    // This happens when game resolved (bust/win) but we missed the GameResolved event.
    // Contract deletes the game struct, so refetch returns empty.
    if (!game || game.playerCards.length === 0) {
      if (currentPhase === 'waiting_vrf' && ssotCards.playerCards.length > 0) {
        logger.log('[HYDRATION] Game vanished on-chain during waiting_vrf — resetting to idle');
        useGameStore.getState().resetAnimationState();
        useGameStore.getState().clearGameCards();
      }
      lastHydratedGameRef.current = null;
      hasHydratedThisSession.current = false;
      return;
    }

    // Dedup: skip if we already hydrated this exact card set
    const gameKey = `${game.playerCards.join(',')}-${game.dealerCards.join(',')}`;
    if (lastHydratedGameRef.current === gameKey) return;

    // Only hydrate from idle (page reload) or waiting_vrf (missed WebSocket events)
    if (currentPhase !== 'idle' && currentPhase !== 'waiting_vrf') {
      return;
    }

    const contractHasCards = game.playerCards.length > 0;
    const ssotPlayerCount = ssotCards.playerCards.length;

    // CASE B (idle): Page reload — only hydrate if SSOT is empty
    // CASE C (waiting_vrf): Missed events — hydrate if SSOT empty OR contract has more cards (HIT)
    const needsHydration =
      currentPhase === 'idle'
        ? contractHasCards && ssotPlayerCount === 0 && !hasHydratedThisSession.current
        : contractHasCards && (ssotPlayerCount === 0 || game.playerCards.length > ssotPlayerCount);

    if (!needsHydration) return;

    const gameState = game.state;
    const isGameActive = gameState !== IDLE && gameState !== undefined && !isFinalState(gameState);
    if (!isGameActive) {
      logger.log('[HYDRATION] Skipping - game not active, state:', gameState);
      return;
    }

    // Derive correct gamePhase from contract state
    let hydratedPhase: 'player_turn' | 'waiting_vrf' | 'dealer_reveal';
    if (gameState === PLAYER_TURN) {
      hydratedPhase = 'player_turn';
    } else if (
      gameState === WAITING_VRF ||
      gameState === WAITING_HIT_VRF ||
      gameState === WAITING_DOUBLE_VRF
    ) {
      hydratedPhase = 'waiting_vrf';
    } else {
      hydratedPhase = 'dealer_reveal';
    }

    logger.log('[HYDRATION] Batch hydrating SSOT from contract:', game, 'phase:', hydratedPhase);
    hasHydratedThisSession.current = true;

    // Single set() call — no orchestrator thrash
    hydrateFromContract([...game.playerCards], [...game.dealerCards], hydratedPhase);

    lastHydratedGameRef.current = gameKey;
  }, [service.game, hydrateFromContract]);

  // Safety net: When waiting_vrf and WebSocket misses events,
  // schedule delayed refetches to catch VRF fulfillment.
  // Covers BOTH initial deal (empty SSOT) and HIT (SSOT has cards but contract progressed).
  // Uses two timers: 3s for fast VRF, 8s for slow VRF (Rise testnet can take >2min).
  useEffect(() => {
    if (gamePhase !== 'waiting_vrf') return;

    const refetchIfStillWaiting = (label: string) => {
      const currentPhase = useGameStore.getState().gamePhase;
      if (currentPhase !== 'waiting_vrf') return;
      logger.log(`[GameStateCasino] VRF safety net (${label}): refetching`);
      serviceRef.current.refetch();
    };

    const timer1 = setTimeout(() => refetchIfStillWaiting('3s'), 3000);
    const timer2 = setTimeout(() => refetchIfStillWaiting('8s'), 8000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [gamePhase]);

  // Handle CardDealt event - populate SSOT
  const handleCardDealt = useCallback(
    (event: CardDealtEvent) => {
      logger.log('[GameStateCasino] CardDealt:', event);

      const currentGameCards = useGameStore.getState().gameCards;
      const currentPhase = useGameStore.getState().gamePhase;

      // DEDUP: Skip if SSOT was already populated by hydration.
      // When VRF responds same-block, refetch → hydration fills SSOT before
      // WebSocket events arrive. These late events would create duplicates.
      const targetCards = event.isDealer
        ? currentGameCards.dealerCards
        : currentGameCards.playerCards;
      if (
        currentPhase === 'player_turn' &&
        targetCards.length >= 2 &&
        !event.isDealer // Initial deal player cards
      ) {
        logger.log(
          '[GameStateCasino] Skipping stale CardDealt (SSOT already hydrated):',
          event.card
        );
        return;
      }
      if (
        currentPhase === 'player_turn' &&
        targetCards.length >= 2 &&
        event.isDealer &&
        !event.faceUp // Initial deal hidden card
      ) {
        logger.log(
          '[GameStateCasino] Skipping stale dealer CardDealt (SSOT already hydrated):',
          event.card
        );
        return;
      }

      // Phase tracking: transition to dealing_initial on first card
      if (currentPhase === 'waiting_vrf' || currentPhase === 'idle') {
        setGamePhase('dealing_initial');
      }

      // Check if this is the hidden card being revealed (duplicate event)
      // Contract emits CardDealt BOTH when dealing hidden card AND when revealing it
      const isHiddenCardReveal =
        event.isDealer && event.faceUp && currentGameCards.dealerHiddenCard === event.card;

      if (isHiddenCardReveal) {
        logger.log('[GameStateCasino] Skipping duplicate hidden card reveal:', event.card);
        flipHiddenCard();
        return;
      }

      // Add card to SSOT (orchestrator handles reveal timing + phase transition)
      const isHidden = event.isDealer && !event.faceUp;
      addGameCard(event.card, event.isDealer, isHidden);
    },
    [addGameCard, setGamePhase, flipHiddenCard]
  );

  // Handle GameResolved event from WebSocket
  const handleGameResolved = useCallback(
    (event: GameResolvedEvent) => {
      logger.log('[GameStateCasino] GameResolved:', event);

      // Clear any pending timers from a previous resolve (shouldn't happen, but guard)
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);

      // Set dealer reveal phase
      setGamePhase('dealer_reveal');

      // Flip the dealer's hidden card face-up
      flipHiddenCard();

      // Delay to allow final CardDealt events to arrive
      // RiseChain has 10ms blocks so events arrive in rapid bursts
      resolveTimerRef.current = setTimeout(() => {
        resolveTimerRef.current = null;

        // Guard: if result was already cleared (e.g., user started new game), bail
        const currentPhase = useGameStore.getState().gamePhase;
        if (currentPhase === 'idle' || currentPhase === 'betting') {
          logger.log('[GameStateCasino] Stale resolve timer, phase is:', currentPhase);
          return;
        }

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
          bet: event.bet,
        });

        // Dispatch global event for wallet balance refresh
        window.dispatchEvent(new CustomEvent('vyrejack:gameResolved'));

        // Refetch after overlay has time to display
        refetchTimerRef.current = setTimeout(() => {
          refetchTimerRef.current = null;
          serviceRef.current.refetch();
        }, 5000);
      }, 100);
    },
    [setGamePhase, flipHiddenCard, setLastGameResult]
  );

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  const clearLastResult = useCallback(() => {
    storeClearResult();
  }, [storeClearResult]);

  // WebSocket listener for game events
  const { isConnected: isEventConnected } = useGameEvents(player, {
    onGameResolved: handleGameResolved,
    onCardDealt: handleCardDealt,
  });

  // BUG-09 FIX: Refetch on WebSocket reconnection to catch missed events
  const prevConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Detect reconnection: was previously connected, disconnected, now reconnected
    if (isEventConnected && prevConnectedRef.current === false && player) {
      logger.log('[GameStateCasino] WebSocket reconnected, refetching state');
      serviceRef.current.refetch();
    }
    prevConnectedRef.current = isEventConnected;
  }, [isEventConnected, player]);

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
    return state === WAITING_VRF || state === WAITING_HIT_VRF || state === WAITING_DOUBLE_VRF;
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
