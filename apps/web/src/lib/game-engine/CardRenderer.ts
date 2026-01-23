/**
 * CardRenderer - Direct DOM Card Rendering
 *
 * Renders card elements directly to DOM without framework overhead.
 * Used by GameEngine for card visualization.
 *
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import type { CardIndex, Suit, Rank } from './types';
import { SUIT_NAMES, RANK_NAMES } from './types';

/**
 * Counter for unique card IDs
 */
let cardIdCounter = 0;

/**
 * Generate unique card ID
 */
function generateCardId(): string {
    cardIdCounter += 1;
    return `ge-card-${cardIdCounter}`;
}

/**
 * Get suit from card index
 */
function getSuit(cardIndex: CardIndex): Suit {
    return Math.floor(cardIndex / 13) as Suit;
}

/**
 * Get rank from card index
 */
function getRank(cardIndex: CardIndex): Rank {
    return (cardIndex % 13) as Rank;
}

/**
 * CardRenderer class
 *
 * Handles all DOM operations for card elements.
 */
export class CardRenderer {
    private container: HTMLElement;
    private playerZone: HTMLElement;
    private dealerZone: HTMLElement;
    private deckArea: HTMLElement;
    private cardMap: Map<string, HTMLElement>;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) {
            throw new Error(`Container element not found: ${containerId}`);
        }
        this.container = el;

        const playerZone = this.container.querySelector('[data-zone="player"]');
        const dealerZone = this.container.querySelector('[data-zone="dealer"]');
        const deckArea = this.container.querySelector('[data-zone="deck"]');

        if (!playerZone || !dealerZone) {
            throw new Error('Required zone elements not found');
        }

        this.playerZone = playerZone as HTMLElement;
        this.dealerZone = dealerZone as HTMLElement;
        this.deckArea = (deckArea as HTMLElement) || this.container;
        this.cardMap = new Map();
    }

    // =========================================================================
    // CARD CREATION
    // =========================================================================

    /**
     * Create a new card element
     */
    createCard(cardIndex: CardIndex, isDealer: boolean): HTMLElement {
        const card = document.createElement('div');
        const id = generateCardId();

        card.id = id;
        card.className = 'ge-card face-down';
        card.dataset.card = String(cardIndex);
        card.dataset.dealer = String(isDealer);

        // Create card face content
        const suit = getSuit(cardIndex);
        const rank = getRank(cardIndex);
        const suitSymbol = SUIT_NAMES[suit];
        const rankSymbol = RANK_NAMES[rank];

        card.innerHTML = `
      <div class="ge-card-face ge-card-front">
        <span class="ge-card-rank">${rankSymbol}</span>
        <span class="ge-card-suit">${suitSymbol}</span>
      </div>
      <div class="ge-card-face ge-card-back"></div>
    `;

        // Add color class for red suits
        if (suit === 1 || suit === 2) {
            card.classList.add('red');
        }

        this.cardMap.set(id, card);
        return card;
    }

    // =========================================================================
    // ZONE MANAGEMENT
    // =========================================================================

    /**
     * Add card to appropriate zone
     */
    addToZone(card: HTMLElement, isDealer: boolean): void {
        const zone = isDealer ? this.dealerZone : this.playerZone;
        zone.appendChild(card);
    }

    /**
     * Get player zone element
     */
    getPlayerZone(): HTMLElement {
        return this.playerZone;
    }

    /**
     * Get dealer zone element
     */
    getDealerZone(): HTMLElement {
        return this.dealerZone;
    }

    // =========================================================================
    // CARD REMOVAL
    // =========================================================================

    /**
     * Remove a specific card by ID
     */
    removeCard(cardId: string): void {
        const card = this.cardMap.get(cardId);
        if (card && card.parentElement) {
            card.parentElement.removeChild(card);
        }
        this.cardMap.delete(cardId);
    }

    /**
     * Remove all cards from all zones
     */
    removeAllCards(): void {
        this.cardMap.forEach((card) => {
            if (card.parentElement) {
                card.parentElement.removeChild(card);
            }
        });
        this.cardMap.clear();
    }

    // =========================================================================
    // CARD STATE
    // =========================================================================

    /**
     * Set card face up or face down
     */
    setFaceUp(card: HTMLElement, faceUp: boolean): void {
        if (faceUp) {
            card.classList.remove('face-down');
            card.classList.add('face-up');
        } else {
            card.classList.remove('face-up');
            card.classList.add('face-down');
        }
    }

    // =========================================================================
    // CARD LOOKUP
    // =========================================================================

    /**
     * Get card element by ID
     */
    getCardById(cardId: string): HTMLElement | null {
        return this.cardMap.get(cardId) || null;
    }

    // =========================================================================
    // DECK POSITION
    // =========================================================================

    /**
     * Get deck position for animation origin
     */
    getDeckPosition(): { x: number; y: number } {
        const rect = this.deckArea.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
    }
}
