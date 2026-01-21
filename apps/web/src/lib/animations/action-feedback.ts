/**
 * Action Button Feedback Animations
 * 
 * Immediate visual feedback when player presses action buttons.
 * These run BEFORE VRF completes to "entertain" while waiting.
 */

import gsap from 'gsap';
import { ANIMATION_TIMING } from '@/config/animationTiming';

// =============================================================================
// HIT BUTTON FEEDBACK
// =============================================================================

/**
 * Immediate feedback when player presses Hit.
 * - Pulse glow on player hand area
 * - Deck emits subtle glow
 */
export function animateHitFeedback(
    playerHandArea: HTMLElement | null,
    deckElement: HTMLElement | null
): gsap.core.Timeline {
    const { handPulseDurationMs, cardGlowMs } = ANIMATION_TIMING.actionFeedback.hit;
    const tl = gsap.timeline();

    // Pulse glow on player hand area
    if (playerHandArea) {
        tl.to(playerHandArea, {
            boxShadow: '0 0 25px 8px rgba(59, 130, 246, 0.6)',
            duration: handPulseDurationMs / 1000 / 2,
            ease: 'power2.out',
        })
            .to(playerHandArea, {
                boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)',
                duration: handPulseDurationMs / 1000 / 2,
                ease: 'power2.in',
            });
    }

    // Deck glow
    if (deckElement) {
        tl.to(deckElement, {
            filter: 'brightness(1.4) drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))',
            duration: cardGlowMs / 1000,
            ease: 'power2.out',
        }, 0)
            .to(deckElement, {
                filter: 'brightness(1) drop-shadow(0 0 0 transparent)',
                duration: cardGlowMs / 1000,
                ease: 'power2.in',
            });
    }

    return tl;
}

// =============================================================================
// STAND BUTTON FEEDBACK
// =============================================================================

/**
 * Immediate feedback when player presses Stand.
 * - Player hand "locks" (slight shrink + desaturate)
 * - Focus shifts to dealer (spotlight glow)
 */
export function animateStandFeedback(
    playerHandArea: HTMLElement | null,
    dealerArea: HTMLElement | null
): gsap.core.Timeline {
    const { handLockDurationMs, focusShiftMs } = ANIMATION_TIMING.actionFeedback.stand;
    const tl = gsap.timeline();

    // "Lock" effect on player hand
    if (playerHandArea) {
        tl.to(playerHandArea, {
            scale: 0.97,
            filter: 'saturate(0.7) brightness(0.95)',
            duration: handLockDurationMs / 1000 / 2,
            ease: 'power2.out',
        })
            .to(playerHandArea, {
                scale: 1,
                filter: 'saturate(1) brightness(1)',
                duration: handLockDurationMs / 1000 / 2,
                ease: 'power2.in',
            });
    }

    // Shift focus to dealer (golden spotlight)
    if (dealerArea) {
        tl.to(dealerArea, {
            boxShadow: '0 0 40px 15px rgba(234, 179, 8, 0.3)',
            duration: focusShiftMs / 1000,
            ease: 'power2.out',
        }, handLockDurationMs / 1000 * 0.3);

        // Keep spotlight for a bit then fade
        tl.to(dealerArea, {
            boxShadow: '0 0 0 0 rgba(234, 179, 8, 0)',
            duration: focusShiftMs / 1000 * 0.5,
            ease: 'power2.in',
            delay: 0.5,
        });
    }

    return tl;
}

// =============================================================================
// DOUBLE BUTTON FEEDBACK
// =============================================================================

/**
 * Immediate feedback when player presses Double.
 * - Chip stack visually doubles
 * - Bet amount flashes green
 * - Card area shows anticipation glow
 */
export function animateDoubleFeedback(
    chipDisplay: HTMLElement | null,
    betAmountElement: HTMLElement | null,
    playerHandArea: HTMLElement | null
): gsap.core.Timeline {
    const { chipStackMs, cardAnticipationMs } = ANIMATION_TIMING.actionFeedback.double;
    const tl = gsap.timeline();

    // Chip stack "double" pulse
    if (chipDisplay) {
        tl.to(chipDisplay, {
            scale: 1.3,
            duration: chipStackMs / 1000 * 0.4,
            ease: 'back.out(1.7)',
        })
            .to(chipDisplay, {
                scale: 1,
                duration: chipStackMs / 1000 * 0.6,
                ease: 'elastic.out(1, 0.5)',
            });
    }

    // Bet amount flash green
    if (betAmountElement) {
        const originalColor = getComputedStyle(betAmountElement).color;
        tl.to(betAmountElement, {
            color: '#22c55e',
            textShadow: '0 0 15px rgba(34, 197, 94, 0.7)',
            scale: 1.1,
            duration: chipStackMs / 1000 * 0.4,
            ease: 'power2.out',
        }, 0)
            .to(betAmountElement, {
                color: originalColor,
                textShadow: 'none',
                scale: 1,
                duration: chipStackMs / 1000 * 0.6,
                ease: 'power2.in',
            });
    }

    // Anticipation glow on hand area
    if (playerHandArea) {
        tl.to(playerHandArea, {
            boxShadow: '0 0 30px 12px rgba(34, 197, 94, 0.5)',
            duration: cardAnticipationMs / 1000,
            ease: 'power2.out',
        }, 0.1)
            .to(playerHandArea, {
                boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)',
                duration: cardAnticipationMs / 1000,
                ease: 'power2.in',
            });
    }

    return tl;
}

// =============================================================================
// LET'S GO BUTTON FEEDBACK
// =============================================================================

/**
 * Feedback when player confirms bet and starts game.
 * - Button pulses
 * - Initiates riffle shuffle state
 */
export function animateLetsGoFeedback(
    buttonElement: HTMLElement | null,
    playArea: HTMLElement | null
): gsap.core.Timeline {
    const tl = gsap.timeline();

    // Button confirmation pulse
    if (buttonElement) {
        tl.to(buttonElement, {
            scale: 0.95,
            duration: 0.1,
            ease: 'power2.in',
        })
            .to(buttonElement, {
                scale: 1.05,
                duration: 0.15,
                ease: 'back.out(2)',
            })
            .to(buttonElement, {
                scale: 1,
                duration: 0.1,
                ease: 'power2.out',
            });
    }

    // Play area anticipation glow
    if (playArea) {
        tl.to(playArea, {
            boxShadow: 'inset 0 0 30px 5px rgba(168, 85, 247, 0.3)',
            duration: 0.3,
            ease: 'power2.out',
        }, 0.1)
            .to(playArea, {
                boxShadow: 'inset 0 0 0 0 transparent',
                duration: 0.5,
                ease: 'power2.in',
            });
    }

    return tl;
}

// =============================================================================
// HELPER: Get element refs safely
// =============================================================================

/**
 * Helper to get elements by class name for animations.
 * Returns null if not found (animations handle null gracefully).
 */
export function getAnimationElements() {
    return {
        playerHandArea: document.querySelector('.player-hand-area') as HTMLElement | null,
        dealerArea: document.querySelector('.dealer-hand-area') as HTMLElement | null,
        deckElement: document.querySelector('.card-deck') as HTMLElement | null,
        chipDisplay: document.querySelector('.chip-display') as HTMLElement | null,
        betAmountElement: document.querySelector('.bet-amount') as HTMLElement | null,
        playArea: document.querySelector('.play-area') as HTMLElement | null,
    };
}
