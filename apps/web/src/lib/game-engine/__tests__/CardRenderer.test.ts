/**
 * CardRenderer Tests (TDD)
 *
 * Tests written BEFORE implementation.
 * Note: Uses JSDOM for DOM testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CardRenderer } from '../CardRenderer';

describe('CardRenderer', () => {
    let renderer: CardRenderer;
    let container: HTMLElement;

    beforeEach(() => {
        // Create test container in JSDOM
        container = document.createElement('div');
        container.id = 'test-container';
        document.body.appendChild(container);

        // Create zone elements that CardRenderer expects
        container.innerHTML = `
      <div class="dealer-zone" data-zone="dealer"></div>
      <div class="deck-area" data-zone="deck"></div>
      <div class="player-zone" data-zone="player"></div>
    `;

        renderer = new CardRenderer('test-container');
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    describe('Initialization', () => {
        it('finds container element', () => {
            expect(renderer).toBeDefined();
        });

        it('finds player zone', () => {
            expect(renderer.getPlayerZone()).toBeDefined();
        });

        it('finds dealer zone', () => {
            expect(renderer.getDealerZone()).toBeDefined();
        });
    });

    describe('Card Creation', () => {
        it('creates card element with correct class', () => {
            const card = renderer.createCard(10, false);
            expect(card.classList.contains('ge-card')).toBe(true);
        });

        it('sets card data attribute', () => {
            const card = renderer.createCard(25, false);
            expect(card.dataset.card).toBe('25');
        });

        it('creates card with unique ID', () => {
            const card1 = renderer.createCard(10, false);
            const card2 = renderer.createCard(20, false);
            expect(card1.id).not.toBe(card2.id);
        });

        it('creates face-down card by default', () => {
            const card = renderer.createCard(10, false);
            expect(card.classList.contains('face-down')).toBe(true);
        });
    });

    describe('Zone Management', () => {
        it('adds card to player zone', () => {
            const card = renderer.createCard(10, false);
            renderer.addToZone(card, false);

            const playerZone = renderer.getPlayerZone();
            expect(playerZone.contains(card)).toBe(true);
        });

        it('adds card to dealer zone', () => {
            const card = renderer.createCard(20, true);
            renderer.addToZone(card, true);

            const dealerZone = renderer.getDealerZone();
            expect(dealerZone.contains(card)).toBe(true);
        });

        it('adds multiple cards to same zone', () => {
            const card1 = renderer.createCard(10, false);
            const card2 = renderer.createCard(20, false);
            renderer.addToZone(card1, false);
            renderer.addToZone(card2, false);

            const playerZone = renderer.getPlayerZone();
            expect(playerZone.children.length).toBe(2);
        });
    });

    describe('Card Removal', () => {
        it('removes specific card by ID', () => {
            const card = renderer.createCard(10, false);
            renderer.addToZone(card, false);
            const cardId = card.id;

            renderer.removeCard(cardId);

            expect(renderer.getCardById(cardId)).toBeNull();
        });

        it('removes all cards', () => {
            const card1 = renderer.createCard(10, false);
            const card2 = renderer.createCard(20, true);
            renderer.addToZone(card1, false);
            renderer.addToZone(card2, true);

            renderer.removeAllCards();

            expect(renderer.getPlayerZone().children.length).toBe(0);
            expect(renderer.getDealerZone().children.length).toBe(0);
        });
    });

    describe('Card State', () => {
        it('sets card face up', () => {
            const card = renderer.createCard(10, false);
            renderer.setFaceUp(card, true);

            expect(card.classList.contains('face-up')).toBe(true);
            expect(card.classList.contains('face-down')).toBe(false);
        });

        it('sets card face down', () => {
            const card = renderer.createCard(10, false);
            renderer.setFaceUp(card, true);
            renderer.setFaceUp(card, false);

            expect(card.classList.contains('face-down')).toBe(true);
            expect(card.classList.contains('face-up')).toBe(false);
        });
    });

    describe('Card Lookup', () => {
        it('finds card by ID', () => {
            const card = renderer.createCard(10, false);
            renderer.addToZone(card, false);

            const found = renderer.getCardById(card.id);
            expect(found).toBe(card);
        });

        it('returns null for non-existent ID', () => {
            const found = renderer.getCardById('non-existent');
            expect(found).toBeNull();
        });
    });

    describe('Deck Position', () => {
        it('returns deck position', () => {
            const pos = renderer.getDeckPosition();
            expect(typeof pos.x).toBe('number');
            expect(typeof pos.y).toBe('number');
        });
    });
});
