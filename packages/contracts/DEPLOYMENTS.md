# VyreCasino Deployment Changelog

## Rise Testnet

---

## VyreCasino Architecture v7.0 (Circuit Breaker) - 2026-01-20

**Deployed via Hardhat**  
**New Features:** Circuit Breaker (daily payout limits), improved security

### VyreCasino V4 ⭐ CURRENT

**Contract:** VyreCasino (Central Orchestrator with Circuit Breaker)  
**Version:** v4.0.0  
**Address:** [`0xE7fD65F31f6daB86593A89113a240827e561F574`](https://explorer.testnet.riselabs.xyz/address/0xE7fD65F31f6daB86593A89113a240827e561F574)  
**Owner:** Deployer (pending SAFE transfer)  
**Verified:** Pending

**New Features (v4.0):**

- Circuit Breaker with daily payout limits per token
- `setDailyPayoutLimit(token, limit)` admin function
- `setCircuitBreakerEnabled(bool)` toggle
- `getTodayPayouts(token)` view function
- `getRemainingPayoutCapacity(token)` view function
- `CircuitBreakerTriggered` event

**Configuration:**

| Setting              | Value                                        |
| -------------------- | -------------------------------------------- |
| Treasury             | `0x2be1229CEcF28702A50f68eD9592234a830845ae` |
| CHIP Token           | `0x4B882AF56262d2786754E38600589fc1347FdF1E` |
| USDC                 | `0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8` |
| House Edge           | 2% (200 bps)                                 |
| USDC Daily Limit     | 1,000 USDC                                   |
| Circuit Breaker      | Enabled                                      |

### VyreJackCore (UUPS Proxy) ⭐ CURRENT

**Contract:** VyreJackCore (UUPS Upgradeable Blackjack Game)  
**Proxy Address:** [`0x961715D101DaadfE477c7A7C136dCBbca3A9ad10`](https://explorer.testnet.riselabs.xyz/address/0x961715D101DaadfE477c7A7C136dCBbca3A9ad10)  
**Implementation:** [`0xb0Cb2CF16418af6751D312544A56c58EEa46eF0A`](https://explorer.testnet.riselabs.xyz/address/0xb0Cb2CF16418af6751D312544A56c58EEa46eF0A)  
**Owner:** SAFE Multisig  
**Casino:** `0xE7fD65F31f6daB86593A89113a240827e561F574` (pending update via SAFE)  
**VRF Coordinator:** `0x9d57aB4517ba97349551C876a01a7580B1338909`  
**Verified:** ✅ Both Proxy and Implementation

### VyreTreasury

**Contract:** VyreTreasury  
**Address:** [`0x2be1229CEcF28702A50f68eD9592234a830845ae`](https://explorer.testnet.riselabs.xyz/address/0x2be1229CEcF28702A50f68eD9592234a830845ae)  
**Owner:** SAFE Multisig  
**Operator:** Pending update to `0xE7fD65F31f6daB86593A89113a240827e561F574`  
**Verified:** ✅

### Pending SAFE Transactions

| Action | Contract | Function | Data |
|--------|----------|----------|------|
| 1 | VyreTreasury | `setOperator(address)` | `0xb3ab15fb000000000000000000000000e7fd65f31f6dab86593a89113a240827e561f574` |
| 2 | VyreJackCore | `setCasino(address)` | `0xd7b9cc24000000000000000000000000e7fd65f31f6dab86593a89113a240827e561f574` |
| 3 | VyreCasino | `acceptOwnership()` | `0x79ba5097` |

### Ownership Structure (V7)

```
SAFE Multisig (2/3) ─────────────────────────────────────────
│                       0x108ca5cf...31                      │
├──────────┬──────────────────────────────────────────────────┤
▼          ▼
VyreJackCore    VyreTreasury
(UUPS Proxy)    (vault)
      ↓               ↓
      └───────────────┴────→ VyreCasino V4 (pending ownership)
                             0xE7fD65F31f6daB86593A89113a240827e561F574
```

---

## VyreCasino Architecture v6.0 (UUPS) - 2026-01-11

## VyreCasino Architecture v3.0 - 2026-01-07

**Deployed via Safe SDK with multisig ownership**  
**New Features:** Multi-asset CHIPWrapper, Permit2 gasless approvals, Oracle pricing

### CHIPToken (v4.1 - 500M/500M Distribution)

**Contract:** CHIPToken (ERC20)  
**Address:** [`too`](https://explorer.testnet.riselabs.xyz/address/0x4B882AF56262d2786754E38600589fc1347FdF1E)  
**Symbol:** CHIP  
**Initial Supply:** 1,000,000,000 CHIP (500M deployer, 500M treasury)  
**Owner:** CHIPWrapper (for mint/burn)  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0x4B882AF56262d2786754E38600589fc1347FdF1E#code)

**Features:**

- ERC-7572 contractURI for wallet icon
- EIP-2612 Permit for gasless approvals
- Burnable

### CHIPWrapper (v4.1)

**Contract:** CHIPWrapper (Multi-Asset Minting)  
**Address:** [`0xA24d573d133F80E4494F92f345c4b857a6e2e036`](https://explorer.testnet.riselabs.xyz/address/0xA24d573d133F80E4494F92f345c4b857a6e2e036)  
**Owner:** Deployer (pending SAFE transfer for production)  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0xA24d573d133F80E4494F92f345c4b857a6e2e036#code)

**Features:**

- Multi-asset deposits (ETH, USDC via oracles)
- Permit2 gasless deposits
- 0.5% withdrawal fee to treasury

**Oracles Configured:**

| Asset | Oracle Address                               |
| ----- | -------------------------------------------- |
| ETH   | `0x7114E2537851e727678DE5a96C8eE5d0Ca14f03D` |
| USDC  | `0x50524C5bDa18aE25C600a8b81449B9CeAeB50471` |

### VyreTreasury

**Contract:** VyreTreasury  
**Address:** [`0x2be1229CEcF28702A50f68eD9592234a830845ae`](https://explorer.testnet.riselabs.xyz/address/0x2be1229CEcF28702A50f68eD9592234a830845ae)  
**Owner:** SAFE Multisig  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0x2be1229CEcF28702A50f68eD9592234a830845ae#code)

### VyreCasino

**Contract:** VyreCasino (Central Orchestrator)  
**Version:** v4.0 (Payout Fix)  
**Address:** [`0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C`](https://explorer.testnet.riselabs.xyz/address/0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C)  
**Owner:** SAFE Multisig  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C#code)

**New Features (v4.0):**

- `settlePayout()` callback for async games
- `PayoutSettled` event for tracking
- Permit2 playWithPermit() for gasless betting
- XP integration
- Multi-tier referral system

**Configuration:**

| Setting     | Value                                        |
| ----------- | -------------------------------------------- |
| Treasury    | `0x2be1229CEcF28702A50f68eD9592234a830845ae` |
| CHIP Token  | `0x4B882AF56262d2786754E38600589fc1347FdF1E` |
| House Edge  | 2% (200 bps)                                 |
| Whitelisted | CHIP, USDC                                   |

### VyreJackCore

**Contract:** VyreJackCore (Blackjack Game)  
**Version:** v4.0 (Payout Fix)  
**Address:** [`0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e`](https://explorer.testnet.riselabs.xyz/address/0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e)  
**Owner:** SAFE Multisig  
**VRF Coordinator:** `0x9d57aB4517ba97349551C876a01a7580B1338909`  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e#code)

**New Features (v4.0):**

- Calls `VyreCasino.settlePayout()` for actual payouts
- Emits `GameResolved` with final hand values
- Emits `PlayerBusted` / `DealerBusted` for animations
- Emits `DealerCardRevealed` for hole card reveal

### Ownership Structure

```
SAFE Multisig (2/3) ─────────────────────────────────────────
│                       0x108ca5cf...31                      │
├──────────┬──────────┬──────────────┬───────────────────────┤
▼          ▼          ▼              ▼
CHIPWrapper VyreTreasury VyreCasino  VyreJackCore
(mints CHIP) (holds funds) (orchestrator) (game logic)
```

---

## VyreCasino Architecture v2.0 - 2026-01-06 (DEPRECATED)

### VyreTreasury

**Contract:** VyreTreasury  
**Address:** [`0x53052Fc42f81bf211a81C5b99Ec1fAAc42522644`](https://explorer.testnet.riselabs.xyz/address/0x53052Fc42f81bf211a81C5b99Ec1fAAc42522644)  
**Owner:** SAFE Multisig `0x108ca5cf713cb0b964d187f19cd7b7d317841c31`  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0x53052Fc42f81bf211a81C5b99Ec1fAAc42522644#code)

**Treasury Balances:**

| Token | Amount    |
| ----- | --------- |
| CHIP  | 8,000,000 |
| USDC  | 500       |

### VyreCasino

**Contract:** VyreCasino (Central Orchestrator)  
**Address:** [`0xB841E36b03801B658aaB347F696232f99b844d83`](https://explorer.testnet.riselabs.xyz/address/0xB841E36b03801B658aaB347F696232f99b844d83)  
**Owner:** SAFE Multisig  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0xB841E36b03801B658aaB347F696232f99b844d83#code)

**Configuration:**

| Setting            | Value                                        |
| ------------------ | -------------------------------------------- |
| Treasury           | `0x53052Fc42f81bf211a81C5b99Ec1fAAc42522644` |
| CHIP Token         | `0x18cA3c414bD08C74622C3E3bFE7464903d95602A` |
| House Edge         | 2% (200 bps)                                 |
| Whitelisted Tokens | CHIP, USDC                                   |

### VyreJackCore

**Contract:** VyreJackCore (Blackjack Game)  
**Address:** [`0x4a9b126eD3B0a686c803ace5dfA5d220b7b7496B`](https://explorer.testnet.riselabs.xyz/address/0x4a9b126eD3B0a686c803ace5dfA5d220b7b7496B)  
**Owner:** SAFE Multisig  
**VRF Coordinator:** `0x9d57aB4517ba97349551C876a01a7580B1338909`  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0x4a9b126eD3B0a686c803ace5dfA5d220b7b7496B#code)

### Ownership Structure

```
SAFE Multisig (2/3) ─────────────────────────────────────────
│                       0x108ca5cf...31                      │
├────────────────┬──────────────────┬────────────────────────┤
▼                ▼                  ▼
VyreTreasury    VyreCasino        VyreJackCore
(holds funds)   (orchestrator)    (game logic)
```

---

### VyreJackETH v1.0.1 (Standalone) - 2024-12-29

### v1.0.1 - 2024-12-29

**Contract:** RiseJack  
**Address:** [`0xe17C645aE8dC321B41BA00bbc8B9E392342A0cA2`](https://explorer.testnet.riselabs.xyz/address/0xe17C645aE8dC321B41BA00bbc8B9E392342A0cA2)  
**Chain ID:** 11155931  
**TX Hash:** `0xaa4a984769a9f105688de07e3812c1a7c89ab62057004c6226ff3bac5c0ca041`  
**Block:** 31982956  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0xe17c645ae8dc321b41ba00bbc8b9e392342a0ca2)

#### Configuration (Optimized for testnet)

| Parameter       | Value            |
| --------------- | ---------------- |
| VRF Coordinator | Default Rise VRF |
| Min Bet         | 0.00001 ETH      |
| Max Bet         | 0.1 ETH          |
| VRF Timeout     | 10 seconds       |
| Game Cooldown   | 0 seconds        |
| Initial Fund    | 0.001 ETH        |

#### Changes from v1.0.0

- **Enhanced `GameEnded` event** - Now includes `playerFinalValue`, `dealerFinalValue`, `playerCardCount`, `dealerCardCount`
- **Configurable timeouts** - `vrfTimeout` and `gameCooldown` are now admin-settable
- **New admin functions** - `setVRFTimeout()`, `setGameCooldown()`

---

## DeFi Contracts - 2024-12-30

### CHIPToken (v3 - Hardhat + SAFE Owner)

**Contract:** CHIPToken (ERC20)  
**Address:** [`0x18cA3c414bD08C74622C3E3bFE7464903d95602A`](https://explorer.testnet.riselabs.xyz/address/0x18cA3c414bD08C74622C3E3bFE7464903d95602A)  
**Symbol:** CHIP  
**Initial Supply:** 1,000,000,000 CHIP  
**Owner:** SAFE Multisig (see private docs)  
**Verified:** ✅ [Blockscout](https://explorer.testnet.riselabs.xyz/address/0x18cA3c414bD08C74622C3E3bFE7464903d95602A#code)  
**Deployed With:** Hardhat 2.22.17

### UniswapV2Factory (risecasinoswap)

**Contract:** UniswapV2Factory  
**Address:** [`0xB3c8D76d227A8937898BE6c3e1C99ed22CcB5040`](https://explorer.testnet.riselabs.xyz/address/0xb3c8d76d227a8937898be6c3e1c99ed22ccb5040)  
**Source:** Original Uniswap V2 Core (Audited by dApp.org)  
**Solidity:** 0.5.16  
**Verified:** ✅ Blockscout

### UniswapV2Router02 (risecasinorouter)

**Contract:** UniswapV2Router02  
**Address:** [`0x67b3925D7b2b2d9BD316DAC8bCF888A60B9F24F0`](https://explorer.testnet.riselabs.xyz/address/0x67b3925d7b2b2d9bd316dac8bcf888a60b9f24f0)  
**Source:** Original Uniswap V2 Periphery (Audited by dApp.org)  
**Solidity:** 0.6.6  
**WETH:** `0x4200000000000000000000000000000000000006`  
**Verified:** ✅ Blockscout

### CHIP/ETH Liquidity Pool

**Contract:** UniswapV2Pair  
**Address:** [`0x5A36854D9a48957BF78790E974BFC01fbF123a84`](https://explorer.testnet.riselabs.xyz/address/0x5a36854d9a48957bf78790e974bfc01fbf123a84)  
**Initial Liquidity:** 0.0001 ETH + 1000 CHIP  
**Created by:** Factory

### StakingRewards (risecasinosimplestaking)

**Contract:** StakingRewards  
**Address:** [`0x9eEE56e0907AA69f023b29a93Ae5ea54CA8DD8c3`](https://explorer.testnet.riselabs.xyz/address/0x9eee56e0907aa69f023b29a93ae5ea54ca8dd8c3)  
**Source:** Original Synthetix StakingRewards (Audited by Synthetix)  
**Solidity:** 0.5.16  
**Rewards Token:** CHIP (`0x2D97Ba366119e55B1a98D9349ce35868920C7Ae8`)  
**Staking Token:** CHIP/ETH LP (`0x5A36854D9a48957BF78790E974BFC01fbF123a84`)  
**Verified:** ✅ Blockscout

---

### v1.0.0 - 2024-12-29 (Deprecated)

**Contract:** RiseJack  
**Address:** [`0x8a0AaDE6ebDaEF9993084a29a46BD1C93eC6001a`](https://explorer.testnet.riselabs.xyz/address/0x8a0aade6ebdaef9993084a29a46bd1c93ec6001a)  
**Chain ID:** 11155931  
**TX Hash:** `0x38dde0765b7e96f805d2d9806ee1a3e4d8ac5e7cb5b18e7e50103486ff078bf0`  
**Status:** ⛔ Deprecated - Funds withdrawn  
**Verified:** ✅ Blockscout

#### Configuration

| Parameter       | Value                                        |
| --------------- | -------------------------------------------- |
| VRF Coordinator | `0x9d57aB4517ba97349551C876a01a7580B1338909` |
| Min Bet         | 0.001 ETH                                    |
| Max Bet         | 1 ETH                                        |
| VRF Timeout     | 5 minutes (hardcoded)                        |
| Game Cooldown   | 30 seconds (hardcoded)                       |

#### Features

- Core gameplay (hit, stand, double, surrender)
- Rise VRF integration
- House protection (daily limits, circuit breaker)
- Admin functions (pause, force resolve, withdraw)

---

## Deployment Commands

### Rise Testnet

```bash
source .env
forge script script/Deploy.s.sol:DeployTestnet \
  --rpc-url https://testnet.riselabs.xyz \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url 'https://explorer.testnet.riselabs.xyz/api/'
```

### Verify Existing Contract

```bash
export ETHERSCAN_API_KEY=dummy
forge verify-contract \
  --rpc-url https://testnet.riselabs.xyz \
  --verifier blockscout \
  --verifier-url 'https://explorer.testnet.riselabs.xyz/api/' \
  <address> \
  src/RiseJack.sol:RiseJack
```

---

## Future Deployments

| Network      | Status     | Notes         |
| ------------ | ---------- | ------------- |
| Rise Mainnet | 🔜 Planned | Pending audit |
