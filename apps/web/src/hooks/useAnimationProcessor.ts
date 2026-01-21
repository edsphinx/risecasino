/**
 * useAnimationProcessor Hook
 *
 * Processes the animation queue from Zustand store.
 * Watches for new queue items and executes them with proper timing.
 */

import { useEffect, useRef, useCallback } from 'preact/hooks';
import {
  useGameStore,
  selectAnimationQueue,
  selectIsProcessingQueue,
  selectGamePhase,
} from '@/stores/gameStore';
import type { AnimationQueueItem } from '@/stores/gameStore';
import { logger } from '@/lib/logger';

// =============================================================================
// HOOK
// =============================================================================

export function useAnimationProcessor() {
  const animationQueue = useGameStore(selectAnimationQueue);
  const isProcessingQueue = useGameStore(selectIsProcessingQueue);
  const gamePhase = useGameStore(selectGamePhase);

  const {
    markItemProcessed,
    addVisibleCard,
    addFlippedIndex,
    setGamePhase,
    setProcessingQueue,
    setLastGameResult,
  } = useGameStore();

  // Ref to track current processing timeout
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // ⚡ FIX: Track locally processed items to prevent duplicate execution
  const processedItemsRef = useRef<Set<string>>(new Set());

  // ⚡ FIX: Track queue version to detect reset mid-processing
  const queueVersionRef = useRef(0);

  // ⚡ FIX: Track if we're currently in a processing loop
  const isProcessingLoopActiveRef = useRef(false);

  // Process a single queue item
  const processItem = useCallback(
    (item: AnimationQueueItem) => {
      // ⚡ FIX: Skip if already processed locally
      if (processedItemsRef.current.has(item.id)) {
        return;
      }

      logger.log('[AnimationProcessor] Processing item:', item.type, item.id);
      processedItemsRef.current.add(item.id);

      switch (item.type) {
        case 'deal_card': {
          const { card, isDealer } = item.payload;
          if (card !== undefined && isDealer !== undefined) {
            addVisibleCard(card, isDealer);
          }
          break;
        }

        case 'flip_card': {
          const { cardIndex, isDealer } = item.payload;
          if (cardIndex !== undefined && isDealer !== undefined) {
            addFlippedIndex(cardIndex, isDealer);
          }
          break;
        }

        case 'reveal_result': {
          const { result } = item.payload;
          if (result) {
            setLastGameResult(result);
            setGamePhase('showing_result');
          }
          break;
        }

        case 'pause': {
          break;
        }
      }

      markItemProcessed(item.id);
    },
    [addVisibleCard, addFlippedIndex, markItemProcessed, setLastGameResult, setGamePhase]
  );

  // Process the queue sequentially
  const processQueue = useCallback(
    (startVersion: number) => {
      const state = useGameStore.getState();

      // ⚡ FIX: Abort if queue was reset (version changed)
      if (queueVersionRef.current !== startVersion) {
        logger.log('[AnimationProcessor] Queue reset detected, aborting');
        isProcessingLoopActiveRef.current = false;
        return;
      }

      const unprocessedItems = state.animationQueue.filter(
        (i) => !i.processed && !processedItemsRef.current.has(i.id)
      );

      if (unprocessedItems.length === 0) {
        setProcessingQueue(false);
        isProcessingLoopActiveRef.current = false;

        // ⚡ PHASE TRACKING: Transition to player_turn when dealing animation completes
        const currentPhase = useGameStore.getState().gamePhase;
        if (currentPhase === 'dealing_initial' || currentPhase === 'waiting_vrf') {
          setGamePhase('player_turn');
        }

        logger.log('[AnimationProcessor] Queue complete');
        return;
      }

      const nextItem = unprocessedItems[0];

      processingTimeoutRef.current = setTimeout(() => {
        processItem(nextItem);

        setTimeout(() => {
          processQueue(startVersion);
        }, 50);
      }, nextItem.delayMs);
    },
    [processItem, setProcessingQueue]
  );

  // Watch for new queue items
  useEffect(() => {
    const unprocessedCount = animationQueue.filter(
      (i) => !i.processed && !processedItemsRef.current.has(i.id)
    ).length;

    // ⚡ FIX: Only start if not already in a processing loop
    if (unprocessedCount > 0 && !isProcessingQueue && !isProcessingLoopActiveRef.current) {
      logger.log('[AnimationProcessor] Starting queue processing, items:', unprocessedCount);
      isProcessingLoopActiveRef.current = true;
      setProcessingQueue(true);
      processQueue(queueVersionRef.current);
    }
  }, [animationQueue, isProcessingQueue, processQueue, setProcessingQueue]);

  // ⚡ FIX: Listen for queue reset to clear local state
  useEffect(() => {
    // If queue is empty, clear our local tracking
    if (animationQueue.length === 0) {
      processedItemsRef.current.clear();
      queueVersionRef.current += 1;
      isProcessingLoopActiveRef.current = false;

      // Clear any pending timeouts
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }
  }, [animationQueue.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      if (currentTimelineRef.current) {
        currentTimelineRef.current.kill();
      }
    };
  }, []);

  // Return current state for debugging/UI
  return {
    queueLength: animationQueue.length,
    unprocessedCount: animationQueue.filter((i) => !i.processed).length,
    isProcessing: isProcessingQueue,
    gamePhase,
  };
}

// =============================================================================
// HELPER: Calculate hand value from visible flipped cards
// =============================================================================

/**
 * Calculate blackjack hand value from card indices.
 * Card index format: 0-51 where (index % 13) gives rank (0=Ace, 1=2, ..., 12=King)
 */
export function calculateHandValue(cards: number[]): number {
  let total = 0;
  let aces = 0;

  for (const cardIndex of cards) {
    const rank = cardIndex % 13;

    if (rank === 0) {
      // Ace - count as 11 initially
      total += 11;
      aces += 1;
    } else if (rank >= 10) {
      // Face cards (J, Q, K)
      total += 10;
    } else {
      // Number cards (2-10)
      total += rank + 1;
    }
  }

  // Reduce aces from 11 to 1 if busting
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}
