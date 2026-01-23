# GameEngine Module Specifications

## Directory Structure

```
src/lib/game-engine/
├── index.ts              # Public exports
├── types.ts              # TypeScript interfaces
├── GameEngine.ts         # Main orchestrator
├── StateMachine.ts       # Game state management
├── CardRenderer.ts       # DOM card rendering
├── AnimationController.ts # GSAP animation wrapper
└── __tests__/
    ├── StateMachine.test.ts
    ├── CardRenderer.test.ts
    ├── AnimationController.test.ts
    ├── GameEngine.test.ts
    └── invariants.test.ts
```

---

## types.ts

```typescript
export type GamePhase = 'idle' | 'dealing' | 'player_turn' | 'dealer_turn' | 'resolving' | 'result';

export interface EngineGameState {
  phase: GamePhase;
  playerCards: number[];
  dealerCards: number[];
  dealerHiddenCard: number | null;
  isHiddenRevealed: boolean;
  playerValue: number;
  dealerValue: number;
}

export interface CardPosition {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface CardElement {
  id: string;
  element: HTMLElement;
  cardIndex: number;
  isDealer: boolean;
  isFaceUp: boolean;
}

export type StateListener = (state: EngineGameState) => void;

export interface GameEngineConfig {
  containerId: string;
  animationSpeed?: 'slow' | 'normal' | 'fast';
  deckPosition?: { x: number; y: number };
}
```

---

## StateMachine.ts

### Public API

```typescript
class StateMachine {
  // State access
  getState(): EngineGameState;
  getPhase(): GamePhase;

  // Card operations
  addCard(card: number, isDealer: boolean, isHidden: boolean): void;
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

### State Transition Rules

```
idle → dealing (on bet placed)
dealing → player_turn (all cards dealt)
player_turn → dealer_turn (on stand)
player_turn → result (on bust/blackjack)
dealer_turn → result (dealer done)
result → idle (new game)
```

### Invariants

- `playerCards.length >= 0 && playerCards.length <= 11`
- `dealerCards.length >= 0 && dealerCards.length <= 11`
- `dealerHiddenCard` is either `null` or in `dealerCards`
- Phase transitions follow valid paths only

---

## CardRenderer.ts

### Public API

```typescript
class CardRenderer {
  constructor(containerId: string);

  // Card lifecycle
  createCard(cardIndex: number, isDealer: boolean): HTMLElement;
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

### Public API

```typescript
class AnimationController {
  // Card animations
  animateDeal(
    card: HTMLElement,
    from: CardPosition,
    to: CardPosition,
    delay: number
  ): gsap.core.Timeline;
  animateFlip(card: HTMLElement, onMidpoint: () => void): gsap.core.Timeline;
  animateWin(cards: HTMLElement[]): gsap.core.Timeline;
  animateLose(cards: HTMLElement[]): gsap.core.Timeline;
  animateShuffle(deck: HTMLElement): gsap.core.Timeline;

  // Control
  pause(): void;
  resume(): void;
  killAll(): void;

  // Timeline tracking
  getActiveCount(): number;
}
```

### Animation Timing

```typescript
const TIMING = {
  dealDuration: 0.8,
  dealStagger: 0.35,
  flipDuration: 0.4,
  winCelebration: 0.6,
  loseShake: 0.4,
};
```

---

## GameEngine.ts

### Public API

```typescript
class GameEngine {
  constructor(config: GameEngineConfig);

  // Card operations
  dealCard(cardIndex: number, isDealer: boolean, isHidden: boolean): void;
  revealHiddenCard(): void;

  // Game lifecycle
  startGame(): void;
  endGame(result: 'win' | 'lose' | 'push' | 'blackjack'): void;
  reset(): void;

  // State access
  getState(): EngineGameState;
  onStateChange(listener: StateListener): () => void;

  // Debug
  getDebugInfo(): object;
}
```

### Event Bridge

```typescript
// From contract events
interface CardDealtEvent {
  card: number;
  isDealer: boolean;
  faceUp: boolean;
}

// Usage in hooks
const handleCardDealt = (event: CardDealtEvent) => {
  engine.dealCard(event.card, event.isDealer, !event.faceUp);
};
```
