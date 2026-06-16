# Bounded Configuration Layer — Spec

> Status: IN PROGRESS · Target: public testnet/beta · Author: design pass 2026-06-15

## Implementation status (2026-06-15)

| Group                   | Status               | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 — Edge split          | ✅ DONE (TDD)        | `setEdgeSplit()` atomic, `require(sum==10000)`, `EdgeSplitUpdated`. Removed unsafe `setReferralShare`. Fixes audit M5. 4 new tests.                                                                                                                                                                                                                                         |
| 3 — Referral anti-sybil | ◑ PARTIAL (TDD)      | 1-level cycle guard in `setReferrer` shipped (kills A↔B loop, audit H4). Shares were already bounded (`setShares`). DEFERRED: `minReferrerLevel` (needs XPRegistry dependency; off in beta anyway), `referralMaxShareOfNetLossBps` (needs referee net-loss tracking; mainnet anti-drain).                                                                                   |
| 4 — Deposit policy      | ✅ NO CODE NEEDED    | Per-asset `enabled` flag + `setSupportedAssetEnabled()` already exist; deposits already gate on it. Beta "USDC-only" is a deploy-time config (enable USDC only). `swapToUsdcOnDeposit` is a mainnet peg fix (C2) — deferred.                                                                                                                                                |
| 1 — House edge model    | ⛔ DEFERRED (design) | `houseEdgeMode`/`pushReturnsFullBet` need the stake at settlement, which VyreCasino doesn't have (it gets only gross via `settlePayout`). Requires changing the settlement signature OR moving edge calc into the game — overlaps audit H1 (no per-bet escrow). Needs its own design pass. `surrenderReturnBps` is clean inside VyreJackCore and can ship with the 1b work. |

Full non-fork suite green after these changes: 609 passed / 0 failed.

---

## Goal

Turn the economic/policy decisions that are currently hardcoded (or only
partially settable) into **owner-configurable parameters with hard on-chain
bounds**, so they can be calibrated with real beta data without redeploying
logic — and without the config knob itself becoming an exploit.

Principle: **every configurable parameter ships with (a) a `MAX_*` constant
enforced in its setter, (b) a typed `…Updated(old, new)` event, and (c) a safe
default**. For mainnet, sensitive setters move behind a timelock (noted, not
built for beta).

This is NOT a central config contract. Each knob lives in the contract that owns
it (avoids a new cross-contract dependency + upgrade coupling). Consistency comes
from a shared setter pattern, not a shared storage contract.

---

## Knob group 1 — House edge model (`VyreCasino`, `VyreJackCore`)

Current: `houseEdgeBps = 200` applied to **grossPayout** (which includes the
returned stake), so a 2x win is charged ~4% of stake and a PUSH costs 2% of
stake. Surrender returns a hardcoded 50%.

| Knob                 | Type              | Current                | Proposed bound                       | Default  | Notes                                   |
| -------------------- | ----------------- | ---------------------- | ------------------------------------ | -------- | --------------------------------------- |
| `houseEdgeBps`       | uint16            | 200 (hardcoded setter) | `<= MAX_HOUSE_EDGE_BPS` (1000 = 10%) | 200      | bound the existing `setHouseEdge`       |
| `houseEdgeMode`      | enum {GROSS, NET} | implicit GROSS         | n/a                                  | **NET**  | NET = edge on (payout − stake) only     |
| `pushReturnsFullBet` | bool              | false (edge taken)     | n/a                                  | **true** | true = PUSH refunds full stake, no edge |
| `surrenderReturnBps` | uint16            | 5000 (constant)        | `>= MIN` (2500) and `<= 5000`        | 5000     | late-surrender refund fraction          |

Behavioral change: `_calculateHouseEdge` becomes mode-aware; PUSH/surrender paths
honor the flags. Default values reproduce standard blackjack.

---

## Knob group 2 — Edge split shares (`VyreCasino`) ← fixes audit M5

Current: `referralShareBps=5000`, `treasuryShareBps=3000`, `buybackShareBps=2000`
are independent; only referral has a setter; nothing enforces they sum to 100%.
A bad config makes the treasury pay out more edge than it collected.

| Knob       | Type      | Current            | Bound                                   | Default            |
| ---------- | --------- | ------------------ | --------------------------------------- | ------------------ |
| edge split | 3× uint16 | 5000 / 3000 / 2000 | **`ref + treasury + buyback == 10000`** | 5000 / 3000 / 2000 |

Replace the three independent fields/setters with one atomic setter
`setEdgeSplit(referralBps, treasuryBps, buybackBps)` that `require`s the sum is
exactly 10000 and emits `EdgeSplitUpdated`. Removes the >100% footgun entirely.

---

## Knob group 3 — Referral anti-sybil policy (`ReferralRegistry`)

Current: `directShareBps=5000`, `indirectShareBps=1000`, `selfReferralAllowed=false`.
Only direct self-referral is blocked; no cycle check, no net-loss cap, no gating —
fully sybil-farmable (audit H4).

| Knob                           | Type   | Current | Bound                        | Default          |
| ------------------------------ | ------ | ------- | ---------------------------- | ---------------- | -------------------------------- |
| `directShareBps`               | uint16 | 5000    | `<= MAX_REFERRAL_BPS` (5000) | 5000             |
| `indirectShareBps`             | uint16 | 1000    | `<= MAX_REFERRAL_BPS`        | 1000             |
| `selfReferralAllowed`          | bool   | false   | n/a                          | false            |
| `referralMaxShareOfNetLossBps` | uint16 | — (new) | `<= 10000`                   | 5000             | cap earnings vs referee net loss |
| `minReferrerLevel`             | uint8  | — (new) | `<= 50`                      | 0 (off for beta) | gate via XPRegistry level        |

Plus one piece of logic (not a knob): a 1-level **cycle guard** in `setReferrer`
rejecting A→B when B→A already exists. (Deeper sybil mitigation is off-chain;
out of scope for beta.)

---

## Knob group 4 — Deposit asset policy (`CHIPWrapper`)

Current: accepts ETH/USDC/USDT/WBTC; only USDC backs redemptions (audit C2 peg —
a MAINNET blocker, parked). For beta we make the accepted set explicit & toggleable.

| Knob                  | Type                  | Bound | Default (beta)                              |
| --------------------- | --------------------- | ----- | ------------------------------------------- |
| per-asset `enabled`   | bool (in TokenConfig) | n/a   | **only USDC enabled**                       |
| `swapToUsdcOnDeposit` | bool (per asset)      | n/a   | false (placeholder for the mainnet peg fix) |

For beta: ship with non-USDC assets **disabled** so the peg can't break; the knob
exists so they can be enabled later once swap-on-deposit lands.

---

## Cross-cutting

- **Setter pattern**: `require(value <= MAX_X, "…: over max")` then assign then
  `emit XUpdated(old, value)`. `MAX_*` are `constant`. No silent clamping.
- **Events**: every setter emits old+new — feeds monitoring + the indexer.
- **Ownership**: owner-gated now (→ SAFE). Mainnet: sensitive setters
  (edge, split, deposit-enable) behind a timelock. Tracked, not built for beta.
- **Tests (TDD, Foundry)**: for each knob — (1) default reproduces current
  behavior, (2) setter rejects over-bound, (3) setter rejects bad invariant
  (e.g. split ≠ 10000), (4) event emitted, (5) behavior changes as configured.

---

## Decisions for you (set the values)

1. `MAX_HOUSE_EDGE_BPS` — cap the house edge knob at 10% (1000)? Higher/lower?
2. Default `houseEdgeMode` — confirm **NET** (standard) vs keep GROSS.
3. `surrenderReturnBps` floor — 25% min OK, or different?
4. `referralMaxShareOfNetLossBps` default — 50%? And `minReferrerLevel` — 0 (off)
   for beta, or gate from day 1?
5. Deposit assets at beta launch — USDC-only (recommended), or enable others now?
