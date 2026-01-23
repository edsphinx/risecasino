# Migration Guide

## Prerequisites

- [ ] All existing tests passing
- [ ] Backup of current state
- [ ] Understanding of current architecture

---

## Phase 1: Create GameEngine Core

### Step 1.1: Create Directory Structure

```bash
mkdir -p src/lib/game-engine/__tests__
```

### Step 1.2: Create Types (TDD)

```typescript
// First write test
// src/lib/game-engine/__tests__/types.test.ts
describe('Types', () => {
  it('GamePhase includes all valid phases', () => {
    const phases: GamePhase[] = ['idle', 'dealing', 'player_turn', 'dealer_turn', 'result'];
    expect(phases).toHaveLength(5);
  });
});

// Then create types.ts
```

### Step 1.3: Create StateMachine (TDD)

```typescript
// Test first
describe('StateMachine', () => {
  it('initializes with idle phase', () => {
    const sm = new StateMachine();
    expect(sm.getPhase()).toBe('idle');
  });
});

// Then implement
```

### Step 1.4: Invariant Tests

After StateMachine complete:

```bash
pnpm test src/lib/game-engine/__tests__/invariants.test.ts
```

---

## Phase 2: Integration Bridge

### Step 2.1: Create useGameEngine Hook

```typescript
// src/hooks/useGameEngine.ts
export function useGameEngine(containerId: string) {
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    engineRef.current = new GameEngine(containerId);
    return () => engineRef.current?.reset();
  }, [containerId]);

  return {
    dealCard: (card, isDealer, hidden) => engineRef.current?.dealCard(card, isDealer, hidden),
    // ...
  };
}
```

### Step 2.2: Integration Test

```typescript
describe('useGameEngine', () => {
  it('creates engine on mount', () => {
    const { result } = renderHook(() => useGameEngine('test'));
    expect(result.current.engine).toBeDefined();
  });
});
```

---

## Phase 3: GameBoard Migration

### Step 3.1: Create GameCanvas Component

```tsx
// src/components/game/GameCanvas.tsx
export function GameCanvas({ id }: { id: string }) {
  return (
    <div id={id} className="game-canvas">
      <div className="dealer-zone" />
      <div className="deck-area" />
      <div className="player-zone" />
    </div>
  );
}
```

### Step 3.2: Update GameBoardCasino

```diff
// src/components/game/GameBoardCasino.tsx
+ import { useGameEngine } from '@/hooks/useGameEngine';
+ import { GameCanvas } from './GameCanvas';

- const { addGameCard } = useGameStore();
+ const { dealCard } = useGameEngine('game-canvas');

  const handleCardDealt = (event) => {
-   addGameCard(event.card, event.isDealer, !event.faceUp);
+   dealCard(event.card, event.isDealer, !event.faceUp);
  };

  return (
    <div className="game-board">
+     <GameCanvas id="game-canvas" />
      <BettingPanel />
      <ActionButtons />
    </div>
  );
```

### Step 3.3: E2E Verification

```bash
pnpm e2e
```

---

## Phase 4: Cleanup

### Files to Delete

```bash
rm src/hooks/useAnimationProcessor.ts
rm src/hooks/useAnimationOrchestrator.ts
rm src/components/game/AnimationSystemTest.tsx
```

### gameStore.ts Simplification

Remove:

- `gameCards` state
- `revealedCount` state
- `isHiddenCardFlipped` state
- Related actions and selectors

Keep:

- `lastGameResult`
- `showingResult`
- `gamePhase`

---

## Rollback Plan

If issues arise:

1. Revert to previous commit
2. GameEngine is isolated, can be disabled by:

```typescript
// Temporarily use old system
const USE_NEW_ENGINE = false;

if (USE_NEW_ENGINE) {
  dealCard(event.card, event.isDealer, !event.faceUp);
} else {
  addGameCard(event.card, event.isDealer, !event.faceUp);
}
```

---

## Verification Checklist

### After Each Phase

- [ ] All unit tests pass
- [ ] Invariant tests pass
- [ ] No console errors
- [ ] No TypeScript errors

### Final Verification

- [ ] Full E2E suite passes
- [ ] Manual game play works
- [ ] Animations smooth
- [ ] No memory leaks
- [ ] Bundle size same or smaller
