// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VyreCasino } from "../src/core/VyreCasino.sol";
import { VyreTreasury } from "../src/core/VyreTreasury.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Async-style game: play() returns a pending result so the bet stays escrowed
/// until the game settles/refunds out of band (like VyreJackCore).
contract MockPendingGame is IVyreGame {
    function play(
        address,
        BetInfo calldata,
        bytes calldata
    ) external pure override returns (GameResult memory) {
        return GameResult({ won: false, payout: 0, metadata: "" });
    }

    function minBet(
        address
    ) external pure override returns (uint256) {
        return 0;
    }

    function maxBet(
        address
    ) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function name() external pure override returns (string memory) {
        return "MockPendingGame";
    }

    function isActive() external pure override returns (bool) {
        return true;
    }
}

/**
 * @title VyreCasinoRefundBetTest
 * @notice TDD for the no-edge refund/collect paths AND the per-bet escrow cap (audit
 *         H1): a registered game can only settle/refund against a player's actually
 *         escrowed bet, bounded to maxPayoutBps — it cannot drain the treasury.
 */
contract VyreCasinoRefundBetTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockUSDC public usdc;
    MockPendingGame public game;

    address public owner = address(this);
    address public player = address(0x1234);
    uint256 public constant BET = 100e6;

    event BetRefunded(address indexed game, address indexed player, address token, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(0xC417), owner, address(0xBB));
        treasury.setOperator(address(casino));
        game = new MockPendingGame();
        casino.registerGame(address(game));
        casino.whitelistToken(address(usdc));
        usdc.mint(address(treasury), 100_000e6);
        usdc.mint(player, 10_000e6);
        vm.prank(player);
        usdc.approve(address(casino), type(uint256).max);
    }

    /// Player places a real bet through the game, opening the escrow.
    function _openBet() internal {
        vm.prank(player);
        casino.play(address(game), address(usdc), BET, "");
    }

    function test_refundBet_paysFullBetWithNoHouseEdge() public {
        uint256 balBefore = usdc.balanceOf(player);
        _openBet();
        assertEq(usdc.balanceOf(player), balBefore - BET, "bet escrowed");

        vm.prank(address(game));
        casino.refundBet(player, address(usdc), BET);

        assertEq(usdc.balanceOf(player), balBefore, "full bet refunded, no house edge");
    }

    function test_refundBet_emitsEvent() public {
        _openBet();
        vm.expectEmit(true, true, false, true);
        emit BetRefunded(address(game), player, address(usdc), BET);
        vm.prank(address(game));
        casino.refundBet(player, address(usdc), BET);
    }

    function test_refundBet_revertsForUnregisteredCaller() public {
        _openBet();
        vm.prank(address(0xDEAD));
        vm.expectRevert("VyreCasino: only registered games");
        casino.refundBet(player, address(usdc), BET);
    }

    function test_refundBet_revertsAboveEscrow() public {
        _openBet();
        vm.prank(address(game));
        vm.expectRevert("VyreCasino: refund exceeds escrow");
        casino.refundBet(player, address(usdc), BET + 1);
    }

    function test_collectBet_pullsStakeAndGrowsEscrow() public {
        _openBet();
        uint256 balBefore = usdc.balanceOf(player);
        vm.prank(address(game));
        casino.collectBet(player, address(usdc), BET); // double-down second stake

        assertEq(usdc.balanceOf(player), balBefore - BET, "second stake pulled from player");
        (, uint256 amt) = casino.betEscrow(address(game), player);
        assertEq(amt, 2 * BET, "escrow grew to 2x");
    }

    function test_collectBet_revertsWithoutOpenBet() public {
        // No play() => no escrow; a game must not be able to pull funds from a player
        // who has no active bet (audit H2).
        vm.prank(address(game));
        vm.expectRevert("VyreCasino: no open bet");
        casino.collectBet(player, address(usdc), BET);
    }

    function test_collectBet_revertsAboveOriginalBet() public {
        _openBet();
        // The double-down second stake is at most the original bet.
        vm.prank(address(game));
        vm.expectRevert("VyreCasino: collect exceeds bet");
        casino.collectBet(player, address(usdc), BET + 1);
    }

    function test_play_revertsWhenBetAlreadyOpen() public {
        _openBet(); // async game leaves the escrow open
        vm.prank(player);
        vm.expectRevert("VyreCasino: bet already open");
        casino.play(address(game), address(usdc), BET, "");
    }

    // ---- per-bet escrow cap: a registered game cannot drain the treasury (H1) ----

    function test_settlePayout_cappedByEscrow_blocksDrain() public {
        _openBet();
        // Far above maxPayoutBps (3x) of the 100 USDC bet.
        vm.prank(address(game));
        vm.expectRevert("VyreCasino: payout exceeds cap");
        casino.settlePayout(player, address(usdc), 50_000e6);
    }

    function test_settlePayout_revertsWithoutOpenBet() public {
        // No play() => no escrow; a settlement for a player who never bet must revert.
        vm.prank(address(game));
        vm.expectRevert("VyreCasino: no open bet");
        casino.settlePayout(player, address(usdc), BET);
    }

    function test_settlePayout_withinCapPays() public {
        _openBet();
        uint256 balBefore = usdc.balanceOf(player);
        // 2x is within the 3x cap; house edge applies via settlePayout.
        vm.prank(address(game));
        casino.settlePayout(player, address(usdc), 2 * BET);
        assertGt(usdc.balanceOf(player), balBefore, "player paid within cap");
    }
}
