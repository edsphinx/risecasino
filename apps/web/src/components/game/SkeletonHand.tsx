/**
 * SkeletonHand - Placeholder cards during dealing anticipation
 *
 * Shows face-down cards with shimmer animation while waiting for real cards.
 * Creates anticipation and eliminates "empty screen" during dealing.
 */

import './styles/skeleton-hand.css';

interface SkeletonHandProps {
  cardCount?: number;
  isDealer?: boolean;
}

export function SkeletonHand({ cardCount = 2, isDealer = false }: SkeletonHandProps) {
  return (
    <div className={`skeleton-hand ${isDealer ? 'dealer' : 'player'}`}>
      {Array.from({ length: cardCount }).map((_, index) => (
        <div key={index} className="skeleton-card" style={{ animationDelay: `${index * 100}ms` }}>
          <div className="skeleton-card-inner">
            <img
              src="/assets/cards/RB.svg"
              alt="Card back"
              className="skeleton-card-image"
              draggable={false}
            />
            <div className="skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
