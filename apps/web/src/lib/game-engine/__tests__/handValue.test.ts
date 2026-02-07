/**
 * Hand Value Tests
 */

import { describe, it, expect } from 'vitest';
import { calculateHandValue, canDouble, canSurrender, shouldDealerHit } from '../handValue';

describe('calculateHandValue', () => {
    describe('Basic Calculations', () => {
        it('returns 0 for empty hand', () => {
            const result = calculateHandValue([]);
            expect(result.value).toBe(0);
            expect(result.isBust).toBe(false);
        });

        it('calculates single number card', () => {
            // Card 4 = rank 4, value 5
            const result = calculateHandValue([4]);
            expect(result.value).toBe(5);
        });

        it('calculates face cards as 10', () => {
            // Card 10 = Jack, 11 = Queen, 12 = King
            expect(calculateHandValue([10]).value).toBe(10); // Jack
            expect(calculateHandValue([11]).value).toBe(10); // Queen
            expect(calculateHandValue([12]).value).toBe(10); // King
        });

        it('calculates ace as 11', () => {
            // Card 0 = Ace
            const result = calculateHandValue([0]);
            expect(result.value).toBe(11);
            expect(result.isSoft).toBe(true);
        });
    });

    describe('Multi-card Hands', () => {
        it('calculates two number cards', () => {
            // Card 4 (5) + Card 6 (7) = 12
            const result = calculateHandValue([4, 6]);
            expect(result.value).toBe(12);
        });

        it('calculates blackjack (Ace + 10)', () => {
            // Card 0 (Ace) + Card 9 (10) = 21 blackjack
            const result = calculateHandValue([0, 9]);
            expect(result.value).toBe(21);
            expect(result.isBlackjack).toBe(true);
            expect(result.isSoft).toBe(true);
        });

        it('calculates blackjack (Ace + Face)', () => {
            // Card 0 (Ace) + Card 11 (Queen) = 21 blackjack
            const result = calculateHandValue([0, 11]);
            expect(result.value).toBe(21);
            expect(result.isBlackjack).toBe(true);
        });

        it('21 with 3+ cards is not blackjack', () => {
            // 7 + 7 + 7 = 21 but not blackjack
            const result = calculateHandValue([6, 19, 32]); // 7 + 7 + 7
            expect(result.value).toBe(21);
            expect(result.isBlackjack).toBe(false);
        });
    });

    describe('Ace Reduction', () => {
        it('reduces ace when busting', () => {
            // Ace (11) + 6 + 6 = 23 → Ace (1) + 6 + 6 = 13
            const result = calculateHandValue([0, 5, 18]); // A + 6 + 6
            expect(result.value).toBe(13);
            expect(result.isSoft).toBe(false);
            expect(result.isBust).toBe(false);
        });

        it('reduces multiple aces', () => {
            // A + A + A = 33 → 13 (one ace as 11, two as 1)
            const result = calculateHandValue([0, 13, 26]); // 3 aces
            expect(result.value).toBe(13);
            expect(result.isSoft).toBe(true);
        });

        it('reduces all aces if needed', () => {
            // A + A + 10 = 32 → 12
            const result = calculateHandValue([0, 13, 9]);
            expect(result.value).toBe(12);
        });
    });

    describe('Bust Detection', () => {
        it('detects bust', () => {
            // 10 + 10 + 5 = 25
            const result = calculateHandValue([9, 22, 4]);
            expect(result.value).toBe(25);
            expect(result.isBust).toBe(true);
        });

        it('not bust at 21', () => {
            const result = calculateHandValue([9, 22]); // 10 + 10 = 20
            expect(result.isBust).toBe(false);
        });
    });
});

describe('canDouble', () => {
    it('can double on 2 cards', () => {
        expect(canDouble([0, 5], false)).toBe(true);
    });

    it('cannot double on 3+ cards', () => {
        expect(canDouble([0, 5, 3], false)).toBe(false);
    });

    it('cannot double if already doubled', () => {
        expect(canDouble([0, 5], true)).toBe(false);
    });
});

describe('canSurrender', () => {
    it('can surrender on 2 cards', () => {
        expect(canSurrender([0, 5])).toBe(true);
    });

    it('cannot surrender on 3+ cards', () => {
        expect(canSurrender([0, 5, 3])).toBe(false);
    });
});

describe('shouldDealerHit', () => {
    it('hits on 16 or less', () => {
        expect(shouldDealerHit(16, false)).toBe(true);
        expect(shouldDealerHit(12, false)).toBe(true);
    });

    it('hits on soft 17', () => {
        expect(shouldDealerHit(17, true)).toBe(true);
    });

    it('stands on hard 17+', () => {
        expect(shouldDealerHit(17, false)).toBe(false);
        expect(shouldDealerHit(18, false)).toBe(false);
    });

    it('stands on soft 18+', () => {
        expect(shouldDealerHit(18, true)).toBe(false);
    });
});

describe('Edge Cases', () => {
    describe('calculateHandValue extreme cases', () => {
        it('handles 4 aces (minimum hand with all aces)', () => {
            // 4 aces = 44 → 14 (all reduced)
            const result = calculateHandValue([0, 13, 26, 39]);
            expect(result.value).toBe(14);
            expect(result.isSoft).toBe(true);
        });

        it('handles exactly 21 with multiple aces', () => {
            // A + A + 9 = 21 (11 + 1 + 9)
            const result = calculateHandValue([0, 13, 8]); // A + A + 9
            expect(result.value).toBe(21);
            expect(result.isBust).toBe(false);
        });

        it('handles maximum possible bust', () => {
            // K + K + K + K = 40
            const result = calculateHandValue([12, 25, 38, 51]);
            expect(result.value).toBe(40);
            expect(result.isBust).toBe(true);
        });

        it('handles card index 0 (Ace of Spades)', () => {
            const result = calculateHandValue([0]);
            expect(result.value).toBe(11);
        });

        it('handles card index 51 (King of Clubs)', () => {
            const result = calculateHandValue([51]);
            expect(result.value).toBe(10);
        });

        it('handles soft 20 (A + 9)', () => {
            const result = calculateHandValue([0, 8]); // A + 9
            expect(result.value).toBe(20);
            expect(result.isSoft).toBe(true);
            expect(result.isBlackjack).toBe(false);
        });

        it('handles hard 20 (10 + 10)', () => {
            const result = calculateHandValue([9, 22]); // 10 + 10
            expect(result.value).toBe(20);
            expect(result.isSoft).toBe(false);
        });

        it('handles 7-card Charlie scenario', () => {
            // 7 small cards without busting
            const result = calculateHandValue([1, 2, 3, 14, 15, 16, 27]); // 2+3+4+2+3+4+2 = 20
            expect(result.value).toBe(20);
            expect(result.isBust).toBe(false);
        });
    });

    describe('canDouble edge cases', () => {
        it('cannot double on single card', () => {
            expect(canDouble([0], false)).toBe(false);
        });

        it('cannot double on empty hand', () => {
            expect(canDouble([], false)).toBe(false);
        });
    });

    describe('canSurrender edge cases', () => {
        it('cannot surrender on single card', () => {
            expect(canSurrender([0])).toBe(false);
        });

        it('cannot surrender on empty hand', () => {
            expect(canSurrender([])).toBe(false);
        });
    });

    describe('shouldDealerHit edge cases', () => {
        it('handles value 0', () => {
            expect(shouldDealerHit(0, false)).toBe(true);
        });

        it('handles value 21', () => {
            expect(shouldDealerHit(21, false)).toBe(false);
        });

        it('handles soft 21', () => {
            expect(shouldDealerHit(21, true)).toBe(false);
        });
    });
});

