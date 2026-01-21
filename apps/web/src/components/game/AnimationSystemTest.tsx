/**
 * Animation System Test Component
 *
 * A simple test component to verify the animation queue system works.
 * This can be temporarily added to the game page to test before full integration.
 *
 * DELETE THIS AFTER TESTING
 */

import {
  useGameStore,
  selectGamePhase,
  selectVisiblePlayerCards,
  selectVisibleDealerCards,
  selectFlippedPlayerIndices,
  selectFlippedDealerIndices,
} from '@/stores/gameStore';
import { useAnimationProcessor } from '@/hooks/useAnimationProcessor';
import {
  animateHitFeedback,
  animateStandFeedback,
  animateDoubleFeedback,
} from '@/lib/animations/action-feedback';
import { loopSimpleShuffle } from '@/lib/animations/riffle-shuffle';
import { useRef, useEffect, useState } from 'preact/hooks';

export function AnimationSystemTest() {
  // Use the animation processor hook
  const processorState = useAnimationProcessor();

  // Read from Zustand
  const gamePhase = useGameStore(selectGamePhase);
  const visiblePlayerCards = useGameStore(selectVisiblePlayerCards);
  const visibleDealerCards = useGameStore(selectVisibleDealerCards);
  const flippedPlayerIndices = useGameStore(selectFlippedPlayerIndices);
  const flippedDealerIndices = useGameStore(selectFlippedDealerIndices);

  const {
    setGamePhase,
    queueCardDeal,
    queueCardFlip,
    // queueResult - unused in test
    resetAnimationState,
  } = useGameStore();

  // Refs for animation targets
  const playerAreaRef = useRef<HTMLDivElement>(null);
  const dealerAreaRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const betRef = useRef<HTMLDivElement>(null);

  // Shuffle animation cleanup ref
  const shuffleCleanupRef = useRef<(() => void) | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);

  // Test: Queue initial 4 cards
  const testInitialDeal = () => {
    resetAnimationState();
    setGamePhase('dealing_initial');

    // Queue 4 cards: P1, D1, P2, D2 (hidden)
    queueCardDeal(10, false, false); // Player 1 - face down
    queueCardDeal(15, true, false); // Dealer 1 - face down
    queueCardDeal(22, false, false); // Player 2 - face down
    queueCardDeal(30, true, false); // Dealer 2 - face down (hidden card)

    // After dealing, queue flips
    setTimeout(() => {
      queueCardFlip(0, false); // Flip player card 1
      queueCardFlip(1, false); // Flip player card 2
      queueCardFlip(0, true); // Flip dealer card 1
      // Note: Dealer card 2 stays hidden
    }, 3000);
  };

  // Test: Hit feedback animation
  const testHitFeedback = () => {
    animateHitFeedback(playerAreaRef.current, deckRef.current);
  };

  // Test: Stand feedback animation
  const testStandFeedback = () => {
    animateStandFeedback(playerAreaRef.current, dealerAreaRef.current);
  };

  // Test: Double feedback animation
  const testDoubleFeedback = () => {
    animateDoubleFeedback(chipRef.current, betRef.current, playerAreaRef.current);
  };

  // Test: Riffle shuffle loop
  const toggleShuffle = () => {
    if (isShuffling) {
      // Stop shuffle
      if (shuffleCleanupRef.current) {
        shuffleCleanupRef.current();
        shuffleCleanupRef.current = null;
      }
      setIsShuffling(false);
    } else {
      // Start shuffle
      if (deckRef.current) {
        setIsShuffling(true);
        shuffleCleanupRef.current = loopSimpleShuffle(deckRef.current, () => true);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (shuffleCleanupRef.current) {
        shuffleCleanupRef.current();
      }
    };
  }, []);

  // Card display helper
  const cardToString = (card: number) => {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suit = suits[Math.floor(card / 13)];
    const rank = ranks[card % 13];
    return `${rank}${suit}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.9)',
        border: '2px solid #22c55e',
        borderRadius: '12px',
        padding: '16px',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 9999,
        maxWidth: '400px',
      }}
    >
      <h3 style={{ margin: '0 0 12px 0', color: '#22c55e' }}>🧪 Animation Test Panel</h3>

      {/* State Display */}
      <div
        style={{ marginBottom: '12px', background: '#1a1a1a', padding: '8px', borderRadius: '8px' }}
      >
        <div>
          <strong>Phase:</strong> {gamePhase}
        </div>
        <div>
          <strong>Queue:</strong> {processorState.unprocessedCount}/{processorState.queueLength}{' '}
          items
        </div>
        <div>
          <strong>Processing:</strong> {processorState.isProcessing ? '✅ Yes' : '❌ No'}
        </div>
      </div>

      {/* Visible Cards */}
      <div
        style={{ marginBottom: '12px', background: '#1a1a1a', padding: '8px', borderRadius: '8px' }}
      >
        <div>
          <strong>Player Cards:</strong> [
          {visiblePlayerCards.map((c) => cardToString(c)).join(', ')}]
        </div>
        <div>
          <strong>Flipped P:</strong> [{flippedPlayerIndices.join(', ')}]
        </div>
        <div>
          <strong>Dealer Cards:</strong> [
          {visibleDealerCards.map((c) => cardToString(c)).join(', ')}]
        </div>
        <div>
          <strong>Flipped D:</strong> [{flippedDealerIndices.join(', ')}]
        </div>
      </div>

      {/* Animation Target Areas */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div
          ref={playerAreaRef}
          style={{
            flex: 1,
            background: '#2563eb',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          Player Area
        </div>
        <div
          ref={dealerAreaRef}
          style={{
            flex: 1,
            background: '#dc2626',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          Dealer Area
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div
          ref={deckRef}
          style={{
            flex: 1,
            background: '#7c3aed',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          🎴 Deck
        </div>
        <div
          ref={chipRef}
          style={{
            flex: 1,
            background: '#ea580c',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          💰 Chip
        </div>
        <div
          ref={betRef}
          style={{
            flex: 1,
            background: '#0891b2',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          $100
        </div>
      </div>

      {/* Test Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        <button onClick={testInitialDeal} style={btnStyle}>
          🃏 Test Deal
        </button>
        <button onClick={testHitFeedback} style={btnStyle}>
          👊 Hit Feedback
        </button>
        <button onClick={testStandFeedback} style={btnStyle}>
          ✋ Stand Feedback
        </button>
        <button onClick={testDoubleFeedback} style={btnStyle}>
          ✌️ Double Feedback
        </button>
        <button
          onClick={toggleShuffle}
          style={{ ...btnStyle, background: isShuffling ? '#22c55e' : '#4f46e5' }}
        >
          {isShuffling ? '⏹️ Stop Shuffle' : '🔀 Shuffle'}
        </button>
        <button onClick={resetAnimationState} style={{ ...btnStyle, background: '#dc2626' }}>
          🔄 Reset
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  background: '#4f46e5',
  border: 'none',
  borderRadius: '6px',
  color: 'white',
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 'bold',
};
