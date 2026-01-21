/**
 * Animation Timing Configuration
 * 
 * Centralized timing constants for all game animations.
 * Adjust values here to tune the feel of the entire game.
 */

// =============================================================================
// MAIN CONFIGURATION
// =============================================================================

export const ANIMATION_TIMING = {
    // === CARD DEALING ===
    cardDeal: {
        minDelayMs: 450,        // Minimum delay between cards
        maxDelayMs: 800,        // Maximum delay between cards
        throwDurationMs: 800,   // Card throw animation duration
    },

    // === CARD FLIP ===
    cardFlip: {
        durationMs: 650,        // Flip animation duration
        delayAfterDealMs: 200,  // Delay after card lands before flip
    },

    // === GAME PHASES ===
    phases: {
        resultPauseMs: 3000,    // Pause to see final state before overlay
        overlayEnterMs: 500,    // Overlay fade-in duration
        overlayExitMs: 300,     // Overlay fade-out duration
    },

    // === RIFFLE SHUFFLE (waiting for VRF) ===
    riffleShuffle: {
        splitDurationMs: 400,      // Time to split deck in two
        interleaveDurationMs: 600, // Riffle interleave motion
        pushTogetherMs: 300,       // Push halves back together
        repeatCount: 2,            // Number of shuffle cycles (depends on VRF time)
        pauseBetweenMs: 200,       // Pause between shuffle cycles
    },

    // === ACTION BUTTON FEEDBACK ===
    actionFeedback: {
        hit: {
            handPulseDurationMs: 200,   // Quick pulse on player hand area
            cardGlowMs: 150,            // Card deck glow
        },
        stand: {
            handLockDurationMs: 300,    // Hand "locks" animation
            focusShiftMs: 400,          // Attention shifts to dealer
        },
        double: {
            chipStackMs: 350,           // Chip doubling animation
            cardAnticipationMs: 250,    // Card area anticipation glow
        },
    },

    // === HAND VALUE ANIMATION ===
    handValue: {
        countUpDurationMs: 400,     // Duration of value count-up animation
        flashDurationMs: 200,       // Flash when value changes
    },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a random delay between cards for realistic dealing.
 * Uses the minDelayMs and maxDelayMs from cardDeal config.
 */
export function getRandomCardDelay(): number {
    const { minDelayMs, maxDelayMs } = ANIMATION_TIMING.cardDeal;
    return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
}

/**
 * Get a random value within a range.
 * Useful for adding slight variations to any animation timing.
 */
export function getRandomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Convert milliseconds to seconds for GSAP duration.
 */
export function msToSeconds(ms: number): number {
    return ms / 1000;
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AnimationTimingConfig = typeof ANIMATION_TIMING;
