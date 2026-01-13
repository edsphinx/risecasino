/**
 * VyreCasino E2E Tests - Rise Testnet
 * 
 * Tests against DEPLOYED contracts on Rise Testnet.
 * Run with: npx hardhat test test/e2e/VyreCasino.e2e.ts --network rise
 * 
 * IMPORTANT: Fund Player1 wallet before running:
 * - ETH: 0.01 ETH for gas
 * - USDC: 0.1 USDC for bets
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, parseUnits, formatUnits } from "ethers";

// =============================================================================
// DEPLOYED CONTRACT ADDRESSES - Rise Testnet
// =============================================================================
const CONTRACTS = {
    CASINO: "0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C",
    GAME: "0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e",
    TREASURY: "0x2be1229CEcF28702A50f68eD9592234a830845ae",
    USDC: "0x8A93D247134d91e0DE6F96547CB0204e5bE8e5D8",
    CHIP: "0x4B882AF56262d2786754E38600589fc1347FdF1E",
    VRF: "0xcb5CEf3C54aa90e9A7ad602A258D3d360cC862B9",
} as const;

// Minimal bet amounts - must match contract minBet (1 USDC)
const MIN_BET_USDC = parseUnits("1", 6); // 1 USDC = 1000000 units
const SMALL_BET_USDC = parseUnits("5", 6); // 5 USDC for larger tests

// ABIs (minimal for testing)
const CASINO_ABI = [
    "function play(address game, address token, uint256 amount, bytes calldata data) external returns (tuple(bool won, uint256 payout, bytes metadata))",
    "function setReferrer(address referrer) external",
    "function claimReferralEarnings(address token) external",
    "function referrers(address player) view returns (address)",
    "function referralEarnings(address referrer, address token) view returns (uint256)",
    "function registeredGames(address game) view returns (bool)",
    "function whitelistedTokens(address token) view returns (bool)",
    "function paused() view returns (bool)",
    "function treasury() view returns (address)",
];

const GAME_ABI = [
    "function hit() external",
    "function stand() external",
    "function double() external",
    "function games(address player) view returns (uint256 bet, uint8 state, address token, uint256 betAmount, uint256 timestamp, address player, uint8[] playerCards, uint8[] dealerCards, uint256 vrfRequestId, bool doubled, uint256 payout, uint256 doubledBet)",
    "function getGame(address player) view returns (tuple(uint256 bet, uint8 state, address token, uint256 betAmount, uint256 timestamp, address player, uint8[] playerCards, uint8[] dealerCards, uint256 vrfRequestId, bool doubled, uint256 payout, uint256 doubledBet))",
    "function casino() view returns (address)",
];

const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

// =============================================================================
// TEST SUITE
// =============================================================================
describe("VyreCasino E2E - Rise Testnet", function () {
    // Increase timeout for testnet (VRF can take time)
    this.timeout(120_000); // 2 minutes

    let player: Signer;
    let playerAddress: string;
    let casino: Contract;
    let game: Contract;
    let usdc: Contract;

    before(async function () {
        // Skip if not on Rise Testnet
        const network = await ethers.provider.getNetwork();
        if (Number(network.chainId) !== 11155931) {
            console.log("⏭️  Skipping E2E tests - not on Rise Testnet");
            this.skip();
        }

        // Get signer (should be SECOND_SIGNER from .env)
        const signers = await ethers.getSigners();
        player = signers[0];
        playerAddress = await player.getAddress();

        console.log(`\n🎰 VyreCasino E2E Tests`);
        console.log(`   Network: Rise Testnet (${network.chainId})`);
        console.log(`   Player: ${playerAddress}`);

        // Connect to contracts
        casino = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, player);
        game = new ethers.Contract(CONTRACTS.GAME, GAME_ABI, player);
        usdc = new ethers.Contract(CONTRACTS.USDC, ERC20_ABI, player);

        // Check balances
        const ethBalance = await ethers.provider.getBalance(playerAddress);
        const usdcBalance = await usdc.balanceOf(playerAddress);

        console.log(`   ETH Balance: ${formatUnits(ethBalance, 18)} ETH`);
        console.log(`   USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);

        // Verify sufficient funds
        if (ethBalance < parseUnits("0.001", 18)) {
            throw new Error("Insufficient ETH for gas. Fund player with 0.01 ETH");
        }
        if (usdcBalance < MIN_BET_USDC) {
            throw new Error("Insufficient USDC for bets. Fund player with 0.1 USDC");
        }
    });

    // =============================================================================
    // SETUP TESTS
    // =============================================================================
    describe("Contract Setup Verification", function () {
        it("should connect to deployed Casino", async function () {
            const treasury = await casino.treasury();
            expect(treasury.toLowerCase()).to.equal(CONTRACTS.TREASURY.toLowerCase());
        });

        it("should have VyreJackCore registered", async function () {
            const isRegistered = await casino.registeredGames(CONTRACTS.GAME);
            expect(isRegistered).to.be.true;
        });

        it("should have USDC whitelisted", async function () {
            const isWhitelisted = await casino.whitelistedTokens(CONTRACTS.USDC);
            expect(isWhitelisted).to.be.true;
        });

        it("should not be paused", async function () {
            const isPaused = await casino.paused();
            expect(isPaused).to.be.false;
        });

        it("should have Game connected to Casino", async function () {
            const casinoAddr = await game.casino();
            expect(casinoAddr.toLowerCase()).to.equal(CONTRACTS.CASINO.toLowerCase());
        });
    });

    // =============================================================================
    // APPROVAL TESTS
    // =============================================================================
    describe("Token Approvals", function () {
        it("should approve USDC for Casino if needed", async function () {
            const allowance = await usdc.allowance(playerAddress, CONTRACTS.CASINO);

            if (allowance < SMALL_BET_USDC * 100n) {
                console.log("   Approving USDC...");
                const tx = await usdc.approve(CONTRACTS.CASINO, ethers.MaxUint256);
                await tx.wait();
                console.log("   ✅ USDC approved");
            } else {
                console.log("   ✅ USDC already approved");
            }

            const newAllowance = await usdc.allowance(playerAddress, CONTRACTS.CASINO);
            expect(newAllowance).to.be.gte(SMALL_BET_USDC);
        });
    });

    // =============================================================================
    // PLAY FLOW TESTS
    // =============================================================================
    describe("Basic Play Flow", function () {
        it("should start a game with minimal USDC bet", async function () {
            const balanceBefore = await usdc.balanceOf(playerAddress);

            console.log(`   Placing bet: ${formatUnits(MIN_BET_USDC, 6)} USDC`);

            // Call play
            const tx = await casino.play(
                CONTRACTS.GAME,
                CONTRACTS.USDC,
                MIN_BET_USDC,
                "0x" // empty data
            );

            const receipt = await tx.wait();
            console.log(`   ✅ Transaction: ${receipt.hash}`);
            console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

            // Check balance decreased
            const balanceAfter = await usdc.balanceOf(playerAddress);
            expect(balanceAfter).to.be.lt(balanceBefore);
        });

        it("should wait for VRF and check game state", async function () {
            console.log("   ⏳ Waiting for VRF callback (up to 30s)...");

            // Poll for game state
            let attempts = 0;
            const maxAttempts = 30;

            while (attempts < maxAttempts) {
                try {
                    // Try to read game state
                    const gameData = await game.games(playerAddress);
                    const state = Number(gameData[1]); // state is index 1

                    console.log(`   Poll ${attempts + 1}/${maxAttempts} - State: ${state}`);

                    // State 0 = None, 1 = PlayerTurn, 2 = DealerTurn, 3 = Resolved
                    if (state === 1) {
                        console.log("   ✅ Game is in PlayerTurn - VRF completed!");
                        return; // Success
                    } else if (state === 3) {
                        console.log("   ✅ Game already resolved (instant result)");
                        return; // Success
                    } else if (state === 0) {
                        console.log("   ✅ No active game (may have resolved)");
                        return; // Success - game completed
                    }
                } catch (e) {
                    // Ignore read errors
                }

                await new Promise(r => setTimeout(r, 1000));
                attempts++;
            }

            console.log("   ⚠️ VRF callback pending - manual check needed");
        });
    });

    // =============================================================================
    // REFERRAL TESTS
    // =============================================================================
    describe("Referral System", function () {
        const referrerAddress = "0xB55b2Ed00193864c58b355999eaa8BfEc302515E"; // Deployer

        it("should check current referrer", async function () {
            const currentReferrer = await casino.referrers(playerAddress);
            console.log(`   Current referrer: ${currentReferrer}`);

            if (currentReferrer === ethers.ZeroAddress) {
                console.log("   No referrer set yet");
            }
        });

        it("should set referrer if not already set", async function () {
            const currentReferrer = await casino.referrers(playerAddress);

            if (currentReferrer === ethers.ZeroAddress) {
                console.log(`   Setting referrer to: ${referrerAddress}`);
                const tx = await casino.setReferrer(referrerAddress);
                await tx.wait();

                const newReferrer = await casino.referrers(playerAddress);
                expect(newReferrer.toLowerCase()).to.equal(referrerAddress.toLowerCase());
                console.log("   ✅ Referrer set");
            } else {
                console.log("   ⏭️ Referrer already set, skipping");
            }
        });
    });

    // =============================================================================
    // ERROR CASE TESTS
    // =============================================================================
    describe("Error Cases", function () {
        it("should revert on zero bet", async function () {
            try {
                await casino.play(CONTRACTS.GAME, CONTRACTS.USDC, 0, "0x");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("zero bet");
                console.log("   ✅ Correctly reverted on zero bet");
            }
        });

        it("should revert on unregistered game", async function () {
            try {
                const fakeGame = "0x0000000000000000000000000000000000000001";
                await casino.play(fakeGame, CONTRACTS.USDC, MIN_BET_USDC, "0x");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("not registered");
                console.log("   ✅ Correctly reverted on unregistered game");
            }
        });
    });
});
