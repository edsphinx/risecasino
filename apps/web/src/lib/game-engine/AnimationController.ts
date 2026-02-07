/**
 * AnimationController - GSAP Animation Wrapper
 *
 * Wraps GSAP for game animations with proper lifecycle management.
 * Handles deal, flip, win/lose animations with cleanup.
 *
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import gsap from 'gsap';
import type { CardPosition, AnimationTiming } from './types';
import { TIMING_PRESETS } from './types';

/**
 * Mock timeline interface for testing compatibility
 */
interface GSAPTimeline {
    to: (
        target: HTMLElement | HTMLElement[],
        vars: gsap.TweenVars
    ) => GSAPTimeline;
    call: (callback: () => void) => GSAPTimeline;
    kill: () => void;
    pause: () => void;
    resume: () => void;
}

/**
 * AnimationController class
 *
 * Manages all GSAP animations for the game engine.
 */
export class AnimationController {
    private timing: AnimationTiming;
    private activeTimelines: GSAPTimeline[];

    constructor(timing?: AnimationTiming) {
        this.timing = timing || TIMING_PRESETS.normal;
        this.activeTimelines = [];
    }

    // =========================================================================
    // DEAL ANIMATION
    // =========================================================================

    /**
     * Animate card dealing from deck to position
     */
    animateDeal(
        card: HTMLElement,
        from: CardPosition,
        to: CardPosition,
        delay: number
    ): GSAPTimeline {
        // Set initial position
        gsap.set(card, {
            x: from.x,
            y: from.y,
            rotation: from.rotation,
            scale: from.scale,
            opacity: 0,
        });

        // Create timeline
        const tl = gsap.timeline() as unknown as GSAPTimeline;

        // Animate to target
        tl.to(card, {
            x: to.x,
            y: to.y,
            rotation: to.rotation,
            scale: to.scale,
            opacity: 1,
            duration: this.timing.dealDuration,
            delay: delay,
            ease: 'power2.out',
        });

        this.activeTimelines.push(tl);
        return tl;
    }

    // =========================================================================
    // FLIP ANIMATION
    // =========================================================================

    /**
     * Animate card flip with midpoint callback
     */
    animateFlip(card: HTMLElement, onMidpoint: () => void): GSAPTimeline {
        const tl = gsap.timeline() as unknown as GSAPTimeline;
        const halfDuration = this.timing.flipDuration / 2;

        // First half - rotate to 90 degrees
        tl.to(card, {
            rotateY: 90,
            duration: halfDuration,
            ease: 'power2.in',
        });

        // Midpoint callback
        tl.call(onMidpoint);

        // Second half - rotate to 0
        tl.to(card, {
            rotateY: 0,
            duration: halfDuration,
            ease: 'power2.out',
        });

        this.activeTimelines.push(tl);
        return tl;
    }

    // =========================================================================
    // RESULT ANIMATIONS
    // =========================================================================

    /**
     * Animate win celebration
     */
    animateWin(cards: HTMLElement[]): GSAPTimeline {
        const tl = gsap.timeline() as unknown as GSAPTimeline;

        tl.to(cards, {
            scale: 1.1,
            duration: this.timing.winCelebration / 2,
            ease: 'power2.out',
            stagger: 0.1,
        });

        tl.to(cards, {
            scale: 1,
            duration: this.timing.winCelebration / 2,
            ease: 'power2.in',
        });

        this.activeTimelines.push(tl);
        return tl;
    }

    /**
     * Animate lose effect (shake)
     */
    animateLose(cards: HTMLElement[]): GSAPTimeline {
        const tl = gsap.timeline() as unknown as GSAPTimeline;

        tl.to(cards, {
            x: '+=10',
            duration: this.timing.loseShake / 4,
            ease: 'power2.inOut',
        });

        tl.to(cards, {
            x: '-=20',
            duration: this.timing.loseShake / 4,
            ease: 'power2.inOut',
        });

        tl.to(cards, {
            x: '+=10',
            duration: this.timing.loseShake / 4,
            ease: 'power2.inOut',
        });

        this.activeTimelines.push(tl);
        return tl;
    }

    /**
     * Animate bust effect (shake + slight red tint fade)
     * Used when player or dealer busts (exceeds 21)
     */
    animateBust(cards: HTMLElement[]): GSAPTimeline {
        const tl = gsap.timeline() as unknown as GSAPTimeline;

        // Shake animation similar to lose
        tl.to(cards, {
            x: '+=8',
            duration: this.timing.loseShake / 6,
            ease: 'power2.inOut',
        });

        tl.to(cards, {
            x: '-=16',
            duration: this.timing.loseShake / 6,
            ease: 'power2.inOut',
        });

        tl.to(cards, {
            x: '+=16',
            duration: this.timing.loseShake / 6,
            ease: 'power2.inOut',
        });

        tl.to(cards, {
            x: '-=8',
            opacity: 0.7,
            duration: this.timing.loseShake / 6,
            ease: 'power2.out',
        });

        this.activeTimelines.push(tl);
        return tl;
    }

    // =========================================================================
    // CONTROL METHODS
    // =========================================================================

    /**
     * Pause all active animations
     */
    pause(): void {
        this.activeTimelines.forEach((tl) => tl.pause());
    }

    /**
     * Resume all paused animations
     */
    resume(): void {
        this.activeTimelines.forEach((tl) => tl.resume());
    }

    /**
     * Kill all active timelines and clear the list
     */
    killAll(): void {
        this.activeTimelines.forEach((tl) => tl.kill());
        this.activeTimelines = [];
    }

    // =========================================================================
    // STATE ACCESS
    // =========================================================================

    /**
     * Get count of active timelines
     */
    getActiveCount(): number {
        return this.activeTimelines.length;
    }
}
