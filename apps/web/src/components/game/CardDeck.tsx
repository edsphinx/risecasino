/**
 * CardDeck - Visual deck of cards component
 * Shows a 3D stack of cards from which cards are dealt
 *
 * ⚡ Registers its position with animation system so cards
 *    animate FROM the actual deck location.
 */

import { useRef, useEffect } from 'preact/hooks';
import { registerDeckElement } from '@/lib/animations';

interface CardDeckProps {
  isDealing?: boolean;
  cardsDealt?: number;
}

export function CardDeck({ isDealing = false, cardsDealt = 0 }: CardDeckProps) {
  const deckRef = useRef<HTMLDivElement>(null);

  // ⚡ Register deck element for card dealing animations
  useEffect(() => {
    registerDeckElement(deckRef.current);

    // Cleanup on unmount
    return () => registerDeckElement(null);
  }, []);

  // Thick deck that depletes as cards are dealt (52 card deck visual)
  const visibleCards = Math.max(6, 20 - Math.floor(cardsDealt / 2));

  return (
    <div ref={deckRef} className={`card-deck ${isDealing ? 'dealing' : ''}`}>
      {/* Render stacked cards */}
      {Array.from({ length: visibleCards }).map((_, i) => (
        <div key={i} className="deck-card" style={`--card-index: ${i}`} />
      ))}

      {/* Deck label */}
      <div className="deck-label">DECK</div>
    </div>
  );
}
