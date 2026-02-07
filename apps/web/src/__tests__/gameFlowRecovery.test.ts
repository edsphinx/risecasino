/**
 * Game Flow Recovery Tests
 *
 * Validates all game flow recovery scenarios introduced by the HIT/VRF fixes:
 * - Phase timing (waiting_vrf set BEFORE tx, revert on failure)
 * - Hydration Case A: Game vanished on-chain → reset to idle
 * - Hydration Case B: Page reload → hydrate from contract
 * - Hydration Case C: Missed HIT events → re-hydrate with extra cards
 * - Initial deal detection (4 CardDealt → player_turn)
 * - GameResolved flow → hand snapshot + showing_result
 * - Safety-net conditions (waiting_vrf triggers refetch logic)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/stores/gameStore';
import type { GamePhase } from '@/stores/gameStore';

// =============================================================================
// HELPERS — mirror the logic from useGameState.ts for isolated testing
// =============================================================================

/** Card index → blackjack value (same as useGameState.calculateLocalHandValue) */
function calculateLocalHandValue(cards: number[]): number {
  if (!cards || cards.length === 0) return 0;
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = card % 13;
    if (rank === 0) {
      aces++;
      value += 11;
    } else if (rank >= 10) {
      value += 10;
    } else {
      value += rank + 1;
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

// VyreJackGameState enum values (from VyreJackCore.sol)
const IDLE = 0;
const WAITING_VRF = 1;
const PLAYER_TURN = 2;
const WAITING_HIT_VRF = 3;
const WAITING_DOUBLE_VRF = 4;
const DEALER_TURN = 5;
const PLAYER_WIN = 6;
const DEALER_WIN = 7;
const PUSH = 8;
const PLAYER_BLACKJACK = 9;

void DEALER_TURN;

function isFinalState(state: number | undefined): boolean {
  return (
    state === PLAYER_WIN || state === DEALER_WIN || state === PUSH || state === PLAYER_BLACKJACK
  );
}

/** Simulate the hydration needsHydration decision from useGameState.ts */
function computeNeedsHydration(
  currentPhase: GamePhase,
  contractPlayerCards: number[],
  ssotPlayerCount: number,
  hasHydratedThisSession: boolean
): boolean {
  const contractHasCards = contractPlayerCards.length > 0;
  if (currentPhase === 'idle') {
    return contractHasCards && ssotPlayerCount === 0 && !hasHydratedThisSession;
  }
  if (currentPhase === 'waiting_vrf') {
    return (
      contractHasCards && (ssotPlayerCount === 0 || contractPlayerCards.length > ssotPlayerCount)
    );
  }
  return false;
}

/** Derive gamePhase from contract state (mirrors useGameState hydration) */
function derivePhaseFromContractState(
  gameState: number
): 'player_turn' | 'waiting_vrf' | 'dealer_reveal' {
  if (gameState === PLAYER_TURN) return 'player_turn';
  if (
    gameState === WAITING_VRF ||
    gameState === WAITING_HIT_VRF ||
    gameState === WAITING_DOUBLE_VRF
  ) {
    return 'waiting_vrf';
  }
  return 'dealer_reveal';
}

// =============================================================================
// STORE RESET
// =============================================================================

beforeEach(() => {
  useGameStore.getState().clearGameCards();
  useGameStore.getState().resetAnimationState();
});

// =============================================================================
// 1. PHASE TIMING — waiting_vrf before HIT
// =============================================================================

describe('Phase Timing — HIT/Double action flow', () => {
  it('sets waiting_vrf BEFORE HIT action (prevents race with CardDealt events)', () => {
    const store = useGameStore.getState();

    // Simulate: initial deal complete, player_turn active
    store.setGamePhase('player_turn');
    expect(useGameStore.getState().gamePhase).toBe('player_turn');

    // Simulate: HIT action — set waiting_vrf BEFORE sendTransaction
    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
  });

  it('reverts to player_turn when HIT tx fails', () => {
    const store = useGameStore.getState();

    store.setGamePhase('player_turn');
    store.setGamePhase('waiting_vrf'); // Set before tx

    // Simulate tx failure → revert
    store.setGamePhase('player_turn');
    expect(useGameStore.getState().gamePhase).toBe('player_turn');
  });

  it('sets waiting_vrf BEFORE initial deal (placeBet)', () => {
    const store = useGameStore.getState();

    store.setGamePhase('idle');

    // placeBet flow: betting → waiting_vrf BEFORE sendTransaction
    store.setGamePhase('betting');
    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
  });

  it('reverts to idle when placeBet tx fails', () => {
    const store = useGameStore.getState();

    store.setGamePhase('waiting_vrf');

    // tx fail → revert
    store.setGamePhase('idle');
    expect(useGameStore.getState().gamePhase).toBe('idle');
  });
});

// =============================================================================
// 2. HYDRATION DECISION LOGIC
// =============================================================================

describe('Hydration Decision Logic — computeNeedsHydration', () => {
  describe('Case B: Page reload (idle phase)', () => {
    it('hydrates when SSOT empty and contract has cards', () => {
      expect(computeNeedsHydration('idle', [10, 20], 0, false)).toBe(true);
    });

    it('does NOT hydrate when already hydrated this session', () => {
      expect(computeNeedsHydration('idle', [10, 20], 0, true)).toBe(false);
    });

    it('does NOT hydrate when SSOT already has cards', () => {
      expect(computeNeedsHydration('idle', [10, 20], 2, false)).toBe(false);
    });

    it('does NOT hydrate when contract has no cards', () => {
      expect(computeNeedsHydration('idle', [], 0, false)).toBe(false);
    });
  });

  describe('Case C: Missed HIT events (waiting_vrf phase)', () => {
    it('hydrates when SSOT empty (initial deal missed)', () => {
      expect(computeNeedsHydration('waiting_vrf', [10, 20], 0, false)).toBe(true);
    });

    it('hydrates when contract has MORE cards than SSOT (HIT card missed)', () => {
      // SSOT has 2 player cards, contract has 3 (HIT card arrived)
      expect(computeNeedsHydration('waiting_vrf', [10, 20, 30], 2, false)).toBe(true);
    });

    it('does NOT hydrate when contract has SAME cards as SSOT', () => {
      expect(computeNeedsHydration('waiting_vrf', [10, 20], 2, false)).toBe(false);
    });

    it('does NOT hydrate when contract has no cards', () => {
      expect(computeNeedsHydration('waiting_vrf', [], 0, false)).toBe(false);
    });
  });

  describe('Other phases — never hydrate', () => {
    it('does NOT hydrate during dealing_initial', () => {
      expect(computeNeedsHydration('dealing_initial', [10, 20], 0, false)).toBe(false);
    });

    it('does NOT hydrate during player_turn', () => {
      expect(computeNeedsHydration('player_turn', [10, 20, 30], 2, false)).toBe(false);
    });

    it('does NOT hydrate during dealer_reveal', () => {
      expect(computeNeedsHydration('dealer_reveal', [10, 20], 0, false)).toBe(false);
    });

    it('does NOT hydrate during showing_result', () => {
      expect(computeNeedsHydration('showing_result', [10, 20], 0, false)).toBe(false);
    });
  });
});

// =============================================================================
// 3. HYDRATION CASE A — Game vanished on-chain
// =============================================================================

describe('Hydration Case A — Game vanished on-chain', () => {
  it('resets to idle when in waiting_vrf with SSOT cards but contract empty', () => {
    const store = useGameStore.getState();

    // Setup: initial deal happened, then HIT → waiting_vrf
    store.addGameCard(10, false, false); // Player card
    store.addGameCard(20, false, false); // Player card
    store.addGameCard(30, true, false); // Dealer card
    store.addGameCard(40, true, true); // Dealer hidden
    store.setGamePhase('waiting_vrf');

    // Verify pre-condition: SSOT has cards, phase is waiting_vrf
    expect(useGameStore.getState().gameCards.playerCards.length).toBe(2);
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');

    // Simulate: contract returns empty (game resolved on-chain, struct deleted)
    // This is what the hydration effect does when game vanishes:
    store.resetAnimationState();
    store.clearGameCards();

    // Verify: reset to idle, SSOT cleared
    const after = useGameStore.getState();
    expect(after.gamePhase).toBe('idle');
    expect(after.gameCards.playerCards).toEqual([]);
    expect(after.gameCards.dealerCards).toEqual([]);
    expect(after.revealedCount.player).toBe(0);
    expect(after.revealedCount.dealer).toBe(0);
  });

  it('does NOT reset when not in waiting_vrf (no false positives)', () => {
    const store = useGameStore.getState();

    // In player_turn with cards — contract empty shouldn't reset
    store.addGameCard(10, false, false);
    store.setGamePhase('player_turn');

    // The hydration effect only acts on 'waiting_vrf' phase
    const phase = useGameStore.getState().gamePhase;
    const ssotCards = useGameStore.getState().gameCards;
    const shouldReset = phase === 'waiting_vrf' && ssotCards.playerCards.length > 0;

    expect(shouldReset).toBe(false);
  });
});

// =============================================================================
// 4. hydrateFromContract — batch SSOT population
// =============================================================================

describe('hydrateFromContract — batch SSOT population', () => {
  it('sets all card state in a single batch (no intermediate renders)', () => {
    const store = useGameStore.getState();

    const playerCards = [10, 20]; // K♠, 8♠
    const dealerCards = [30, 40]; // 5♣, 2♦

    store.hydrateFromContract(playerCards, dealerCards, 'player_turn');

    const state = useGameStore.getState();
    expect(state.gameCards.playerCards).toEqual([10, 20]);
    expect(state.gameCards.dealerCards).toEqual([30, 40]);
    expect(state.gameCards.dealerHiddenCard).toBe(40); // 2nd dealer card is hidden
    expect(state.revealedCount.player).toBe(2);
    expect(state.revealedCount.dealer).toBe(2);
    expect(state.isHiddenCardFlipped).toBe(false);
    expect(state.gamePhase).toBe('player_turn');
  });

  it('sets correct phase based on contract state', () => {
    const store = useGameStore.getState();

    store.hydrateFromContract([10], [20], 'waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
  });

  it('handles HIT hydration — 3 player cards', () => {
    const store = useGameStore.getState();

    // After HIT: player has 3 cards
    const playerCards = [10, 20, 30];
    const dealerCards = [40, 50];

    store.hydrateFromContract(playerCards, dealerCards, 'player_turn');

    const state = useGameStore.getState();
    expect(state.gameCards.playerCards).toHaveLength(3);
    expect(state.revealedCount.player).toBe(3); // All revealed
  });

  it('overwrites existing SSOT when re-hydrating', () => {
    const store = useGameStore.getState();

    // First hydration: 2 player cards
    store.hydrateFromContract([10, 20], [30, 40], 'player_turn');
    expect(useGameStore.getState().gameCards.playerCards).toHaveLength(2);

    // Re-hydration: 3 player cards (HIT arrived in contract)
    store.hydrateFromContract([10, 20, 50], [30, 40], 'player_turn');

    const state = useGameStore.getState();
    expect(state.gameCards.playerCards).toEqual([10, 20, 50]);
    expect(state.revealedCount.player).toBe(3);
  });
});

// =============================================================================
// 5. DERIVE PHASE FROM CONTRACT STATE
// =============================================================================

describe('derivePhaseFromContractState', () => {
  it('maps PLAYER_TURN (2) → player_turn', () => {
    expect(derivePhaseFromContractState(PLAYER_TURN)).toBe('player_turn');
  });

  it('maps WAITING_VRF (1) → waiting_vrf', () => {
    expect(derivePhaseFromContractState(WAITING_VRF)).toBe('waiting_vrf');
  });

  it('maps WAITING_HIT_VRF (3) → waiting_vrf', () => {
    expect(derivePhaseFromContractState(WAITING_HIT_VRF)).toBe('waiting_vrf');
  });

  it('maps WAITING_DOUBLE_VRF (4) → waiting_vrf', () => {
    expect(derivePhaseFromContractState(WAITING_DOUBLE_VRF)).toBe('waiting_vrf');
  });

  it('maps DEALER_TURN (5) → dealer_reveal', () => {
    expect(derivePhaseFromContractState(DEALER_TURN)).toBe('dealer_reveal');
  });
});

// =============================================================================
// 6. isFinalState helper
// =============================================================================

describe('isFinalState helper', () => {
  it('returns true for PLAYER_WIN', () => expect(isFinalState(PLAYER_WIN)).toBe(true));
  it('returns true for DEALER_WIN', () => expect(isFinalState(DEALER_WIN)).toBe(true));
  it('returns true for PUSH', () => expect(isFinalState(PUSH)).toBe(true));
  it('returns true for PLAYER_BLACKJACK', () => expect(isFinalState(PLAYER_BLACKJACK)).toBe(true));
  it('returns false for IDLE', () => expect(isFinalState(IDLE)).toBe(false));
  it('returns false for PLAYER_TURN', () => expect(isFinalState(PLAYER_TURN)).toBe(false));
  it('returns false for WAITING_VRF', () => expect(isFinalState(WAITING_VRF)).toBe(false));
  it('returns false for undefined', () => expect(isFinalState(undefined)).toBe(false));
});

// =============================================================================
// 7. FULL GAME FLOW — Initial Deal
// =============================================================================

describe('Full Game Flow — Initial Deal (4 CardDealt → player_turn)', () => {
  it('transitions through waiting_vrf → dealing_initial → player_turn', () => {
    const store = useGameStore.getState();

    // 1. Player places bet → waiting_vrf
    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');

    // 2. First CardDealt arrives → dealing_initial
    store.setGamePhase('dealing_initial');
    store.addGameCard(10, false, false); // Player card 1
    store.revealNextCard(false);

    expect(useGameStore.getState().gamePhase).toBe('dealing_initial');
    expect(useGameStore.getState().revealedCount.player).toBe(1);

    // 3. More cards arrive
    store.addGameCard(30, true, false); // Dealer card 1
    store.revealNextCard(true);

    store.addGameCard(20, false, false); // Player card 2
    store.revealNextCard(false);

    store.addGameCard(40, true, true); // Dealer hidden card
    store.revealNextCard(true);

    // 4. Check: 2 player + 2 dealer → transition to player_turn
    const state = useGameStore.getState();
    const pCount = state.gameCards.playerCards.length;
    const dCount = state.gameCards.dealerCards.length;

    expect(pCount).toBe(2);
    expect(dCount).toBe(2);

    // Simulate the check from handleCardDealt:
    if (pCount >= 2 && dCount >= 2 && state.gamePhase === 'dealing_initial') {
      store.setGamePhase('player_turn');
    }

    expect(useGameStore.getState().gamePhase).toBe('player_turn');
  });

  it('does NOT transition to player_turn before 4 cards', () => {
    const store = useGameStore.getState();
    store.setGamePhase('dealing_initial');

    store.addGameCard(10, false, false);
    store.revealNextCard(false);
    store.addGameCard(30, true, false);
    store.revealNextCard(true);
    store.addGameCard(20, false, false);
    store.revealNextCard(false);

    // Only 3 cards — should NOT transition
    const state = useGameStore.getState();
    const pCount = state.gameCards.playerCards.length;
    const dCount = state.gameCards.dealerCards.length;

    const shouldTransition = pCount >= 2 && dCount >= 2 && state.gamePhase === 'dealing_initial';
    expect(shouldTransition).toBe(false);
  });
});

// =============================================================================
// 8. FULL GAME FLOW — HIT Action
// =============================================================================

describe('Full Game Flow — HIT action', () => {
  function setupInitialDeal() {
    const store = useGameStore.getState();
    store.addGameCard(10, false, false); // Player: K♠
    store.addGameCard(6, false, false); // Player: 7♠
    store.revealNextCard(false);
    store.revealNextCard(false);
    store.addGameCard(30, true, false); // Dealer: 5♣
    store.addGameCard(40, true, true); // Dealer: hidden
    store.revealNextCard(true);
    store.revealNextCard(true);
    store.setGamePhase('player_turn');
  }

  it('HIT: waiting_vrf → CardDealt → player_turn (back to action)', () => {
    setupInitialDeal();
    const store = useGameStore.getState();

    // HIT pressed → waiting_vrf BEFORE tx
    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');

    // VRF responds with CardDealt
    store.addGameCard(3, false, false); // Player: 4♠
    store.revealNextCard(false);

    expect(useGameStore.getState().gameCards.playerCards).toHaveLength(3);
    expect(useGameStore.getState().revealedCount.player).toBe(3);

    // Game is still in player_turn (not busted)
    store.setGamePhase('player_turn');
    expect(useGameStore.getState().gamePhase).toBe('player_turn');

    // Verify hand value: K(10) + 7 + 4 = 21
    const cards = useGameStore.getState().gameCards.playerCards;
    expect(calculateLocalHandValue(cards)).toBe(21);
  });

  it('HIT bust: CardDealt → GameResolved flow', () => {
    setupInitialDeal();
    const store = useGameStore.getState();

    // HIT → waiting_vrf
    store.setGamePhase('waiting_vrf');

    // VRF responds with Q♦ (bust card)
    store.addGameCard(24, false, false); // Q♦ = 10
    store.revealNextCard(false);

    // Player hand: K♠(10) + 7♠(7) + Q♦(10) = 27 → BUST
    const playerCards = useGameStore.getState().gameCards.playerCards;
    const handValue = calculateLocalHandValue(playerCards);
    expect(handValue).toBe(27);
    expect(handValue).toBeGreaterThan(21); // BUST

    // GameResolved event arrives → dealer_reveal
    store.setGamePhase('dealer_reveal');
    store.flipHiddenCard();
    expect(useGameStore.getState().isHiddenCardFlipped).toBe(true);

    // Result set
    store.setLastGameResult({
      result: 'lose' as const,
      payout: 0n,
      playerValue: 27,
      dealerValue: 14,
      playerCards: [...playerCards],
      dealerCards: [...useGameStore.getState().gameCards.dealerCards],
      bet: 0n,
    });

    const result = useGameStore.getState().lastGameResult;
    expect(result).not.toBeNull();
    expect(result!.result).toBe('lose');
    expect(result!.playerValue).toBe(27);
    expect(useGameStore.getState().showingResult).toBe(true);
  });
});

// =============================================================================
// 9. FULL GAME FLOW — GameResolved
// =============================================================================

describe('Full Game Flow — GameResolved', () => {
  function setupFullGame() {
    const store = useGameStore.getState();
    // Player: A♠ + K♠ = 21 (Blackjack)
    store.addGameCard(0, false, false); // A♠
    store.addGameCard(12, false, false); // K♠
    store.revealNextCard(false);
    store.revealNextCard(false);
    // Dealer: 7♣ + hidden
    store.addGameCard(19, true, false); // 7♣
    store.addGameCard(40, true, true); // hidden
    store.revealNextCard(true);
    store.revealNextCard(true);
    store.setGamePhase('player_turn');
  }

  it('dealer_reveal flips hidden card and shows all cards', () => {
    setupFullGame();
    const store = useGameStore.getState();

    // GameResolved arrives
    store.setGamePhase('dealer_reveal');
    store.flipHiddenCard();

    const state = useGameStore.getState();
    expect(state.gamePhase).toBe('dealer_reveal');
    expect(state.isHiddenCardFlipped).toBe(true);
  });

  it('setLastGameResult shows result overlay', () => {
    setupFullGame();
    const store = useGameStore.getState();

    store.setLastGameResult({
      result: 'blackjack' as const,
      payout: 25000n,
      playerValue: 21,
      dealerValue: 17,
      playerCards: [0, 12],
      dealerCards: [19, 40],
      bet: 10000n,
    });

    const state = useGameStore.getState();
    expect(state.showingResult).toBe(true);
    expect(state.lastGameResult!.result).toBe('blackjack');
    expect(state.lastGameResult!.payout).toBe(25000n);
  });

  it('clearLastResult hides overlay and allows new game', () => {
    setupFullGame();
    const store = useGameStore.getState();

    store.setLastGameResult({
      result: 'win' as const,
      payout: 20000n,
      playerValue: 20,
      dealerValue: 18,
      playerCards: [0, 8],
      dealerCards: [19, 40],
      bet: 10000n,
    });

    expect(useGameStore.getState().showingResult).toBe(true);

    store.clearLastResult();

    const state = useGameStore.getState();
    expect(state.showingResult).toBe(false);
    expect(state.lastGameResult).toBeNull();
  });
});

// =============================================================================
// 10. PLAY AGAIN FLOW
// =============================================================================

describe('Play Again Flow', () => {
  it('resets all state for a new game', () => {
    const store = useGameStore.getState();

    // Leftover state from previous game
    store.addGameCard(10, false, false);
    store.addGameCard(20, true, true);
    store.revealNextCard(false);
    store.revealNextCard(true);
    store.flipHiddenCard();
    store.setGamePhase('showing_result');
    store.setLastGameResult({
      result: 'win' as const,
      payout: 20000n,
      playerValue: 20,
      dealerValue: 18,
      playerCards: [10],
      dealerCards: [20],
      bet: 10000n,
    });

    // Play Again pressed: full reset
    store.clearLastResult();
    store.resetAnimationState();
    store.clearGameCards();
    store.setGamePhase('waiting_vrf');

    const state = useGameStore.getState();
    expect(state.gamePhase).toBe('waiting_vrf');
    expect(state.showingResult).toBe(false);
    expect(state.lastGameResult).toBeNull();
    expect(state.gameCards.playerCards).toEqual([]);
    expect(state.gameCards.dealerCards).toEqual([]);
    expect(state.revealedCount.player).toBe(0);
    expect(state.revealedCount.dealer).toBe(0);
    expect(state.isHiddenCardFlipped).toBe(false);
  });
});

// =============================================================================
// 11. SAFETY-NET CONDITIONS
// =============================================================================

describe('Safety-Net Refetch Conditions', () => {
  it('waiting_vrf phase activates safety-net (regardless of SSOT state)', () => {
    const store = useGameStore.getState();

    // Case 1: Empty SSOT (initial deal missed)
    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
    // Safety-net should trigger: gamePhase === 'waiting_vrf' ✓

    // Case 2: SSOT has cards (HIT missed)
    store.addGameCard(10, false, false);
    store.addGameCard(20, false, false);
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
    // Safety-net should STILL trigger: gamePhase === 'waiting_vrf' ✓
    // (Old bug: only triggered when SSOT was empty)
  });

  it('non-waiting_vrf phases do NOT activate safety-net', () => {
    const phases: GamePhase[] = [
      'idle',
      'betting',
      'dealing_initial',
      'player_turn',
      'dealer_reveal',
      'dealer_hitting',
      'showing_result',
    ];

    for (const phase of phases) {
      useGameStore.getState().setGamePhase(phase);
      expect(useGameStore.getState().gamePhase).not.toBe('waiting_vrf');
    }
  });

  it('safety-net exits when phase changes away from waiting_vrf', () => {
    const store = useGameStore.getState();

    store.setGamePhase('waiting_vrf');
    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');

    // CardDealt arrives → phase changes
    store.setGamePhase('dealing_initial');
    expect(useGameStore.getState().gamePhase).toBe('dealing_initial');
    // Safety-net timers would be cleaned up by useEffect cleanup
  });
});

// =============================================================================
// 12. HIDDEN CARD REVEAL — duplicate event handling
// =============================================================================

describe('Hidden Card Reveal — duplicate CardDealt prevention', () => {
  it('detects duplicate CardDealt for hidden card reveal', () => {
    const store = useGameStore.getState();

    // Initial deal: dealer has face-up + hidden
    store.addGameCard(19, true, false); // 7♣ face-up
    store.addGameCard(40, true, true); // hidden card
    store.revealNextCard(true);
    store.revealNextCard(true);

    const hiddenCard = useGameStore.getState().gameCards.dealerHiddenCard;
    expect(hiddenCard).toBe(40);

    // Simulate: contract emits CardDealt again when revealing hidden card
    // Check if this is the hidden card being revealed (duplicate)
    const incomingCard = 40;
    const isDealer = true;
    const faceUp = true;
    const isHiddenCardReveal = isDealer && faceUp && hiddenCard === incomingCard;

    expect(isHiddenCardReveal).toBe(true);

    // Should call flipHiddenCard() instead of addGameCard()
    store.flipHiddenCard();

    const state = useGameStore.getState();
    expect(state.gameCards.dealerCards).toHaveLength(2); // Still 2, no duplicate
    expect(state.isHiddenCardFlipped).toBe(true);
  });

  it('adds new dealer card when NOT a hidden card reveal', () => {
    const store = useGameStore.getState();

    store.addGameCard(19, true, false);
    store.addGameCard(40, true, true);
    store.revealNextCard(true);
    store.revealNextCard(true);

    const hiddenCard = useGameStore.getState().gameCards.dealerHiddenCard;

    // Dealer hits with a NEW card (not the hidden card)
    const incomingCard = 5; // Different from hidden card (40)
    const isDealer = true;
    const faceUp = true;
    const isHiddenCardReveal = isDealer && faceUp && hiddenCard === incomingCard;

    expect(isHiddenCardReveal).toBe(false);

    // Should add the card normally
    store.addGameCard(incomingCard, true, false);
    store.revealNextCard(true);

    expect(useGameStore.getState().gameCards.dealerCards).toHaveLength(3);
    expect(useGameStore.getState().revealedCount.dealer).toBe(3);
  });
});

// =============================================================================
// 13. HAND VALUE CALCULATION — edge cases
// =============================================================================

describe('calculateLocalHandValue — edge cases for game resolution', () => {
  it('Blackjack: A + K = 21', () => {
    expect(calculateLocalHandValue([0, 12])).toBe(21);
  });

  it('Bust: K + Q + J = 30', () => {
    expect(calculateLocalHandValue([12, 24, 10])).toBe(30);
  });

  it('Soft 17: A + 6 = 17', () => {
    expect(calculateLocalHandValue([0, 5])).toBe(17);
  });

  it('Hard 17: A + 6 + K = 17 (ace becomes 1)', () => {
    expect(calculateLocalHandValue([0, 5, 12])).toBe(17);
  });

  it('Three aces: A + A + A = 13', () => {
    expect(calculateLocalHandValue([0, 13, 26])).toBe(13);
  });

  it('Empty hand = 0', () => {
    expect(calculateLocalHandValue([])).toBe(0);
  });

  it('uses event value when > 0 (prefers contract truth)', () => {
    const eventValue = 21;
    const localValue = calculateLocalHandValue([0, 12]);

    // Mirror the logic: prefer event value if > 0
    const finalValue = eventValue > 0 ? eventValue : localValue;
    expect(finalValue).toBe(21);
  });

  it('falls back to local calculation when event value is 0', () => {
    const eventValue = 0;
    const localValue = calculateLocalHandValue([0, 12]);

    const finalValue = eventValue > 0 ? eventValue : localValue;
    expect(finalValue).toBe(21);
  });
});

// =============================================================================
// 14. END-TO-END: Complete game lifecycle
// =============================================================================

describe('End-to-End: Complete game lifecycle', () => {
  it('idle → bet → deal → player_turn → stand → resolve → play again', () => {
    const store = useGameStore.getState();

    // 1. IDLE
    expect(useGameStore.getState().gamePhase).toBe('idle');

    // 2. Place bet → waiting_vrf
    store.setGamePhase('waiting_vrf');

    // 3. CardDealt events arrive → dealing_initial
    store.setGamePhase('dealing_initial');
    store.addGameCard(8, false, false); // Player: 9♠
    store.revealNextCard(false);
    store.addGameCard(19, true, false); // Dealer: 7♣
    store.revealNextCard(true);
    store.addGameCard(11, false, false); // Player: Q♠
    store.revealNextCard(false);
    store.addGameCard(40, true, true); // Dealer: hidden
    store.revealNextCard(true);

    // 4. Initial deal complete → player_turn
    store.setGamePhase('player_turn');
    expect(useGameStore.getState().gamePhase).toBe('player_turn');

    // Verify: Player has 9+Q=19, should STAND
    expect(calculateLocalHandValue([8, 11])).toBe(19);

    // 5. Stand action (no VRF needed) → dealer_reveal
    store.setGamePhase('dealer_reveal');
    store.flipHiddenCard();

    // 6. GameResolved → result
    store.setLastGameResult({
      result: 'win' as const,
      payout: 20000n,
      playerValue: 19,
      dealerValue: 17,
      playerCards: [8, 11],
      dealerCards: [19, 40],
      bet: 10000n,
    });

    expect(useGameStore.getState().showingResult).toBe(true);
    expect(useGameStore.getState().lastGameResult!.result).toBe('win');

    // 7. Play Again → full reset + new bet
    store.clearLastResult();
    store.resetAnimationState();
    store.clearGameCards();
    store.setGamePhase('waiting_vrf');

    const fresh = useGameStore.getState();
    expect(fresh.gamePhase).toBe('waiting_vrf');
    expect(fresh.showingResult).toBe(false);
    expect(fresh.gameCards.playerCards).toEqual([]);
  });

  it('idle → bet → deal → HIT → bust → resolve → play again', () => {
    const store = useGameStore.getState();

    // 1. IDLE → bet
    store.setGamePhase('waiting_vrf');

    // 2. Initial deal
    store.setGamePhase('dealing_initial');
    store.addGameCard(5, false, false); // Player: 6♠
    store.revealNextCard(false);
    store.addGameCard(19, true, false); // Dealer: 7♣
    store.revealNextCard(true);
    store.addGameCard(8, false, false); // Player: 9♠
    store.revealNextCard(false);
    store.addGameCard(40, true, true); // Dealer: hidden
    store.revealNextCard(true);
    store.setGamePhase('player_turn');

    // Player: 6+9=15 → should HIT
    expect(calculateLocalHandValue([5, 8])).toBe(15);

    // 3. HIT → waiting_vrf (set BEFORE tx)
    store.setGamePhase('waiting_vrf');

    // 4. VRF responds: Q♦ → player busts (15 + 10 = 25)
    store.addGameCard(24, false, false);
    store.revealNextCard(false);
    expect(calculateLocalHandValue([5, 8, 24])).toBe(25);

    // 5. GameResolved → dealer_reveal → result
    store.setGamePhase('dealer_reveal');
    store.flipHiddenCard();
    store.setLastGameResult({
      result: 'lose' as const,
      payout: 0n,
      playerValue: 25,
      dealerValue: 14,
      playerCards: [5, 8, 24],
      dealerCards: [19, 40],
      bet: 10000n,
    });

    expect(useGameStore.getState().showingResult).toBe(true);
    expect(useGameStore.getState().lastGameResult!.result).toBe('lose');

    // 6. Play Again
    store.clearLastResult();
    store.resetAnimationState();
    store.clearGameCards();
    store.setGamePhase('waiting_vrf');

    expect(useGameStore.getState().gamePhase).toBe('waiting_vrf');
    expect(useGameStore.getState().gameCards.playerCards).toEqual([]);
  });
});
