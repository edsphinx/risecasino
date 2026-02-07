/**
 * Animations Index
 *
 * Central export for all animation utilities.
 * Components should only import from this file.
 */

// Core service
export {
    createTimeline,
    EASINGS,
    fadeScaleIn,
    fadeScaleOut,
    slideUp,
    shake,
    pulse,
    buttonPress,
    cardDeal,
    cardFlip,
    countUp,
    killAnimationsOn,
    killAll,
} from './gsap.service';

// Overlay animations
export {
    animateOverlayEnter,
    animateOverlayExit,
    killOverlayAnimations,
    animateButtonPress,
    animateConfetti,
} from './overlay-animations';

// Card animations
export {
    animateCardDeal,
    animateCardsDeal,
    animateCardFlip,
    animateCardHover,
    animateCardHoverOut,
    animateWinningHand,
    animateLosingHand,
    registerDeckElement,
} from './card-animations';
