// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreJackCore } from "../../src/games/casino/VyreJackCore.sol";
import { VyreCasino } from "../../src/core/VyreCasino.sol";
import { VyreTreasury } from "../../src/core/VyreTreasury.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title VyreCasinoE2E
 * @notice E2E tests against DEPLOYED contracts on Rise Testnet
 *
 * Run with: forge test --match-contract VyreCasinoE2E --fork-url https://testnet.riselabs.xyz -vvv
 *
 * IMPORTANT: These tests send REAL transactions with REAL funds.
 * Use minimal bet amounts (0.001 USDC = 1000 units).
 */
contract VyreCasinoE2E is Test {
    // ==========================================================================
    // DEPLOYED CONTRACT ADDRESSES - Rise Testnet
    // ==========================================================================
    address constant CASINO = 0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C;
    address constant GAME = 0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e;
    address constant TREASURY = 0x2be1229CEcF28702A50f68eD9592234a830845ae;
    address constant USDC = 0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8;
    address constant CHIP = 0x4B882AF56262d2786754E38600589fc1347FdF1E;
    address constant VRF = 0xcb5CEf3C54aa90e9A7ad602A258D3d360cC862B9;

    // Test wallet (SECOND_SIGNER from .env)
    address constant PLAYER = 0xF39ca026377a84DE1ee49cB62bAC4e3aba8c73f7;

    // Minimal bet - must match contract minBet (1 USDC)
    uint256 constant MIN_BET_USDC = 1_000_000; // 1 USDC (6 decimals)

    VyreCasino public casino;
    VyreJackCore public game;
    IERC20 public usdc;

    function setUp() public {
        // Only run on Rise Testnet fork
        if (block.chainid != 11_155_931) {
            vm.skip(true);
            return;
        }

        casino = VyreCasino(CASINO);
        game = VyreJackCore(GAME);
        usdc = IERC20(USDC);

        console.log("=== VyreCasino E2E Test ===");
        console.log("Network: Rise Testnet (fork)");
        console.log("Player:", PLAYER);
        console.log("ETH Balance:", PLAYER.balance / 1e18, "ETH");
        console.log("USDC Balance:", usdc.balanceOf(PLAYER) / 1e6, "USDC");
    }

    // ==========================================================================
    // SETUP VERIFICATION
    // ==========================================================================

    function test_DeployedContracts() public view {
        if (block.chainid != 11_155_931) return;

        // Verify Casino
        assertEq(address(casino.treasury()), TREASURY, "Treasury mismatch");
        assertTrue(casino.registeredGames(GAME), "Game not registered");
        assertTrue(casino.whitelistedTokens(USDC), "USDC not whitelisted");
        assertFalse(casino.paused(), "Casino is paused");

        // Verify Game
        assertEq(game.casino(), CASINO, "Game casino mismatch");

        // Verify VRF exists
        assertTrue(VRF.code.length > 0, "VRF coordinator missing");

        console.log("All contracts verified OK");
    }

    function test_PlayerHasFunds() public view {
        if (block.chainid != 11_155_931) return;

        uint256 ethBalance = PLAYER.balance;
        uint256 usdcBalance = usdc.balanceOf(PLAYER);

        console.log("ETH:", ethBalance);
        console.log("USDC:", usdcBalance);

        assertTrue(ethBalance >= 0.01 ether, "Insufficient ETH for gas");
        assertTrue(usdcBalance >= MIN_BET_USDC * 10, "Insufficient USDC for bets");
    }

    // ==========================================================================
    // APPROVAL TESTS
    // ==========================================================================

    function test_ApproveUSDC() public {
        if (block.chainid != 11_155_931) return;

        vm.startPrank(PLAYER);

        uint256 allowance = usdc.allowance(PLAYER, CASINO);
        console.log("Current allowance:", allowance);

        if (allowance < type(uint256).max / 2) {
            usdc.approve(CASINO, type(uint256).max);
            console.log("Approved USDC for Casino");
        }

        uint256 newAllowance = usdc.allowance(PLAYER, CASINO);
        assertTrue(newAllowance >= MIN_BET_USDC * 100, "Allowance too low");

        vm.stopPrank();
    }

    // ==========================================================================
    // PLAY FLOW TESTS (These actually send transactions on fork)
    // ==========================================================================

    function test_PlayWithMinimalBet() public {
        if (block.chainid != 11_155_931) return;

        vm.startPrank(PLAYER);

        // Approve if needed
        if (usdc.allowance(PLAYER, CASINO) < MIN_BET_USDC) {
            usdc.approve(CASINO, type(uint256).max);
        }

        uint256 balanceBefore = usdc.balanceOf(PLAYER);
        console.log("Balance before:", balanceBefore);

        // Play with minimal bet
        console.log("Placing bet:", MIN_BET_USDC, "USDC units");
        casino.play(GAME, USDC, MIN_BET_USDC, "");

        uint256 balanceAfter = usdc.balanceOf(PLAYER);
        console.log("Balance after:", balanceAfter);

        // Verify bet was taken
        assertLt(balanceAfter, balanceBefore, "Balance should decrease");

        vm.stopPrank();

        // Note: VRF callback won't happen in fork test
        // The game is now waiting for VRF
        console.log("Game started, waiting for VRF (manual check needed in real network)");
    }

    // ==========================================================================
    // REFERRAL TESTS
    // ==========================================================================

    function test_SetReferrer() public {
        if (block.chainid != 11_155_931) return;

        address DEPLOYER = 0xB55b2Ed00193864c58b355999eaa8BfEc302515E;

        vm.startPrank(PLAYER);

        address currentReferrer = casino.referrers(PLAYER);
        console.log("Current referrer:", currentReferrer);

        if (currentReferrer == address(0)) {
            casino.setReferrer(DEPLOYER);
            console.log("Set referrer to:", DEPLOYER);

            assertEq(casino.referrers(PLAYER), DEPLOYER, "Referrer not set");
        } else {
            console.log("Referrer already set, skipping");
        }

        vm.stopPrank();
    }

    // ==========================================================================
    // ERROR CASE TESTS
    // ==========================================================================

    function test_RevertZeroBet() public {
        if (block.chainid != 11_155_931) return;

        vm.startPrank(PLAYER);
        vm.expectRevert("VyreCasino: zero bet");
        casino.play(GAME, USDC, 0, "");
        vm.stopPrank();
    }

    function test_RevertUnregisteredGame() public {
        if (block.chainid != 11_155_931) return;

        vm.startPrank(PLAYER);
        vm.expectRevert("VyreCasino: game not registered");
        casino.play(address(0x1), USDC, MIN_BET_USDC, "");
        vm.stopPrank();
    }
}
