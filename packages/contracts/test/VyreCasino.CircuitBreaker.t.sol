// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreCasino } from "../src/core/VyreCasino.sol";
import { VyreTreasury } from "../src/core/VyreTreasury.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Simple ERC20 for testing (6 decimals like real USDC)
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000e6);
    }

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

/**
 * @title MockCHIP
 * @notice Simple ERC20 for testing (18 decimals)
 */
contract MockCHIP is ERC20 {
    constructor() ERC20("CHIP Token", "CHIP") {
        _mint(msg.sender, 1_000_000e18);
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/**
 * @title MockWinningGame
 * @notice Game that always returns a win with configurable multiplier (USDC 6 decimals)
 */
contract MockWinningGame is IVyreGame {
    address public casino;
    uint256 public multiplier = 2; // 2x by default

    constructor(
        address _casino
    ) {
        casino = _casino;
    }

    function setMultiplier(
        uint256 _mult
    ) external {
        multiplier = _mult;
    }

    function play(
        address,
        BetInfo calldata bet,
        bytes calldata
    ) external view override returns (GameResult memory result) {
        result = GameResult({ won: true, payout: bet.amount * multiplier, metadata: "" });
    }

    function minBet(
        address
    ) external pure override returns (uint256) {
        return 1e6;
    }

    function maxBet(
        address
    ) external pure override returns (uint256) {
        return 1_000_000e6;
    }

    function name() external pure override returns (string memory) {
        return "MockWinningGame";
    }

    function isActive() external pure override returns (bool) {
        return true;
    }
}

/**
 * @title MockChipWinningGame
 * @notice Game that always returns a win (CHIP 18 decimals)
 */
contract MockChipWinningGame is IVyreGame {
    address public casino;
    uint256 public multiplier = 2;

    constructor(
        address _casino
    ) {
        casino = _casino;
    }

    function setMultiplier(
        uint256 _mult
    ) external {
        multiplier = _mult;
    }

    function play(
        address,
        BetInfo calldata bet,
        bytes calldata
    ) external view override returns (GameResult memory result) {
        result = GameResult({ won: true, payout: bet.amount * multiplier, metadata: "" });
    }

    function minBet(
        address
    ) external pure override returns (uint256) {
        return 1e18; // 1 CHIP
    }

    function maxBet(
        address
    ) external pure override returns (uint256) {
        return 1_000_000e18; // 1M CHIP
    }

    function name() external pure override returns (string memory) {
        return "MockChipWinningGame";
    }

    function isActive() external pure override returns (bool) {
        return true;
    }
}

/**
 * @title VyreCasinoCircuitBreakerTest
 * @notice Unit tests for VyreCasino Circuit Breaker functionality
 */
contract VyreCasinoCircuitBreakerTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockUSDC public usdc;
    MockCHIP public chip;
    MockWinningGame public game;

    address public owner = address(this);
    address public player = address(0x1234);
    address public buybackWallet = address(0xBB);

    uint256 constant DAILY_LIMIT = 1000e6; // 1000 USDC

    event CircuitBreakerTriggered(address indexed token, uint256 dailyTotal, uint256 limit);
    event DailyPayoutLimitUpdated(address indexed token, uint256 oldLimit, uint256 newLimit);
    event CircuitBreakerToggled(bool enabled);

    function setUp() public {
        // Deploy tokens
        usdc = new MockUSDC();
        chip = new MockCHIP();

        // Deploy treasury
        treasury = new VyreTreasury(owner);

        // Deploy casino
        casino = new VyreCasino(address(treasury), address(chip), owner, buybackWallet);
        treasury.setOperator(address(casino));

        // Deploy winning game
        game = new MockWinningGame(address(casino));
        casino.registerGame(address(game));

        // Whitelist USDC
        casino.whitelistToken(address(usdc));

        // Fund treasury
        usdc.mint(address(treasury), 100_000e6);
        chip.mint(address(treasury), 100_000e18);

        // Fund player
        usdc.mint(player, 10_000e6);
        chip.mint(player, 10_000e18);

        // Player approves casino
        vm.prank(player);
        usdc.approve(address(casino), type(uint256).max);
        vm.prank(player);
        chip.approve(address(casino), type(uint256).max);

        // Set daily payout limit for USDC
        casino.setDailyPayoutLimit(address(usdc), DAILY_LIMIT);

        // These tests exercise the daily-limit circuit breaker with up-to-10x wins;
        // raise the per-bet escrow cap to its max so it doesn't pre-empt that guard.
        casino.setMaxPayoutBps(100_000);
    }

    // ==================== ADMIN TESTS ====================

    function test_SetDailyPayoutLimit() public {
        uint256 newLimit = 5000e6;
        casino.setDailyPayoutLimit(address(usdc), newLimit);
        assertEq(casino.dailyPayoutLimit(address(usdc)), newLimit);
    }

    function test_SetDailyPayoutLimitEmitsEvent() public {
        uint256 oldLimit = DAILY_LIMIT;
        uint256 newLimit = 2000e6;

        vm.expectEmit(true, false, false, true);
        emit DailyPayoutLimitUpdated(address(usdc), oldLimit, newLimit);
        casino.setDailyPayoutLimit(address(usdc), newLimit);
    }

    function test_SetDailyPayoutLimitOnlyOwner() public {
        vm.prank(player);
        vm.expectRevert("VyreCasino: only owner");
        casino.setDailyPayoutLimit(address(usdc), 5000e6);
    }

    function test_SetCircuitBreakerEnabled() public {
        casino.setCircuitBreakerEnabled(false);
        assertFalse(casino.circuitBreakerEnabled());

        casino.setCircuitBreakerEnabled(true);
        assertTrue(casino.circuitBreakerEnabled());
    }

    function test_SetCircuitBreakerEnabledEmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit CircuitBreakerToggled(false);
        casino.setCircuitBreakerEnabled(false);
    }

    function test_SetCircuitBreakerEnabledOnlyOwner() public {
        vm.prank(player);
        vm.expectRevert("VyreCasino: only owner");
        casino.setCircuitBreakerEnabled(false);
    }

    function test_CircuitBreakerEnabledByDefault() public view {
        assertTrue(casino.circuitBreakerEnabled());
    }

    // ==================== GETTER TESTS ====================

    function test_GetTodayPayouts() public {
        // Should start at 0
        assertEq(casino.getTodayPayouts(address(usdc)), 0);
    }

    function test_GetRemainingPayoutCapacity() public view {
        // Should equal limit when nothing spent
        assertEq(casino.getRemainingPayoutCapacity(address(usdc)), DAILY_LIMIT);
    }

    function test_GetRemainingPayoutCapacityNoLimit() public {
        // Token with no limit set returns max
        assertEq(casino.getRemainingPayoutCapacity(address(chip)), type(uint256).max);
    }

    // ==================== CIRCUIT BREAKER BEHAVIOR TESTS ====================

    function test_PayoutUnderLimit() public {
        // Small bet that stays under limit
        uint256 betAmount = 100e6; // 100 USDC
        // Game returns 2x = 200 USDC gross, minus house edge

        vm.prank(player);
        IVyreGame.GameResult memory result =
            casino.play(address(game), address(usdc), betAmount, "");

        assertTrue(result.won);
        // Should succeed without hitting circuit breaker
        assertLt(casino.getTodayPayouts(address(usdc)), DAILY_LIMIT);
    }

    function test_PayoutExceedsLimitReverts() public {
        // Bet that would exceed daily limit
        // Set multiplier high to trigger circuit breaker
        game.setMultiplier(10);

        uint256 betAmount = 200e6; // 200 USDC → 2000 USDC payout > 1000 limit

        vm.prank(player);
        vm.expectRevert("VyreCasino: daily payout limit exceeded");
        casino.play(address(game), address(usdc), betAmount, "");
    }

    function test_CircuitBreakerTriggeredEvent() public {
        game.setMultiplier(10);
        uint256 betAmount = 200e6;

        vm.prank(player);
        vm.expectEmit(true, false, false, false);
        emit CircuitBreakerTriggered(address(usdc), 0, DAILY_LIMIT);
        vm.expectRevert();
        casino.play(address(game), address(usdc), betAmount, "");
    }

    function test_MultiplePayoutsAccumulate() public {
        // Make multiple small bets, each under limit but accumulating
        uint256 betAmount = 100e6;
        game.setMultiplier(2);

        // First bet: 100 USDC → ~196 USDC net payout (after house edge)
        vm.prank(player);
        casino.play(address(game), address(usdc), betAmount, "");

        uint256 firstPayouts = casino.getTodayPayouts(address(usdc));
        assertGt(firstPayouts, 0);

        // Second bet
        vm.prank(player);
        casino.play(address(game), address(usdc), betAmount, "");

        uint256 secondPayouts = casino.getTodayPayouts(address(usdc));
        assertGt(secondPayouts, firstPayouts);
    }

    function test_RemainingCapacityDecreases() public {
        uint256 initialCapacity = casino.getRemainingPayoutCapacity(address(usdc));

        vm.prank(player);
        casino.play(address(game), address(usdc), 100e6, "");

        uint256 finalCapacity = casino.getRemainingPayoutCapacity(address(usdc));
        assertLt(finalCapacity, initialCapacity);
    }

    function test_CircuitBreakerDisabledBypassLimit() public {
        // Disable circuit breaker
        casino.setCircuitBreakerEnabled(false);

        // Now large payouts should work
        game.setMultiplier(10);
        uint256 betAmount = 200e6;

        vm.prank(player);
        IVyreGame.GameResult memory result =
            casino.play(address(game), address(usdc), betAmount, "");

        assertTrue(result.won);
        // Payouts not tracked when disabled
    }

    function test_NoLimitAllowsUnlimitedPayouts() public {
        // Remove USDC limit (set to 0 = unlimited)
        casino.setDailyPayoutLimit(address(usdc), 0);

        // High multiplier for large payout
        game.setMultiplier(10);
        uint256 betAmount = 200e6; // 200 USDC → 2000 USDC payout

        vm.prank(player);
        IVyreGame.GameResult memory result =
            casino.play(address(game), address(usdc), betAmount, "");

        assertTrue(result.won);
        assertEq(result.payout, 2000e6);
    }

    function test_DayResetClearsDailyPayouts() public {
        // Make a payout today
        vm.prank(player);
        casino.play(address(game), address(usdc), 100e6, "");

        uint256 todayPayouts = casino.getTodayPayouts(address(usdc));
        assertGt(todayPayouts, 0);

        // Warp to next day
        vm.warp(block.timestamp + 1 days);

        // New day should have 0 payouts
        assertEq(casino.getTodayPayouts(address(usdc)), 0);
        assertEq(casino.getRemainingPayoutCapacity(address(usdc)), DAILY_LIMIT);
    }

    function test_LimitZeroMeansNoLimit() public {
        // Set limit to 0
        casino.setDailyPayoutLimit(address(usdc), 0);

        // Large payouts should work
        game.setMultiplier(10);
        vm.prank(player);
        IVyreGame.GameResult memory result = casino.play(address(game), address(usdc), 200e6, "");

        assertTrue(result.won);
    }

    // ==================== EDGE CASES ====================

    function test_ExactlyAtLimitAllowed() public {
        // With 1% house edge: netPayout = grossPayout * 0.99
        // 100 USDC bet, 2x = 200 USDC gross, 198 USDC net
        // Set limit to 200 USDC to allow this bet
        casino.setDailyPayoutLimit(address(usdc), 200e6);

        uint256 betAmount = 100e6;
        game.setMultiplier(2);

        vm.prank(player);
        IVyreGame.GameResult memory result =
            casino.play(address(game), address(usdc), betAmount, "");

        assertTrue(result.won);
    }

    function test_ReEnableAfterTrigger() public {
        // Hit the limit
        game.setMultiplier(10);
        vm.prank(player);
        vm.expectRevert("VyreCasino: daily payout limit exceeded");
        casino.play(address(game), address(usdc), 200e6, "");

        // Increase limit
        casino.setDailyPayoutLimit(address(usdc), 5000e6);

        // Now should work
        vm.prank(player);
        IVyreGame.GameResult memory result = casino.play(address(game), address(usdc), 200e6, "");
        assertTrue(result.won);
    }
}

/**
 * @title VyreCasinoCircuitBreakerFuzzTest
 * @notice Fuzz tests for Circuit Breaker
 */
contract VyreCasinoCircuitBreakerFuzzTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockUSDC public usdc;
    MockCHIP public chip;
    MockWinningGame public game;

    address public owner = address(this);
    address public player = address(0x1234);

    function setUp() public {
        usdc = new MockUSDC();
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, address(0));
        treasury.setOperator(address(casino));

        game = new MockWinningGame(address(casino));
        casino.registerGame(address(game));
        casino.whitelistToken(address(usdc));

        usdc.mint(address(treasury), 1_000_000e6);
        usdc.mint(player, 100_000e6);

        vm.prank(player);
        usdc.approve(address(casino), type(uint256).max);
    }

    function testFuzz_SetDailyPayoutLimit(
        uint256 limit
    ) public {
        casino.setDailyPayoutLimit(address(usdc), limit);
        assertEq(casino.dailyPayoutLimit(address(usdc)), limit);
    }

    function testFuzz_RemainingCapacityNeverNegative(
        uint256 limit,
        uint256 betAmount
    ) public {
        // Bound inputs
        limit = bound(limit, 1e6, 1_000_000e6);
        betAmount = bound(betAmount, 1e6, 1000e6);

        casino.setDailyPayoutLimit(address(usdc), limit);

        // Try to play (may revert if over limit)
        vm.prank(player);
        try casino.play(address(game), address(usdc), betAmount, "") {
            // If succeeded, capacity should be >= 0
            uint256 remaining = casino.getRemainingPayoutCapacity(address(usdc));
            assertTrue(remaining <= limit);
        } catch {
            // If reverted due to circuit breaker, that's expected
        }
    }

    function testFuzz_DayBoundaryReset(
        uint256 daysToWarp
    ) public {
        daysToWarp = bound(daysToWarp, 1, 365);

        casino.setDailyPayoutLimit(address(usdc), 10_000e6);

        // Make a payout
        vm.prank(player);
        casino.play(address(game), address(usdc), 100e6, "");

        uint256 payoutsBefore = casino.getTodayPayouts(address(usdc));
        assertGt(payoutsBefore, 0);

        // Warp days
        vm.warp(block.timestamp + daysToWarp * 1 days);

        // New day should be reset
        assertEq(casino.getTodayPayouts(address(usdc)), 0);
    }
}

/**
 * @title VyreCasinoCircuitBreakerInvariantTest
 * @notice Invariant tests for Circuit Breaker
 */
contract VyreCasinoCircuitBreakerInvariantTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockUSDC public usdc;
    MockCHIP public chip;
    MockWinningGame public game;
    CircuitBreakerHandler public handler;

    address public owner = address(this);

    function setUp() public {
        usdc = new MockUSDC();
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, address(0));
        treasury.setOperator(address(casino));

        game = new MockWinningGame(address(casino));
        casino.registerGame(address(game));
        casino.whitelistToken(address(usdc));

        usdc.mint(address(treasury), 10_000_000e6);

        handler = new CircuitBreakerHandler(casino, usdc, game);

        // Fund handler
        usdc.mint(address(handler), 1_000_000e6);

        targetContract(address(handler));
    }

    function invariant_DailyPayoutsNeverExceedLimit() public view {
        uint256 limit = casino.dailyPayoutLimit(address(usdc));
        uint256 todayPayouts = casino.getTodayPayouts(address(usdc));

        // Note: If the limit is lowered after payouts occurred, todayPayouts could exceed limit
        // This is expected behavior - the invariant only holds for NEW payouts
        // We verify that getRemainingPayoutCapacity handles this gracefully (returns 0 or correct value)
        uint256 remaining = casino.getRemainingPayoutCapacity(address(usdc));

        if (limit > 0 && casino.circuitBreakerEnabled()) {
            // If payouts exceed current limit (limit was lowered), remaining should be 0
            if (todayPayouts >= limit) {
                assertEq(remaining, 0, "Remaining should be 0 when over limit");
            } else {
                assertEq(remaining, limit - todayPayouts, "Remaining capacity mismatch");
            }
        }
    }

    function invariant_RemainingCapacityNeverUnderflows() public view {
        // This should never revert due to underflow
        uint256 remaining = casino.getRemainingPayoutCapacity(address(usdc));
        // Just verify the call succeeded
        assertTrue(remaining >= 0); // Always true but verifies no panic
    }
}

/**
 * @title CircuitBreakerHandler
 * @notice Handler for invariant testing
 */
contract CircuitBreakerHandler is Test {
    VyreCasino public casino;
    MockUSDC public usdc;
    MockWinningGame public game;

    uint256 public playCount;
    uint256 public revertCount;

    constructor(
        VyreCasino _casino,
        MockUSDC _usdc,
        MockWinningGame _game
    ) {
        casino = _casino;
        usdc = _usdc;
        game = _game;

        // Approve casino
        usdc.approve(address(casino), type(uint256).max);
    }

    function play(
        uint256 betAmount
    ) external {
        betAmount = bound(betAmount, 1e6, 500e6);

        try casino.play(address(game), address(usdc), betAmount, "") {
            playCount++;
        } catch {
            revertCount++;
        }
    }

    function setLimit(
        uint256 limit
    ) external {
        limit = bound(limit, 0, 100_000e6);
        vm.prank(casino.owner());
        casino.setDailyPayoutLimit(address(usdc), limit);
    }

    function warpDay() external {
        vm.warp(block.timestamp + 1 days);
    }
}
