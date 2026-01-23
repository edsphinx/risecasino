/**
 * Hand Value Calculator - Matches VyreJackCore.calculateHandValue
 *
 * Calculates blackjack hand value with proper ace handling.
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import type { CardIndex, HandValue, Rank } from './types';

/**
 * Get rank from card index (0-12)
 */
function getRank(cardIndex: CardIndex): Rank {
    return (cardIndex % 13) as Rank;
}

/**
 * Calculate the value of a blackjack hand
 *
 * Matches VyreJackCore Solidity implementation:
 * - Aces count as 11, reduced to 1 if bust
 * - Face cards (J, Q, K) count as 10
 * - Number cards count as face value
 *
 * @param cards Array of card indices (0-51)
 * @returns HandValue with value, isSoft, isBust, isBlackjack
 */
export function calculateHandValue(cards: CardIndex[]): HandValue {
    if (cards.length === 0) {
        return {
            value: 0,
            isSoft: false,
            isBust: false,
            isBlackjack: false,
        };
    }

    let value = 0;
    let aceCount = 0;

    for (const card of cards) {
        const rank = getRank(card);

        if (rank === 0) {
            // Ace
            aceCount++;
            value += 11; // Count as 11 initially
        } else if (rank >= 10) {
            // Face card (J, Q, K)
            value += 10;
        } else {
            // Number card (2-10)
            value += rank + 1;
        }
    }

    // Reduce aces from 11 to 1 if busting
    while (value > 21 && aceCount > 0) {
        value -= 10;
        aceCount--;
    }

    return {
        value,
        isSoft: aceCount > 0, // Hand is soft if any ace still counts as 11
        isBust: value > 21,
        isBlackjack: value === 21 && cards.length === 2,
    };
}

/**
 * Check if player can double down
 * Only allowed on initial 2-card hand
 */
export function canDouble(playerCards: CardIndex[], isDoubled: boolean): boolean {
    return playerCards.length === 2 && !isDoubled;
}

/**
 * Check if player can surrender
 * Only allowed on initial 2-card hand (late surrender)
 */
export function canSurrender(playerCards: CardIndex[]): boolean {
    return playerCards.length === 2;
}

/**
 * Check if dealer should hit
 * Dealer must hit on 16 or less, and on soft 17
 */
export function shouldDealerHit(value: number, isSoft: boolean): boolean {
    if (value < 17) return true;
    if (value === 17 && isSoft) return true;
    return false;
}
