/**
 * Card Animations
 *
 * Smooth, satisfying card animations for dealing and revealing.
 */

import gsap from 'gsap';
import { createTimeline, EASINGS } from './gsap.service';

/**
 * Animate a card being dealt from the deck
 */
export function animateCardDeal(
    cardElement: Element,
    index = 0,
    isDealer = false
): gsap.core.Tween {
    const startX = isDealer ? -200 : 200;
    const startY = -150;
    const startRotation = isDealer ? -15 : 15;

    return gsap.fromTo(
        cardElement,
        {
            x: startX,
            y: startY,
            rotation: startRotation,
            opacity: 0,
            scale: 0.8,
        },
        {
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            scale: 1,
            duration: 0.5,
            delay: index * 0.15,
            ease: EASINGS.bounceIn,
        }
    );
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
