/**
 * AnimationController Tests (TDD)
 *
 * Tests for GSAP animation wrapper.
 * Note: GSAP is mocked in setup.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationController } from '../AnimationController';
import type { CardPosition, AnimationTiming } from '../types';

describe('AnimationController', () => {
    let controller: AnimationController;

    beforeEach(() => {
        controller = new AnimationController();
    });

    describe('Initialization', () => {
        it('creates controller instance', () => {
            expect(controller).toBeDefined();
        });

        it('starts with zero active timelines', () => {
            expect(controller.getActiveCount()).toBe(0);
        });
    });

    describe('Deal Animation', () => {
        it('animates deal and returns timeline', () => {
            const card = document.createElement('div');
            const from: CardPosition = { x: 0, y: -200, rotation: -180, scale: 0.7 };
            const to: CardPosition = { x: 100, y: 0, rotation: 0, scale: 1 };

            const timeline = controller.animateDeal(card, from, to, 0);

            expect(timeline).toBeDefined();
        });

        it('increments active count during animation', () => {
            const card = document.createElement('div');
            const from: CardPosition = { x: 0, y: -200, rotation: -180, scale: 0.7 };
            const to: CardPosition = { x: 100, y: 0, rotation: 0, scale: 1 };

            controller.animateDeal(card, from, to, 0);

            expect(controller.getActiveCount()).toBe(1);
        });

        it('supports delay parameter', () => {
            const card = document.createElement('div');
            const from: CardPosition = { x: 0, y: 0, rotation: 0, scale: 1 };
            const to: CardPosition = { x: 100, y: 0, rotation: 0, scale: 1 };

            const timeline = controller.animateDeal(card, from, to, 0.5);

            expect(timeline).toBeDefined();
        });
    });

    describe('Flip Animation', () => {
        it('animates flip and returns timeline', () => {
            const card = document.createElement('div');
            const onMidpoint = vi.fn();

            const timeline = controller.animateFlip(card, onMidpoint);

            expect(timeline).toBeDefined();
        });
    });

    describe('Result Animations', () => {
        it('animates win celebration', () => {
            const cards = [document.createElement('div'), document.createElement('div')];

            const timeline = controller.animateWin(cards);

            expect(timeline).toBeDefined();
        });

        it('animates lose effect', () => {
            const cards = [document.createElement('div')];

            const timeline = controller.animateLose(cards);

            expect(timeline).toBeDefined();
        });
    });

    describe('Control Methods', () => {
        it('kills all active timelines', () => {
            const card1 = document.createElement('div');
            const card2 = document.createElement('div');
            const from: CardPosition = { x: 0, y: 0, rotation: 0, scale: 1 };
            const to: CardPosition = { x: 100, y: 0, rotation: 0, scale: 1 };

            controller.animateDeal(card1, from, to, 0);
            controller.animateDeal(card2, from, to, 0.3);

            expect(controller.getActiveCount()).toBe(2);

            controller.killAll();

            expect(controller.getActiveCount()).toBe(0);
        });

        it('pause stops animations', () => {
            controller.pause();
            // Should not throw
            expect(true).toBe(true);
        });

        it('resume continues animations', () => {
            controller.pause();
            controller.resume();
            // Should not throw
            expect(true).toBe(true);
        });
    });

    describe('Timing Configuration', () => {
        it('accepts custom timing', () => {
            const timing: AnimationTiming = {
                dealDuration: 0.5,
                dealStagger: 0.2,
                flipDuration: 0.3,
                winCelebration: 0.4,
                loseShake: 0.3,
            };

            const controller2 = new AnimationController(timing);
            expect(controller2).toBeDefined();
        });
    });
});
