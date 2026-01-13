/**
 * PlayingCard Component
 *
 * Displays a playing card with flip animation.
 * ⚡ ANIMATIONS: Powered by GSAP for smooth card dealing and flipping
 */

import type { PlayingCardProps } from '@vyrejack/shared';
import { useRef, useEffect } from 'preact/hooks';
import { getCardDisplay, getCardImageUrl, getCardBackUrl } from '@/lib/cards';
import { animateCardDeal, animateCardFlip } from '@/lib/animations';

interface EnhancedPlayingCardProps extends PlayingCardProps {
  /** Card is dealing from deck - starts off-screen */
  isDealing?: boolean;
  /** Index in deal sequence for stagger timing */
  dealIndex?: number;
  /** Whether this is a dealer card (affects animation direction) */
  isDealer?: boolean;
  /** Callback when deal animation completes */
  onDealComplete?: () => void;
}

export function PlayingCard({
  cardIndex,
  faceUp = true,
  delay = 0,
  isNew = false,
  isDealing = false,
  dealIndex = 0,
  isDealer = false,
  onDealComplete,
}: EnhancedPlayingCardProps) {
  const { rank, suit } = getCardDisplay(cardIndex);
  const cardImageUrl = getCardImageUrl(cardIndex);
  const cardBackUrl = getCardBackUrl();

  const cardRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const wasFlippedRef = useRef(!faceUp);

  // Update ref when faceUp changes - if it was face-down before, mark as was-flipped
  useEffect(() => {
    if (!faceUp) {
      wasFlippedRef.current = true;
    }
  }, [faceUp]);

  // ⚡ GSAP: Deal animation on mount
  useEffect(() => {
    if ((isNew || isDealing) && cardRef.current && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;

      // Small delay to ensure DOM is ready
      const timeout = setTimeout(() => {
        if (cardRef.current) {
          const tween = animateCardDeal(cardRef.current, dealIndex, isDealer);

          // Call onDealComplete when animation finishes
          if (onDealComplete) {
            tween.eventCallback('onComplete', onDealComplete);
          }
        }
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [isNew, isDealing, dealIndex, isDealer, delay, onDealComplete]);

  // ⚡ GSAP: Flip animation when card is revealed
  useEffect(() => {
    if (wasFlippedRef.current && faceUp && cardRef.current) {
      const cardInner = cardRef.current.querySelector('.card-inner');
      if (cardInner) {
        animateCardFlip(cardInner);
      }
    }
  }, [faceUp]);

  // Build class string
  const innerClasses = `card-inner ${!faceUp ? 'flipped' : ''} ${wasFlippedRef.current && faceUp ? 'was-flipped' : ''}`;

  return (
    <div
      ref={cardRef}
      className="playing-card"
      style={{ opacity: isNew || isDealing ? 0 : 1 }}
    >
      <div className={innerClasses}>
        {/* Card Front - PNG Image */}
        <div className="card-front">
          <img
            src={cardImageUrl}
            alt={`${rank} of ${suit}`}
            className="card-image"
            loading="lazy"
            draggable={false}
          />
        </div>

        {/* Card Back - PNG Image */}
        <div className="card-back">
          <img
            src={cardBackUrl}
            alt="Card back"
            className="card-image"
            loading="lazy"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
