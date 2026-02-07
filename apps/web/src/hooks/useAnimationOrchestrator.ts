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
          logger.log('[Orchestrator] All cards revealed (interval)');
        }
      }, CARD_REVEAL_INTERVAL);
    }

    // Completion detection: when all cards are revealed and we're still in
    // a dealing phase, transition to player_turn. This runs as an effect
    // (not inside the interval) because the useEffect cleanup kills the
    // interval when totalPending drops to 0, preventing the interval from
    // ever detecting completion itself.
    if (totalPending === 0 && gameCards.playerCards.length >= 2) {
      const currentPhase = useGameStore.getState().gamePhase;
      if (currentPhase === 'dealing_initial' || currentPhase === 'waiting_vrf') {
        logger.log('[Orchestrator] All cards revealed — transitioning to player_turn');
        setGamePhase('player_turn');
      }
    }

    // Cleanup timer when component unmounts or totalPending changes
    return () => {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [totalPending, revealNext, setGamePhase, gameCards.playerCards.length]);

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
