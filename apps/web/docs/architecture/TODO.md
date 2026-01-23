# GameEngine Architecture TODO

> **Last Updated:** 2026-01-23  
> **Status:** 🟡 In Progress

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

## Phase 1: Core GameEngine Module

**Target: 1-2 days | Status: ⬜ Not Started**

### Tasks

- [ ] Create `docs/architecture/` documentation structure
- [ ] Create `types.ts` with all interfaces
- [ ] Create `StateMachine.ts` with game state logic
- [ ] Create `CardRenderer.ts` for DOM manipulation
- [ ] Create `AnimationController.ts` GSAP wrapper
- [ ] Create `GameEngine.ts` main orchestrator
- [ ] Write unit tests for StateMachine (TDD)
- [ ] Write unit tests for CardRenderer (TDD)
- [ ] Write invariant tests for Phase 1
- [ ] Run fuzzing tests with random inputs

### Tests Required

- [ ] StateMachine: All state transitions
- [ ] StateMachine: Invalid transitions blocked
- [ ] CardRenderer: Card creation
- [ ] CardRenderer: Zone management
- [ ] AnimationController: Timeline creation
- [ ] AnimationController: Cleanup on reset

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

## Observations Log

### 2026-01-23

- **Issue Found**: Preact `__H` hook errors in E2E tests
- **Root Cause**: GSAP DOM manipulation conflicts with Preact reconciliation
- **Solution**: Hybrid architecture separates concerns

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

| File                                      | Change Type | Phase |
| ----------------------------------------- | ----------- | ----- |
| `src/lib/game-engine/*`                   | NEW         | 1     |
| `src/hooks/useGameEngine.ts`              | NEW         | 2     |
| `src/components/game/GameCanvas.tsx`      | NEW         | 3     |
| `src/components/game/GameBoardCasino.tsx` | MODIFY      | 3     |
| `src/hooks/useAnimationProcessor.ts`      | DELETE      | 4     |
| `src/hooks/useAnimationOrchestrator.ts`   | DELETE      | 4     |
