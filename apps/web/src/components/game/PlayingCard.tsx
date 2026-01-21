/**
 * PlayingCard Component
 *
 * Displays a playing card with flip animation.
 * ⚡ ANIMATIONS: 100% GSAP - no CSS transitions
 *
 * ⚠️ SECURITY: Hidden cards never show front image.
 * useLayoutEffect + GSAP ensures no flash before paint.
 */

import type { PlayingCardProps } from '@vyrejack/shared';
import { useRef, useEffect, useState, useLayoutEffect } from 'preact/hooks';
import gsap from 'gsap';
import { getCardDisplay, getCardImageUrl, getCardBackUrl } from '@/lib/cards';
import { animateCardDeal } from '@/lib/animations';

interface EnhancedPlayingCardProps extends PlayingCardProps {
  isDealing?: boolean;
  dealIndex?: number;
  isDealer?: boolean;
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
  const cardInnerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const wasFlippedRef = useRef(!faceUp);

  // ⚠️ SECURITY: Front image only rendered when face-up
  const [showFront, setShowFront] = useState(faceUp);

  // ⚡ GSAP: Set initial state BEFORE paint using useLayoutEffect
  useLayoutEffect(() => {
    if (cardInnerRef.current && !faceUp) {
      // Card starts face-down: rotate 180deg immediately
      gsap.set(cardInnerRef.current, { rotateY: 180 });
    }
  }, []);

  // Track when card was previously flipped
  useEffect(() => {
    if (!faceUp) {
      wasFlippedRef.current = true;
    }
  }, [faceUp]);

  // ⚡ GSAP: Deal animation
  useEffect(() => {
    if ((isNew || isDealing) && cardRef.current && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;

      const timeout = setTimeout(() => {
        if (cardRef.current) {
          const tween = animateCardDeal(cardRef.current, dealIndex, isDealer);
          if (onDealComplete) {
            tween.eventCallback('onComplete', onDealComplete);
          }
        }
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [isNew, isDealing, dealIndex, isDealer, delay, onDealComplete]);

  // ⚡ GSAP: Flip animation when revealed
  useEffect(() => {
    if (wasFlippedRef.current && faceUp && cardInnerRef.current) {
      const tl = gsap.timeline();

      // First half: rotate 180 -> 90
      tl.to(cardInnerRef.current, {
        rotateY: 90,
        duration: 0.2,
        ease: 'power1.in',
      });

      // Midpoint: add front image
      tl.call(() => setShowFront(true));

      // Second half: rotate 90 -> 0
      tl.to(cardInnerRef.current, {
        rotateY: 0,
        duration: 0.2,
        ease: 'power1.out',
      });
    }
  }, [faceUp]);

  return (
    <div ref={cardRef} className="playing-card" style={{ opacity: isNew || isDealing ? 0 : 1 }}>
      {/* ⚡ GSAP will animate from here, but inline style guarantees initial state */}
      <div
        ref={cardInnerRef}
        className="card-inner"
        style={{ transform: showFront ? 'rotateY(0deg)' : 'rotateY(180deg)' }}
      >
        <div className="card-front">
          {showFront && (
            <img
              src={cardImageUrl}
              alt={`${rank} of ${suit}`}
              className="card-image"
              loading="eager"
              draggable={false}
            />
          )}
        </div>
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
