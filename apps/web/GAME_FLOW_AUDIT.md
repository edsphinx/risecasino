# VyreJack Game Flow Audit — 2026-02-06

Comprehensive UX audit tracing every state transition across all layers:
Contract → WebSocket → Store → Hooks → UI

---

## CRITICAL — User gets stuck, cannot recover without refresh

### BUG-01: `placeBet` error paths leave phase stuck at `waiting_vrf`

**Files:** `useVyreCasinoActions.ts:449-472`, `GameBoardCasino.tsx:146-152`

When `placeBet` is called, phase is set to `waiting_vrf` BEFORE the transaction.
Three error paths exist, but only ONE resets phase:

```
Path 1: !txHash           → setGamePhase('idle')  ✅
Path 2: approval fails    → return false           ❌ phase stays waiting_vrf
Path 3: catch (exception) → setError(...)          ❌ phase stays waiting_vrf
```

**Impact:** After paths 2 or 3, `canBet` evaluates:

```ts
const canBet = ... && gamePhase === 'idle';  // false! phase is 'waiting_vrf'
```

BettingPanel renders with a **permanently disabled DEAL button**. The user sees the
betting UI but cannot interact. Only a page refresh recovers.

**Repro:** Bet with insufficient allowance → cancel the passkey popup.

**Fix:** Add `setGamePhase('idle')` to the catch block and the approval failure path.

---

### BUG-02: Hydration + WebSocket race creates duplicate cards

**Files:** `useGameState.ts:156-226` (hydration), `useGameState.ts:252-290` (handleCardDealt)

When VRF responds in the same block as the bet TX (common on RiseChain):

```
1. placeBet TX sent → phase = 'waiting_vrf'
2. VRF responds in same block → contract has 4 cards
3. onSuccess() → refetchGame() → contract returns 4 cards
4. Hydration fires: SSOT empty + phase=waiting_vrf + contract has cards → hydrateFromContract()
5. SSOT now has [P1, P2] player cards, [D1, D2] dealer cards, phase → 'player_turn'
6. WebSocket CardDealt events arrive (same 4 cards)
7. handleCardDealt calls addGameCard() for each → SSOT becomes [P1, P2, P1, P2]!
```

`handleCardDealt` has no dedup against SSOT — it always calls `addGameCard()`.
The WebSocket dedup only prevents the same _event_ twice, not the same _card value_.

**Impact:** Player sees 4 cards but SSOT has 8 entries. Hand value calculates from
all 8, showing incorrect value. Action buttons enabled with wrong canDouble state.

**Repro:** Play on RiseChain when VRF responds in <100ms (same-block fulfillment).

**Fix:** In `handleCardDealt`, before calling `addGameCard`, check if SSOT already has
enough cards for the current phase (e.g., skip if phase is already `player_turn` and
SSOT has >= 2 player cards for an initial deal event).

---

## HIGH — Visible UX problems

### BUG-03: STAND/SURRENDER buttons flash back briefly after TX completes

**Files:** `useVyreCasinoActions.ts:477-524`, `GameBoardCasino.tsx:480`

`executeGameAction` only sets `waiting_vrf` for `hit` and `double`:

```ts
if (action === 'hit' || action === 'double') {
  useGameStore.getState().setGamePhase('waiting_vrf');
}
```

For `stand` and `surrender`, phase stays `player_turn`. After TX completes:

1. `isLoading` → false, `pendingAction` → null
2. Phase still `player_turn`, `isPlayerTurn` still true (stale service.game)
3. **ActionButtons render and are clickable for ~100-500ms**
4. refetchGame returns → contract state = DealerTurn → buttons disappear

**Impact:** User could click HIT after STAND. Contract rejects (wrong state),
but an error toast fires and confuses the user.

**Fix:** Set a transitional phase (e.g., `dealer_reveal`) immediately for stand/surrender
in `executeGameAction`, before sending the TX.

---

### BUG-04: VRFWaitingOverlay exists but is never rendered

**Files:** `VRFWaitingOverlay.tsx` (defined), `GameBoardCasino.tsx` (not used)

The component has a well-designed 3-phase UI:

- 0-60s: "Dealing cards..." with spinner
- 60s-5min: "VRF Delayed" with timer
- > 5min: Cancel button for full refund

But `GameBoardCasino` never renders it. When VRF is slow (can take >2min on
Rise testnet), the user only sees the generic "⏳ Waiting for dealer..." text
with no timer, no progress indicator, and no cancel option.

**Impact:** During slow VRF, user has zero feedback on progress and no way to
cancel a stuck game from the UI. They must wait indefinitely or refresh.

**Fix:** Render `VRFWaitingOverlay` when `gamePhase === 'waiting_vrf'` and a
configurable threshold has passed (e.g., 10 seconds).

---

### BUG-05: Double down bet display shows 1x instead of 2x

**Files:** `GameBoardCasino.tsx:534-558`, `useGameState.ts:354-362`

Two issues compound:

**A)** `handleGameResolved` sets `bet: 0n` in the result snapshot:

```ts
setLastGameResult({
  ...
  bet: 0n,  // ← always zero
});
```

The on-table bet display during result: `displayBet = lastGameResult.bet` → 0n → shows `--`.

**B)** The overlay receives `bet={betAmount}` (the user's INPUT string). For a doubled
bet of 100 CHIP, the overlay shows "100 CHIP" but the actual bet was 200 CHIP.
If the player loses, they lost 200 but the overlay suggests 100.

**Impact:** Player doesn't see the true doubled amount they wagered.

**Fix:**

- Pass `event.payout` or compute bet from the GamePlayed event's `bet` field
- For doubled games, display `2 × bet` in the overlay

---

### BUG-06: `useAnimationOrchestrator` is effectively dead code

**Files:** `useAnimationOrchestrator.ts`, `useGameState.ts:276-277`

`handleCardDealt` calls BOTH `addGameCard()` AND `revealNextCard()` synchronously:

```ts
addGameCard(event.card, event.isDealer, isHidden);
revealNextCard(event.isDealer); // ← instant reveal
```

After both calls: `cards.length === revealedCount` → `totalPending = 0`.
The orchestrator watches `totalPending` and only starts its timer when `> 0`.
Since pending is always 0, **the timer never starts**.

Similarly, `hydrateFromContract()` sets `revealedCount = cards.length`, so
pending is also 0 after hydration.

**Impact:** No staggered card deal animation. All 4 initial cards appear at once
when WebSocket delivers them in a single batch (common with 10ms blocks).
The `CARD_REVEAL_INTERVAL` (450ms) config is unused.

**Fix:** Remove `revealNextCard()` from `handleCardDealt`. Let the orchestrator
control all reveal timing. handleCardDealt should ONLY call `addGameCard()`.
Then update the orchestrator's phase transition logic to replace handleCardDealt's
"4 cards → player_turn" check.

---

## MEDIUM — Subtle UX issues

### BUG-07: "Waiting for dealer" shown during initial deal VRF

**Files:** `GameBoardCasino.tsx:490-493`

When VRF is pending for the initial deal:

- `gamePhase = 'waiting_vrf'`
- `hasActiveGame = true` (contract state = WaitingForDeal)
- `isPlayerTurn = false`
- `isWaitingDealer = true` → shows "⏳ Waiting for dealer..."

Semantically, the dealer isn't "thinking" — the blockchain is generating randomness.
The message is misleading for the initial deal.

**Fix:** Distinguish between initial VRF (show shuffle animation or "Shuffling deck...")
and dealer-turn VRF (show "Waiting for dealer...").

---

### BUG-08: Controls "PLAY AGAIN" vs overlay "PLAY AGAIN" behave differently

**Files:** `GameBoardCasino.tsx:473-478` (controls), `GameBoardCasino.tsx:545-558` (overlay)

| Button     | Location       | Behavior                                                   |
| ---------- | -------------- | ---------------------------------------------------------- |
| PLAY AGAIN | Controls panel | Resets to idle (BettingPanel) — user must click DEAL again |
| PLAY AGAIN | Result overlay | Immediately places new bet with same amount                |

Between `showingResult = true` and `showResultOverlay = true` (animation delay of
300-1100ms), the controls PLAY AGAIN is visible. Clicking it returns to idle instead
of starting a new game — surprising if the user expected the overlay behavior.

**Fix:** Either make both buttons behave the same, or hide the controls PLAY AGAIN
when the overlay is about to appear.

---

### BUG-09: WebSocket reconnection drops events silently during `player_turn`

**Files:** `useGameEvents.ts:82-365`, `useGameState.ts:232-249`

Safety-net refetch timers only fire during `waiting_vrf` phase. If WebSocket disconnects
and reconnects during `player_turn`:

- CardDealt events from a HIT might be lost
- No safety net catches this because phase is `player_turn`
- The yellow "Connection lost" banner shows, but no automatic recovery

**Impact:** After reconnection, SSOT may be stale. Player sees old hand while contract
has new cards.

**Fix:** After WebSocket reconnects (`isConnected` transitions false → true), trigger
a refetch regardless of phase. Compare contract state with SSOT and hydrate if needed.

---

### BUG-10: GamePlayed event lacks hand values — local calculation can diverge

**Files:** `useGameEvents.ts:153-160`, `useGameState.ts:336-344`

The frontend listens to `GamePlayed` (not `GameResolved`). GamePlayed only has
`(player, token, bet, won, payout)` — no hand values. So `playerFinalValue` and
`dealerFinalValue` are always 0:

```ts
callbacksRef.current.onGameResolved({
  result: gameResult,
  payout: args.payout,
  playerFinalValue: 0, // ← always 0
  dealerFinalValue: 0, // ← always 0
});
```

The hook falls back to `calculateLocalHandValue()` from SSOT cards. If SSOT is
incomplete (WebSocket missed a card), the displayed value is WRONG.

**Fix:** Add a subscription to the `GameResolved` event (which includes
`playerFinalValue` and `dealerFinalValue`) and prefer those values.

---

## LOW — Edge cases, minor polish

### BUG-11: `canDouble`/`canSurrender` use stale contract data

**Files:** `GameBoardCasino.tsx:486-487`

```ts
canDouble={game?.playerCards.length === 2}
canSurrender={game?.playerCards.length === 2}
```

`game?.playerCards` comes from `service.game` (last refetch), not SSOT. If SSOT has
3 cards (after HIT) but refetch hasn't returned yet, `canDouble` would still be `true`.

**Impact:** Minimal — action buttons are hidden during `waiting_vrf` (post-HIT), so
the stale condition is never visible. But it's fragile if button visibility logic changes.

---

### BUG-12: Overlay's `onPlayAgain` is fire-and-forget

**Files:** `GameBoardCasino.tsx:545-558`

```ts
onPlayAgain={(newBet) => {
  ...
  actions.placeBet(newBet, token);  // ← not awaited
}}
```

If `placeBet` fails after the overlay dismisses, the error toast shows but the user
may not understand the context (they already "closed" the result).

---

### BUG-13: `processedEvents` dedup set grows unboundedly

**Files:** `useGameEvents.ts:77`

```ts
const processedEvents = useRef<Set<string>>(new Set());
```

Every event's `txHash-logIndex` is added, never removed. Over many games in a single
session, this set grows without bound. Not a practical issue for normal play, but
could cause memory pressure in long-running sessions.

---

## STATE MACHINE DIAGRAM

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  ┌─────┐  bet   ┌─┴──────────┐  CardDealt×1  ┌────────────┐ │
  │ idle │───────►│waiting_vrf │──────────────►│dealing_init│ │
  └──┬──┘        └─────┬──────┘               └─────┬──────┘ │
     │                 │ hydration                   │ 4 cards │
     │                 │ (safety net)                ▼         │
     │                 │                     ┌─────────────┐   │
     │                 └────────────────────►│ player_turn │   │
     │                                       └──┬──┬──┬───┘   │
     │                            hit/double │  │  │  │        │
     │                   ┌───────────────────┘  │  │  │        │
     │                   ▼                      │  │  │        │
     │          ┌────────────────┐   stand/     │  │  │        │
     │          │ waiting_vrf    │   surrender  │  │  │        │
     │          │ (HIT/DOUBLE)   │◄────────BUG──┘  │  │        │
     │          └───────┬────────┘ (no phase set)  │  │        │
     │                  │ GamePlayed               │  │        │
     │                  ▼                          │  │        │
     │         ┌──────────────┐  GamePlayed        │  │        │
     │         │dealer_reveal │◄───────────────────┘  │        │
     │         └──────┬───────┘                       │        │
     │                │ animation delay               │        │
     │                ▼                               │        │
     │        ┌───────────────┐                       │        │
     │        │showing_result │                       │        │
     │        └──┬─────────┬──┘                       │        │
     │   change  │         │ play again               │        │
     │    bet    │         │                          │        │
     │           ▼         └──────────────────────────┘        │
     └───────────┘                                             │
                                                               │
     BUG-01: error in placeBet ─── phase stays waiting_vrf ────┘
             (user stuck, DEAL disabled)
```

---

## PRIORITY FIX ORDER

| #   | Bug                                  | Severity | Effort | Impact                  |
| --- | ------------------------------------ | -------- | ------ | ----------------------- |
| 1   | BUG-01: placeBet stuck phase         | CRITICAL | 5 min  | User completely stuck   |
| 2   | BUG-03: STAND/SURRENDER button flash | HIGH     | 10 min | Confusing double-action |
| 3   | BUG-02: Hydration duplicate cards    | CRITICAL | 30 min | Corrupted game state    |
| 4   | BUG-05: Doubled bet display          | HIGH     | 15 min | Misleading bet info     |
| 5   | BUG-04: VRFWaitingOverlay unused     | HIGH     | 20 min | No VRF progress/cancel  |
| 6   | BUG-06: Dead orchestrator            | MEDIUM   | 30 min | No deal animation       |
| 7   | BUG-09: WS reconnect recovery        | MEDIUM   | 15 min | Stale state after drop  |
| 8   | BUG-10: Missing GameResolved sub     | MEDIUM   | 15 min | Wrong hand values       |
| 9   | BUG-07: Wrong waiting message        | MEDIUM   | 5 min  | Misleading text         |
| 10  | BUG-08: Inconsistent Play Again      | MEDIUM   | 10 min | Surprise behavior       |
