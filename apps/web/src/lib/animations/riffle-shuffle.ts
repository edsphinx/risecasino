/**
 * Riffle Shuffle Animation
 * 
 * Casino-style deck shuffle animation for VRF waiting state.
 * Deck splits into two halves, cards interleave at edges, then push back together.
 */

import gsap from 'gsap';
import { ANIMATION_TIMING, msToSeconds } from '@/config/animationTiming';

// =============================================================================
// TYPES
// =============================================================================

export interface RiffleShuffleElements {
    deckContainer: HTMLElement;
    leftHalf: HTMLElement;
    rightHalf: HTMLElement;
    cardSlivers?: HTMLElement[]; // Optional: individual card slivers for cascade effect
}

// =============================================================================
// RIFFLE SHUFFLE ANIMATION
// =============================================================================

/**
 * Performs one complete riffle shuffle animation cycle.
 * 1. Split deck into two halves
 * 2. Tilt halves inward
 * 3. Interleave cards (cascade effect)
 * 4. Push halves back together
 */
export function animateRiffleShuffle(
    elements: RiffleShuffleElements,
    onComplete?: () => void
): gsap.core.Timeline {
    const {
        splitDurationMs,
        interleaveDurationMs,
        pushTogetherMs,
    } = ANIMATION_TIMING.riffleShuffle;

    const tl = gsap.timeline({ onComplete });

    // 1. Split deck into two halves (slide apart)
    tl.to(elements.leftHalf, {
        x: -25,
        rotateY: 6,
        rotateZ: -3,
        duration: msToSeconds(splitDurationMs),
        ease: 'power2.out',
    })
        .to(elements.rightHalf, {
            x: 25,
            rotateY: -6,
            rotateZ: 3,
            duration: msToSeconds(splitDurationMs),
            ease: 'power2.out',
        }, '<'); // Start at same time

    // 2. Tilt halves inward (preparing for interleave)
    tl.to(elements.leftHalf, {
        y: -15,
        rotateZ: 8,
        duration: 0.2,
        ease: 'power1.inOut',
    })
        .to(elements.rightHalf, {
            y: -15,
            rotateZ: -8,
            duration: 0.2,
            ease: 'power1.inOut',
        }, '<');

    // 3. Interleave motion (bring together with cascade)
    // If we have individual card slivers, animate them
    if (elements.cardSlivers && elements.cardSlivers.length > 0) {
        // Cascade each sliver falling into place
        tl.to(elements.cardSlivers, {
            y: 0,
            opacity: 1,
            stagger: {
                each: 0.015,
                from: 'edges', // Alternate from both sides
            },
            duration: msToSeconds(interleaveDurationMs),
            ease: 'power1.inOut',
        });
    } else {
        // Simple interleave without individual cards
        tl.to([elements.leftHalf, elements.rightHalf], {
            x: 0,
            rotateZ: 0,
            duration: msToSeconds(interleaveDurationMs) * 0.5,
            ease: 'power1.inOut',
        });
    }

    // 4. Push halves back together
    tl.to([elements.leftHalf, elements.rightHalf], {
        x: 0,
        y: 0,
        rotateY: 0,
        rotateZ: 0,
        duration: msToSeconds(pushTogetherMs),
        ease: 'power2.in',
    });

    // Add a satisfying "thump" scale effect at the end
    tl.to(elements.deckContainer, {
        scale: 1.02,
        duration: 0.05,
        ease: 'power2.out',
    })
        .to(elements.deckContainer, {
            scale: 1,
            duration: 0.1,
            ease: 'power2.in',
        });

    return tl;
}

// =============================================================================
// LOOPING SHUFFLE (for VRF waiting)
// =============================================================================

/**
 * Loops the riffle shuffle animation while waiting for VRF.
 * Continues until shouldContinue() returns false.
 * 
 * @param elements - DOM elements for the deck
 * @param shouldContinue - Function that returns true to keep looping
 * @returns Cleanup function to stop the loop
 */
export function loopRiffleShuffle(
    elements: RiffleShuffleElements,
    shouldContinue: () => boolean
): () => void {
    let isRunning = true;
    let currentTimeline: gsap.core.Timeline | null = null;

    const performShuffle = () => {
        if (!isRunning || !shouldContinue()) {
            return;
        }

        currentTimeline = animateRiffleShuffle(elements, () => {
            if (!isRunning || !shouldContinue()) return;

            // Pause between shuffles
            setTimeout(() => {
                performShuffle();
            }, ANIMATION_TIMING.riffleShuffle.pauseBetweenMs);
        });
    };

    // Start the loop
    performShuffle();

    // Return cleanup function
    return () => {
        isRunning = false;
        if (currentTimeline) {
            currentTimeline.kill();
        }
    };
}

// =============================================================================
// SIMPLIFIED SHUFFLE (for use without complex DOM structure)
// =============================================================================

/**
 * Simple pulsing "shuffle" animation for basic deck display.
 * Use when you don't have the full two-half deck structure.
 */
export function animateSimpleShuffle(
    deckElement: HTMLElement,
    onComplete?: () => void
): gsap.core.Timeline {
    const tl = gsap.timeline({ onComplete });

    // Shake and pulse effect
    tl.to(deckElement, {
        x: -3,
        rotation: -2,
        duration: 0.08,
        ease: 'power1.inOut',
    })
        .to(deckElement, {
            x: 3,
            rotation: 2,
            duration: 0.08,
            ease: 'power1.inOut',
        })
        .to(deckElement, {
            x: -2,
            rotation: -1,
            duration: 0.08,
            ease: 'power1.inOut',
        })
        .to(deckElement, {
            x: 2,
            rotation: 1,
            duration: 0.08,
            ease: 'power1.inOut',
        })
        .to(deckElement, {
            x: 0,
            rotation: 0,
            duration: 0.08,
            ease: 'power1.inOut',
        });

    // Scale pulse
    tl.to(deckElement, {
        scale: 1.05,
        duration: 0.15,
        ease: 'power2.out',
    }, 0.1)
        .to(deckElement, {
            scale: 1,
            duration: 0.2,
            ease: 'power2.in',
        });

    return tl;
}

/**
 * Loop simple shuffle animation.
 */
export function loopSimpleShuffle(
    deckElement: HTMLElement,
    shouldContinue: () => boolean
): () => void {
    let isRunning = true;
    let currentTimeline: gsap.core.Timeline | null = null;

    const performShuffle = () => {
        if (!isRunning || !shouldContinue()) {
            return;
        }

        currentTimeline = animateSimpleShuffle(deckElement, () => {
            if (!isRunning || !shouldContinue()) return;

            setTimeout(() => {
                performShuffle();
            }, ANIMATION_TIMING.riffleShuffle.pauseBetweenMs + 300);
        });
    };

    performShuffle();

    return () => {
        isRunning = false;
        if (currentTimeline) {
            currentTimeline.kill();
        }
    };
}
