# GameEngine Architecture Overview

## Problem Statement

The current Preact + GSAP architecture has fundamental conflicts:

- Preact hooks manage component lifecycle
- GSAP directly manipulates DOM
- Both try to control the same elements → race conditions, `__H` errors

## Solution: Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VANILLA TS GAME ENGINE                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ StateMachine │  │ CardRenderer │  │ AnimationController      │  │
│  │              │──│              │──│                          │  │
│  │ Pure TS      │  │ DOM Direct   │  │ GSAP Wrapper             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                              │                                      │
│                    ┌─────────┴─────────┐                           │
│                    │    GameEngine     │                           │
│                    │   (Orchestrator)  │                           │
│                    └─────────┬─────────┘                           │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ Events
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PREACT UI LAYER                             │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐               │
│  │ BettingUI  │  │ ResultOverlay│  │ ActionButtons │               │
│  └────────────┘  └──────────────┘  └───────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **Separation of Concerns**
   - GameEngine owns cards and animations
   - Preact owns UI forms and overlays

2. **No Hook Conflicts**
   - GameEngine is pure TypeScript classes
   - No useEffect, useState in game logic

3. **Event-Driven Communication**
   - Engine emits state changes
   - Preact subscribes to updates

4. **GSAP Freedom**
   - AnimationController has full DOM control
   - No React/Preact interference

## Module Responsibilities

| Module                | Responsibility                      |
| --------------------- | ----------------------------------- |
| `StateMachine`        | Game state, transitions, validation |
| `CardRenderer`        | DOM card elements, zones            |
| `AnimationController` | GSAP timelines, effects             |
| `GameEngine`          | Public API, coordination            |

## Data Flow

```
Contract Event → useGameState → GameEngine.dealCard()
                                     │
                                     ├─→ StateMachine.addCard()
                                     ├─→ CardRenderer.createCard()
                                     └─→ AnimationController.animateDeal()
```

## See Also

- [Module Specifications](./modules.md)
- [Testing Strategy](./testing.md)
- [Migration Guide](./migration.md)
