# GameEngine Module Specifications

> [!CAUTION]
> **STRICT TYPING RULE**: Never use `any`. All parameters, returns, and variables must be explicitly typed.

## Directory Structure

```
src/lib/game-engine/
├── index.ts              # Public exports
├── types.ts              # TypeScript interfaces (re-exports from @vyrejack/shared)
├── GameEngine.ts         # Main orchestrator (28 tests)
├── StateMachine.ts       # Game state management (29 tests)
├── CardRenderer.ts       # DOM card rendering (17 tests)
├── AnimationController.ts # GSAP animation wrapper (12 tests)
├── handValue.ts          # Hand value calculation (37 tests)
└── __tests__/
    ├── StateMachine.test.ts
    ├── CardRenderer.test.ts
    ├── AnimationController.test.ts
    ├── GameEngine.test.ts
    └── handValue.test.ts
```

---

## types.ts

Re-exports from `@vyrejack/shared` plus engine-specific types:

```typescript
// From @vyrejack/shared
export { GameState } from '@vyrejack/shared';
export type { HandValue, GameAction, GameResult } from '@vyrejack/shared';

// GamePhase - string alias matching VyreJackCore.GameState
export type GamePhase =
  | 'idle' // GameState.Idle (0)
  | 'waiting_for_deal' // GameState.WaitingForDeal (1)
  | 'player_turn' // GameState.PlayerTurn (2)
  | 'waiting_for_hit' // GameState.WaitingForHit (3)
  | 'waiting_for_double' // GameState.WaitingForDouble (4)
  | 'dealer_turn' // GameState.DealerTurn (5)
  | 'player_win' // GameState.PlayerWin (6)
  | 'dealer_win' // GameState.DealerWin (7)
  | 'push' // GameState.Push (8)
  | 'player_blackjack'; // GameState.PlayerBlackjack (9)

export interface EngineGameState {
  phase: GamePhase;
  playerCards: CardIndex[];
  dealerCards: CardIndex[];
  dealerHiddenCard: CardIndex | null;
  isHiddenRevealed: boolean;
  isDoubled: boolean;
  playerHandValue: HandValue | null;
  dealerHandValue: HandValue | null;
}

export interface CardPosition {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export type StateListener = (state: EngineGameState) => void;
```

---

## handValue.ts

### Public API

```typescript
// Calculate hand value matching VyreJackCore.calculateHandValue
function calculateHandValue(cards: CardIndex[]): HandValue;

// Check if player can double (2 cards only)
function canDouble(playerCards: CardIndex[], isDoubled: boolean): boolean;

// Check if player can surrender (2 cards only)
function canSurrender(playerCards: CardIndex[]): boolean;

// Check if dealer should hit (soft 17 rule)
function shouldDealerHit(value: number, isSoft: boolean): boolean;
```

### HandValue Type

```typescript
interface HandValue {
  value: number;
  isSoft: boolean; // Ace counted as 11
  isBust: boolean; // value > 21
  isBlackjack: boolean; // value === 21 && cards.length === 2
}
```

---

## StateMachine.ts

### Public API (29 tests)

```typescript
class StateMachine {
  // State access
  getState(): EngineGameState;
  getPhase(): GamePhase;

  // Card operations
  addCard(card: CardIndex, isDealer: boolean, isHidden: boolean): void;
  revealHiddenCard(): void;

  // Phase transitions
  setPhase(phase: GamePhase): void;
  canTransitionTo(phase: GamePhase): boolean;

  // Subscriptions
  subscribe(listener: StateListener): () => void;

  // Reset
  reset(): void;
}
```

### State Transition Rules (VyreJackCore aligned)

```
idle → waiting_for_deal (on bet placed)
waiting_for_deal → player_turn | player_blackjack | dealer_win | push
player_turn → waiting_for_hit | waiting_for_double | dealer_turn | dealer_win
waiting_for_hit → player_turn | dealer_win | dealer_turn
waiting_for_double → dealer_turn | dealer_win
dealer_turn → player_win | dealer_win | push
player_win | dealer_win | push | player_blackjack → idle
```

---

## CardRenderer.ts

### Public API (17 tests)

```typescript
class CardRenderer {
  constructor(containerId: string);

  // Card lifecycle
  createCard(cardIndex: CardIndex, isDealer: boolean): HTMLElement;
  addToZone(card: HTMLElement, isDealer: boolean): void;
  removeCard(cardId: string): void;
  removeAllCards(): void;

  // Card state
  setFaceUp(card: HTMLElement, faceUp: boolean): void;
  getCardById(id: string): HTMLElement | null;

  // Zone access
  getPlayerZone(): HTMLElement;
  getDealerZone(): HTMLElement;
  getDeckPosition(): { x: number; y: number };
}
```

### Card Index Format

```
cardIndex: 0-51
suit = Math.floor(cardIndex / 13)  // 0=♠, 1=♥, 2=♦, 3=♣
rank = cardIndex % 13              // 0=A, 1=2, ..., 12=K
```

---

## AnimationController.ts

### Public API (12 tests)

```typescript
class AnimationController {
  // Card animations
  animateDeal(card: HTMLElement, from: CardPosition, to: CardPosition, delay: number): GSAPTimeline;
  animateFlip(card: HTMLElement, onMidpoint: () => void): GSAPTimeline;
  animateWin(cards: HTMLElement[]): GSAPTimeline;
  animateLose(cards: HTMLElement[]): GSAPTimeline;

  // Control
  pause(): void;
  resume(): void;
  killAll(): void;

  // Timeline tracking
  getActiveCount(): number;
}
```

---

## GameEngine.ts

### Public API (28 tests)

```typescript
class GameEngine {
  constructor(config: GameEngineConfig);

  // Game flow
  startGame(): void;
  setPlayerTurn(): void;
  setDealerTurn(): void;
  endGame(result: GameResult): void;
  reset(): void;
  destroy(): void;

  // Card operations
  dealCard(cardIndex: CardIndex, isDealer: boolean, isHidden: boolean): void;
  revealHiddenCard(): void;

  // State access
  getState(): EngineGameState;
  getPhase(): GamePhase;

  // Subscriptions
  onStateChange(listener: StateListener): () => void;
  onPhaseChange(listener: (phase: GamePhase) => void): () => void;
  onGameEnd(listener: (result: GameResult) => void): () => void;
}
```

### Event Bridge (Phase 2)

```typescript
// From contract events (will be implemented in useGameEngine hook)
interface CardDealtEvent {
  card: number;
  isDealer: boolean;
  faceUp: boolean;
}

// Usage
const handleCardDealt = (event: CardDealtEvent) => {
  engine.dealCard(event.card, event.isDealer, !event.faceUp);
};
```
