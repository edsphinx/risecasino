/**
 * Card Animations
 *
 * Smooth, satisfying card animations for dealing and revealing.
 * ⚡ Cards animate FROM the actual deck position for realism.
 */

import gsap from 'gsap';
import { createTimeline, EASINGS } from './gsap.service';

// Store deck element reference for position calculation
let deckElement: Element | null = null;

/**
 * Register the deck element for position reference
 * Call this from CardDeck component on mount
 */
export function registerDeckElement(element: Element | null): void {
    deckElement = element;
}

/**
 * Animate a card being dealt from the deck
 * ⚡ NATURAL THROW: Inspired by CodePen effect - cards "thrown" onto table
 * Uses gsap.timeline for simultaneous position + rotation animation
 */
export function animateCardDeal(
    cardElement: Element,
    index = 0,
    _isDealer = false
): gsap.core.Tween {
    // Calculate start position from actual deck location
    let startX = -200;
    let startY = -200;

    if (deckElement) {
        const deckRect = deckElement.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        startX = deckRect.left + deckRect.width / 2 - cardRect.left - cardRect.width / 2;
        startY = deckRect.top + deckRect.height / 2 - cardRect.top - cardRect.height / 2;
    }

    // ⚡ DRAMATIC SPIN: Card rotates significantly while being "thrown"
    // Like CodePen - cards spin as they fly across the table
    const startRotation = -180 + Math.random() * 360; // -180 to +180 degrees (full spin)

    // ⚡ ORGANIC PLACEMENT: Slight random offset in final position
    // Small enough to not cover previous cards, big enough to look natural
    const endX = -3 + Math.random() * 6;      // -3 to +3 px horizontal
    const endY = -4 + Math.random() * 8;      // -4 to +4 px vertical  
    const endRotation = -3 + Math.random() * 6; // -3 to +3 degrees

    const tl = createTimeline();

    // Set initial state
    gsap.set(cardElement, {
        x: startX,
        y: startY,
        rotation: startRotation,
        opacity: 0,
        scale: 0.7,
    });

    // Show card immediately
    tl.set(cardElement, { opacity: 1 }, index * 0.2);

    // Animate to final position with slight random offset
    tl.to(cardElement, {
        x: endX,
        y: endY,
        scale: 1,
        duration: 0.8,
        ease: 'power2.out',
    }, index * 0.2);

    // Animate rotation simultaneously (slightly shorter for natural feel)
    tl.to(cardElement, {
        rotation: endRotation,
        duration: 0.75,
        ease: 'power2.out',
    }, index * 0.2);

    // Return the timeline as a tween (for compatibility)
    return tl as unknown as gsap.core.Tween;
}

/**
 * Animate multiple cards being dealt with stagger
 */
export function animateCardsDeal(
    cards: Element[],
    isDealer = false
): gsap.core.Timeline {
    const tl = createTimeline();

    cards.forEach((card, index) => {
        tl.add(animateCardDeal(card, index, isDealer), index * 0.15);
    });

    return tl;
}

/**
 * Animate card flip (reveal hidden card)
 */
export function animateCardFlip(cardElement: Element): gsap.core.Timeline {
    const tl = createTimeline();

    // First half of flip (hide current face)
    tl.to(cardElement, {
        rotateY: 90,
        duration: 0.2,
        ease: 'power2.in',
    });

    // Second half of flip (show new face)
    tl.to(cardElement, {
        rotateY: 0,
        duration: 0.2,
        ease: 'power2.out',
    });

    // Add a subtle bounce at the end
    tl.to(cardElement, {
        scale: 1.05,
        duration: 0.1,
        ease: 'power1.out',
    });

    tl.to(cardElement, {
        scale: 1,
        duration: 0.15,
        ease: EASINGS.bounceIn,
    });

    return tl;
}

/**
 * Animate card hover (lift effect)
 */
export function animateCardHover(cardElement: Element): gsap.core.Tween {
    return gsap.to(cardElement, {
        y: -10,
        scale: 1.05,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        duration: 0.2,
        ease: 'power2.out',
    });
}

/**
 * Animate card hover out (return)
 */
export function animateCardHoverOut(cardElement: Element): gsap.core.Tween {
    return gsap.to(cardElement, {
        y: 0,
        scale: 1,
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        duration: 0.2,
        ease: 'power2.out',
    });
}

/**
 * Animate winning hand highlight (lift + scale - glow handled by CSS)
 */
export function animateWinningHand(cards: Element[]): gsap.core.Timeline {
    const tl = createTimeline();

    // Lift all cards with stagger
    tl.to(cards, {
        y: -20,
        scale: 1.1,
        stagger: 0.05,
        duration: 0.35,
        ease: 'power2.out',
    });

    // Small pulse effect
    tl.to(cards, {
        scale: 1.15,
        duration: 0.15,
        ease: 'sine.inOut',
    });
    tl.to(cards, {
        scale: 1.08,
        duration: 0.15,
        ease: 'sine.inOut',
    });

    // Settle back slightly (still elevated)
    tl.to(cards, {
        y: -10,
        scale: 1.05,
        duration: 0.3,
        ease: EASINGS.smooth,
    });

    // Note: glow effect is handled by CSS .hand-winner drop-shadow

    return tl;
}

/**
 * Animate losing hand (subtle shake only - opacity handled by CSS)
 */
export function animateLosingHand(cards: Element[]): gsap.core.Timeline {
    const tl = createTimeline();

    // Quick shake animation (3 shakes)
    tl.to(cards, {
        x: -8,
        duration: 0.06,
        ease: 'power1.inOut',
    });
    tl.to(cards, {
        x: 8,
        duration: 0.06,
        ease: 'power1.inOut',
    });
    tl.to(cards, {
        x: -5,
        duration: 0.05,
        ease: 'power1.inOut',
    });
    tl.to(cards, {
        x: 5,
        duration: 0.05,
        ease: 'power1.inOut',
    });
    tl.to(cards, {
        x: 0,
        duration: 0.08,
        ease: 'power2.out',
    });

    // Note: opacity and grayscale are handled by CSS .hand-loser class

    return tl;
}
