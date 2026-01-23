# GameEngine Architecture TODO

> **Last Updated:** 2026-01-23  
> **Status:** 🟢 Phase 1 Complete

---

## ⚠️ CRITICAL RULES

> [!CAUTION]
> **NEVER USE `any` TYPE**  
> All data must be properly typed with TypeScript interfaces/types.
> This applies to ALL code: modules, hooks, tests, utilities.
> If unsure about a type, create a proper interface - never fallback to `any`.

---

## Overview

Migrating VyreCasino game board to hybrid architecture:

- **Vanilla TS GameEngine** - Cards, animations, game state
- **Preact UI** - Betting, overlays, balance

---

## Phase 1: Core GameEngine Module ✅

**Target: 1-2 days | Status: ✅ Complete (123 tests)**

### Tasks

- [x] Create `docs/architecture/` documentation structure
- [x] Create `types.ts` - re-exports from `@vyrejack/shared`
- [x] Create `StateMachine.ts` with game state logic (29 tests)
- [x] Create `CardRenderer.ts` for DOM manipulation (17 tests)
- [x] Create `AnimationController.ts` GSAP wrapper (12 tests)
- [x] Create `GameEngine.ts` main orchestrator (28 tests)
- [x] Create `handValue.ts` with calculateHandValue (37 tests)
- [x] Align with VyreJackCore contract (10 GameState phases)
- [x] Integrate with `packages/shared` types

### Tests Complete (123 total)

- [x] StateMachine: All 10 state transitions
- [x] StateMachine: Invalid transitions blocked
- [x] CardRenderer: Card creation for all 52 indices
- [x] CardRenderer: Zone management (player/dealer)
- [x] AnimationController: Timeline creation (deal, flip, win, lose)
- [x] AnimationController: Cleanup on reset
- [x] GameEngine: Full game flow lifecycle
- [x] GameEngine: Destroy and cleanup
- [x] HandValue: Ace reduction, blackjack detection
- [x] Edge cases: 4 aces, max bust, 7-card Charlie

### Commits

```
9689798 refactor(types): integrate game-engine with shared package types
8fe1986 test(game-engine): add comprehensive edge case tests
e4803c2 feat(game-engine): complete Phase 1 with VyreJackCore alignment
9ea175d feat(game-engine): align phases with VyreJackCore contract
5a27813 feat(game-engine): complete Phase 1 - core modules with 70 tests
```

---

## Phase 2: Integration Bridge

**Target: 0.5 days | Status: ⬜ Not Started**

### Tasks

- [ ] Create `useGameEngine.ts` hook
- [ ] Bridge engine state to Preact components
- [ ] Handle mount/unmount lifecycle
- [ ] Write integration tests
- [ ] Verify no memory leaks

### Tests Required

- [ ] Hook: Engine initialization
- [ ] Hook: State subscription
- [ ] Hook: Cleanup on unmount
- [ ] Hook: Multiple mounts/unmounts (fuzzing)

---

## Phase 3: GameBoard Migration

**Target: 1 day | Status: ⬜ Not Started**

### Tasks

- [ ] Create `GameCanvas.tsx` mount point
- [ ] Modify `GameBoardCasino.tsx` to use engine
- [ ] Migrate card event handling
- [ ] Remove old card rendering logic
- [ ] Create CSS for game-engine elements
- [ ] Integration testing with real events

### Tests Required

- [ ] E2E: Page loads without errors
- [ ] E2E: Cards appear on deal
- [ ] E2E: Animations complete
- [ ] E2E: Result overlay shows
- [ ] Invariant: Card count never exceeds limits

---

## Phase 4: Cleanup & Optimization

**Target: 0.5 days | Status: ⬜ Not Started**

### Tasks

- [ ] Remove `useAnimationProcessor.ts`
- [ ] Remove `useAnimationOrchestrator.ts`
- [ ] Remove `AnimationSystemTest.tsx`
- [ ] Simplify `gameStore.ts`
- [ ] Remove unused SSOT state
- [ ] Final E2E test suite
- [ ] Performance benchmarking

### Tests Required

- [ ] Full E2E game flow
- [ ] Memory leak detection
- [ ] Animation timing verification
- [ ] Stress test (rapid actions)

---

## Test Strategy

| Type        | Tool                   | When                     |
| ----------- | ---------------------- | ------------------------ |
| Unit        | Vitest                 | During development (TDD) |
| Invariant   | Vitest + fast-check    | End of each phase        |
| Fuzzing     | Vitest + random inputs | End of each phase        |
| E2E         | Playwright             | After integration        |
| Performance | Lighthouse             | Final phase              |

---

## Files Changed Log

| File                                      | Change Type | Phase | Status |
| ----------------------------------------- | ----------- | ----- | ------ |
| `src/lib/game-engine/*`                   | NEW         | 1     | ✅     |
| `packages/shared/src/types/game.ts`       | MODIFY      | 1     | ✅     |
| `src/hooks/useGameEngine.ts`              | NEW         | 2     | ⬜     |
| `src/components/game/GameCanvas.tsx`      | NEW         | 3     | ⬜     |
| `src/components/game/GameBoardCasino.tsx` | MODIFY      | 3     | ⬜     |
| `src/hooks/useAnimationProcessor.ts`      | DELETE      | 4     | ⬜     |
| `src/hooks/useAnimationOrchestrator.ts`   | DELETE      | 4     | ⬜     |
