/**
 * CardDeck - Visual deck of cards component
 * Shows a 3D stack of cards from which cards are dealt
 */


interface CardDeckProps {
  isDealing?: boolean;
  cardsDealt?: number;
}

export function CardDeck({ isDealing = false, cardsDealt = 0 }: CardDeckProps) {
  // Thick deck that depletes as cards are dealt (52 card deck visual)
  const visibleCards = Math.max(6, 20 - Math.floor(cardsDealt / 2));

  return (
    <div className={`card-deck ${isDealing ? 'dealing' : ''}`}>
      {/* Render stacked cards */}
      {Array.from({ length: visibleCards }).map((_, i) => (
        <div key={i} className="deck-card" style={`--card-index: ${i}`} />
      ))}

      {/* Deck label */}
      <div className="deck-label">DECK</div>
    </div>
  );
}
