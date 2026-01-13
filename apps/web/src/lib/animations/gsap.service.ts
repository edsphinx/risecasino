/**
 * GSAP Animation Service
 *
 * Centralized animation factory for casino-quality transitions.
 * This layer abstracts GSAP - to swap libraries, only change this file.
 *
 * ⚡ ARCHITECTURE:
 * - Factory pattern for timelines
 * - Preset easing curves for consistency
 * - Components never import GSAP directly
 */

import gsap from 'gsap';

// =============================================================================
// EASING PRESETS
// =============================================================================

export const EASINGS = {
    // Smooth entrance with slight overshoot
    bounceIn: 'back.out(1.4)',
    // Quick snap for button presses
    snapOut: 'power2.out',
    // Smooth fade
    smooth: 'power2.inOut',
    // Elastic for wins/celebrations
    elastic: 'elastic.out(1, 0.5)',
    // Sharp for losses
    shake: 'power4.inOut',
} as const;

// =============================================================================
// TIMELINE FACTORY
// =============================================================================

export function createTimeline(options?: gsap.TimelineVars): gsap.core.Timeline {
    return gsap.timeline(options);
}

// =============================================================================
// ANIMATION PRESETS
// =============================================================================

/**
 * Fade in with scale (entrance animation)
 */
export function fadeScaleIn(
    target: gsap.TweenTarget,
    duration = 0.4
): gsap.core.Tween {
    return gsap.fromTo(
        target,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration, ease: EASINGS.bounceIn }
    );
}

/**
 * Fade out with scale (exit animation)
 */
export function fadeScaleOut(
    target: gsap.TweenTarget,
    duration = 0.3
): gsap.core.Tween {
    return gsap.to(target, {
        opacity: 0,
        scale: 0.95,
        duration,
        ease: EASINGS.smooth,
    });
}

/**
 * Slide up entrance
 */
export function slideUp(
    target: gsap.TweenTarget,
    distance = 30,
    duration = 0.5
): gsap.core.Tween {
    return gsap.fromTo(
        target,
        { opacity: 0, y: distance },
        { opacity: 1, y: 0, duration, ease: EASINGS.bounceIn }
    );
}

/**
 * Shake animation (for losses)
 */
export function shake(
    target: gsap.TweenTarget,
    intensity = 8
): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(target, { x: -intensity, duration: 0.08 })
        .to(target, { x: intensity, duration: 0.08 })
        .to(target, { x: -intensity / 2, duration: 0.08 })
        .to(target, { x: intensity / 2, duration: 0.08 })
        .to(target, { x: 0, duration: 0.08 });
    return tl;
}

/**
 * Pulse animation (continuous)
 */
export function pulse(
    target: gsap.TweenTarget,
    scale = 1.1
): gsap.core.Tween {
    return gsap.to(target, {
        scale,
        duration: 0.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });
}

/**
 * Button press feedback
 */
export function buttonPress(target: gsap.TweenTarget): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(target, { scale: 0.95, duration: 0.1, ease: EASINGS.snapOut })
        .to(target, { scale: 1, duration: 0.15, ease: EASINGS.bounceIn });
    return tl;
}

/**
 * Card deal animation (fly in from deck)
 */
export function cardDeal(
    target: gsap.TweenTarget,
    index = 0
): gsap.core.Tween {
    return gsap.fromTo(
        target,
        {
            x: 200,
            y: -100,
            rotation: 15,
            opacity: 0,
        },
        {
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            duration: 0.4,
            delay: index * 0.15,
            ease: EASINGS.bounceIn,
        }
    );
}

/**
 * Card flip animation
 */
export function cardFlip(target: gsap.TweenTarget): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(target, { rotateY: 90, duration: 0.15, ease: 'power1.in' })
        .to(target, { rotateY: 0, duration: 0.15, ease: 'power1.out' });
    return tl;
}

/**
 * Counter animation (number counting up)
 */
export function countUp(
    target: gsap.TweenTarget,
    endValue: number,
    duration = 0.6
): gsap.core.Tween {
    return gsap.to(target, {
        textContent: endValue,
        duration,
        snap: { textContent: 1 },
        ease: 'power1.out',
    });
}

// =============================================================================
// KILL HELPERS
// =============================================================================

export function killAnimationsOn(target: gsap.TweenTarget): void {
    gsap.killTweensOf(target);
}

export function killAll(): void {
    gsap.globalTimeline.clear();
}
