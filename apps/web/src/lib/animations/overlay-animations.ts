/**
 * Overlay Animations
 *
 * Smooth, casino-quality animations for the game result overlay.
 * Uses GSAP timelines for precise sequencing.
 */

import gsap from 'gsap';
import { createTimeline, EASINGS, shake, pulse } from './gsap.service';

// Store active timeline for cleanup
let activeOverlayTimeline: gsap.core.Timeline | null = null;

/**
 * Animate the result overlay entrance
 * Creates a polished, multi-step sequence
 */
export function animateOverlayEnter(
    result: 'win' | 'lose' | 'push' | 'blackjack'
): gsap.core.Timeline {
    // Kill any existing animation
    if (activeOverlayTimeline) {
        activeOverlayTimeline.kill();
    }

    const tl = createTimeline();
    activeOverlayTimeline = tl;

    // 1. Backdrop fade in
    tl.fromTo(
        '.result-backdrop',
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );

    // 2. Content scale in with bounce
    tl.fromTo(
        '.result-content',
        { scale: 0.85, opacity: 0, y: 40 },
        {
            scale: 1,
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: EASINGS.bounceIn,
        },
        '-=0.15'
    );

    // 3. Header elements stagger in
    tl.fromTo(
        '.result-header-emoji',
        { scale: 0, rotation: -180 },
        { scale: 1, rotation: 0, duration: 0.4, ease: EASINGS.elastic },
        '-=0.3'
    );

    tl.fromTo(
        '.result-title',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3, ease: EASINGS.bounceIn },
        '-=0.2'
    );

    // 4. Payout counter animation
    tl.fromTo(
        '.payout-inline',
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3, ease: EASINGS.bounceIn },
        '-=0.15'
    );

    // 5. Cards display
    tl.fromTo(
        '.result-cards',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3, ease: EASINGS.smooth },
        '-=0.1'
    );

    // 6. Stats and buttons
    tl.fromTo(
        '.result-stats, .result-actions-container',
        { opacity: 0, y: 15 },
        {
            opacity: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.1,
            ease: EASINGS.smooth,
        },
        '-=0.15'
    );

    // 7. Result-specific effects
    if (result === 'lose') {
        // Shake on loss
        tl.add(shake('.result-content', 6), '-=0.1');
    } else if (result === 'blackjack' || result === 'win') {
        // Pulse emoji on wins
        tl.add(pulse('.result-header-emoji', 1.15), '+=0');
        // Glow effect on container
        tl.to(
            '.result-content',
            {
                boxShadow: result === 'blackjack'
                    ? '0 0 80px rgba(255, 215, 0, 0.6)'
                    : '0 0 60px rgba(16, 185, 129, 0.5)',
                duration: 0.5,
                ease: 'power2.out',
            },
            '-=0.3'
        );
    }

    return tl;
}

/**
 * Animate the overlay exit
 */
export function animateOverlayExit(): gsap.core.Timeline {
    const tl = createTimeline();

    // Quick fade out with scale
    tl.to('.result-content', {
        scale: 0.95,
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
    });

    tl.to(
        '.result-backdrop',
        { opacity: 0, duration: 0.2, ease: 'power2.in' },
        '-=0.1'
    );

    return tl;
}

/**
 * Kill all overlay animations
 */
export function killOverlayAnimations(): void {
    if (activeOverlayTimeline) {
        activeOverlayTimeline.kill();
        activeOverlayTimeline = null;
    }
    gsap.killTweensOf('.result-overlay, .result-content, .result-backdrop');
}

/**
 * Animate button press with satisfying feedback
 */
export function animateButtonPress(button: Element): gsap.core.Timeline {
    const tl = createTimeline();

    tl.to(button, {
        scale: 0.92,
        duration: 0.08,
        ease: 'power2.out',
    });

    tl.to(button, {
        scale: 1,
        duration: 0.15,
        ease: EASINGS.bounceIn,
    });

    return tl;
}

/**
 * Animate confetti burst for wins
 */
export function animateConfetti(): gsap.core.Timeline {
    const tl = createTimeline();

    // Create confetti container if it doesn't exist
    const container = document.querySelector('.confetti-container');
    if (!container) return tl;

    // Fade in
    tl.fromTo(container, { opacity: 1 }, { opacity: 0, duration: 2.5, delay: 2 });

    return tl;
}
