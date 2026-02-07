/**
 * HiddenCard Component
 *
 * ⚠️ SECURITY: This component shows ONLY a card back.
 * NO card information exists in the DOM - the cardIndex is not passed,
 * so it's impossible to see the hidden card value.
 *
 * ⚡ ANIMATIONS: Uses GSAP for dealing animation.
 */

import { useRef, useEffect } from 'preact/hooks';
import { getCardBackUrl } from '@/lib/cards';
import { animateCardDeal } from '@/lib/animations';

interface HiddenCardProps {
  /** Index in deal sequence for stagger timing */
  dealIndex?: number;
  /** Callback when deal animation completes */
  onDealComplete?: () => void;
  /** Delay before animation starts */
  delay?: number;
  /** Whether card is being dealt */
  isNew?: boolean;
}

export function HiddenCard({
  dealIndex = 0,
  onDealComplete,
  delay = 0,
  isNew = false,
}: HiddenCardProps) {
  const cardBackUrl = getCardBackUrl();
  const cardRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  // ⚡ GSAP: Deal animation
  useEffect(() => {
    if (isNew && cardRef.current && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;

      const timeout = setTimeout(() => {
        if (cardRef.current) {
          const tween = animateCardDeal(cardRef.current, dealIndex, true);
          if (onDealComplete) {
            tween.eventCallback('onComplete', onDealComplete);
          }
        }
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [isNew, dealIndex, delay, onDealComplete]);

  return (
    <div ref={cardRef} className="playing-card" style={{ opacity: isNew ? 0 : 1 }}>
      {/* Only card back - NO front, NO card info */}
      <div className="card-inner" style={{ transform: 'rotateY(180deg)' }}>
        <div className="card-front">{/* Empty - never shows */}</div>
        <div className="card-back">
          <img
            src={cardBackUrl}
            alt="Hidden card"
            className="card-image"
            loading="lazy"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
