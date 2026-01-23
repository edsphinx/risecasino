/**
 * useAnimationOrchestrator Hook
 *
 * Orchestrates staggered card reveals using the "Derived Reveal" pattern.
 *
 * ⚡ ARCHITECTURE:
 * - SSOT stores ALL cards immediately when events arrive
 * - This hook controls WHEN cards become visible by incrementing reveal count
 * - Components derive visible cards from: cards.slice(0, revealedCount)
 *
 * This replaces the complex animation queue with a simple timer.
 */

import { useEffect, useRef, useCallback } from 'preact/hooks';
import {
  useGameStore,
  selectGameCards,
  selectRevealedCount,
  selectGamePhase,
} from '@/stores/gameStore';
import { ANIMATION_TIMING } from '@/config/animationTiming';
import { logger } from '@/lib/logger';

// How long between each card reveal (ms)
const CARD_REVEAL_INTERVAL = ANIMATION_TIMING.cardDeal.minDelayMs;

export function useAnimationOrchestrator() {
  const gameCards = useGameStore(selectGameCards);
  const revealedCount = useGameStore(selectRevealedCount);
  const gamePhase = useGameStore(selectGamePhase);
  const { revealNextCard, setGamePhase } = useGameStore();

  // Track the reveal timer
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate pending reveals
  const pendingPlayerReveals = gameCards.playerCards.length - revealedCount.player;
  const pendingDealerReveals = gameCards.dealerCards.length - revealedCount.dealer;
  const totalPending = pendingPlayerReveals + pendingDealerReveals;

  // Reveal the next card in sequence
  const revealNext = useCallback(() => {
    const state = useGameStore.getState();
    const { gameCards: cards, revealedCount: revealed } = state;

    // Determine which hand to reveal next (alternate player/dealer)
    // During initial deal: P1, D1, P2, D2
    // During HIT: just player
    // During dealer turn: just dealer

    const playerHasMore = revealed.player < cards.playerCards.length;
    const dealerHasMore = revealed.dealer < cards.dealerCards.length;

    if (!playerHasMore && !dealerHasMore) {
      // Nothing left to reveal
      return false;
    }

    // Initial dealing: alternate between hands
    if (cards.playerCards.length <= 2 && cards.dealerCards.length <= 2) {
      // Initial deal - alternate
      if (revealed.player <= revealed.dealer && playerHasMore) {
        revealNextCard(false);
        logger.log('[Orchestrator] Revealed player card', revealed.player + 1);
      } else if (dealerHasMore) {
        revealNextCard(true);
        logger.log('[Orchestrator] Revealed dealer card', revealed.dealer + 1);
      } else if (playerHasMore) {
        revealNextCard(false);
        logger.log('[Orchestrator] Revealed player card', revealed.player + 1);
      }
    } else {
      // Mid-game: reveal whichever hand has pending cards
      if (playerHasMore) {
        revealNextCard(false);
        logger.log('[Orchestrator] Revealed player card', revealed.player + 1);
      } else if (dealerHasMore) {
        revealNextCard(true);
        logger.log('[Orchestrator] Revealed dealer card', revealed.dealer + 1);
      }
    }

    return true;
  }, [revealNextCard]);

  // Start/stop reveal timer when pending changes
  useEffect(() => {
    if (totalPending > 0 && !revealTimerRef.current) {
      logger.log('[Orchestrator] Starting reveal timer, pending:', totalPending);

      // Reveal first card immediately, then stagger the rest
      revealNext();

      revealTimerRef.current = setInterval(() => {
        const hasMore = revealNext();

        if (!hasMore && revealTimerRef.current) {
          clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
          logger.log('[Orchestrator] All cards revealed');

          // Transition phase if we were dealing
          const currentPhase = useGameStore.getState().gamePhase;
          if (currentPhase === 'dealing_initial' || currentPhase === 'waiting_vrf') {
            setGamePhase('player_turn');
          }
        }
      }, CARD_REVEAL_INTERVAL);
    }

    // Cleanup timer when component unmounts
    return () => {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [totalPending, revealNext, setGamePhase]);

  // Clear timer when game resets
  useEffect(() => {
    if (gamePhase === 'idle' && revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, [gamePhase]);

  return {
    pendingReveals: totalPending,
    isRevealing: revealTimerRef.current !== null,
    playerRevealed: revealedCount.player,
    dealerRevealed: revealedCount.dealer,
    totalPlayerCards: gameCards.playerCards.length,
    totalDealerCards: gameCards.dealerCards.length,
  };
}
