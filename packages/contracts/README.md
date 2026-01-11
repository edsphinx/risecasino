# VyreCasino Smart Contracts

On-chain Blackjack game with provably fair randomness via Rise VRF.

## Architecture

| Contract         | Coverage   | Purpose                                  |
| ---------------- | ---------- | ---------------------------------------- |
| VyreCasino.sol   | **95.45%** | Orchestrator - house edge, referrals, XP |
| VyreTreasury.sol | **94.20%** | Secure vault with daily limits           |
| VyreJackCore.sol | **95.79%** | Pure blackjack game logic                |
| VyreJackETH.sol  | Passing    | Standalone ETH blackjack                 |

## Features

- **Core Actions**: Hit, Stand, Double Down, Surrender
- **Provably Fair**: Rise VRF for card dealing
- **House Protection**: Daily limits, circuit breaker, exposure tracking
- **Anti-Bot**: Infinite deck prevents card counting
- **Two-Step Ownership**: Secure admin transfers
- **12 UX Events**: Frontend-optimized event emissions
- **UUPS Upgradeable**: VyreJackCore supports upgradeToAndCall()
- **VRF Timeout**: 2 minute timeout with retry mechanism

## Current Deployment (Rise Testnet)

| Contract          | Address                                      | Type       |
| ----------------- | -------------------------------------------- | ---------- |
| **VyreJackCore**  | `0x961715D101DaadfE477c7A7C136dCBbca3A9ad10` | UUPS Proxy |
| **VyreCasino**    | `0x0f4D3f9c872c218132A00c08d54eb516D82438b8` | V2         |
| **VyreTreasury**  | `0x2be1229CEcF28702A50f68eD9592234a830845ae` | -          |
| **SAFE Multisig** | `0x108ca5cf713cb0b964d187f19cd7b7d317841c31` | 2/3        |

See [DEPLOYMENTS.md](./DEPLOYMENTS.md) for full history.

## Quick Start

```bash
# Install dependencies
forge install

# Build
forge build

# Test (170+ tests)
forge test

# Coverage
forge coverage --match-contract VyreJackCoreTest

# Deploy to Rise Testnet
source .env
forge script script/Deploy.s.sol:DeployTestnet \
  --rpc-url https://testnet.riselabs.xyz \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url 'https://explorer.testnet.riselabs.xyz/api/'
```

## Environment Variables

Create a `.env` file:

```
DEPLOYER_PRIVATE_KEY=0x...
RPC_URL=https://testnet.riselabs.xyz
```

## Documentation

- [Code Conventions](./CONVENTIONS.md)
- [Production Roadmap](./PRODUCTION_ROADMAP.md)
- [Deployment Changelog](./DEPLOYMENTS.md)
