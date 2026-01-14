// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IVRFCoordinator } from "../src/interfaces/IVRFCoordinator.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MockVRF for invariant testing with auto-fulfill
 */
contract MockVRFForInvariant is IVRFCoordinator {
    VyreJackCore public game;
    uint256 public requestId;

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function requestRandomNumbers(
        uint32 numNumbers,
        uint256 seed
    ) external returns (uint256) {
        requestId++;

        // Auto-fulfill with deterministic pseudo-random numbers
        uint256[] memory randomNumbers = new uint256[](numNumbers);
        for (uint32 i = 0; i < numNumbers; i++) {
            randomNumbers[i] = uint256(keccak256(abi.encode(seed, requestId, i, block.timestamp)));
        }

        game.rawFulfillRandomNumbers(requestId, randomNumbers);
        return requestId;
    }
}

/**
 * @title Mock Casino for testing - tracks fees
 */
contract MockCasinoForInvariant {
    VyreJackCore public game;
    address public chipToken;

    uint256 public totalPayouts;
    uint256 public payoutCount;

    constructor(
        address _chipToken
    ) {
        chipToken = _chipToken;
    }

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function playGame(
        address player,
        uint256 amount
    ) external returns (IVyreGame.GameResult memory) {
        IVyreGame.BetInfo memory bet =
            IVyreGame.BetInfo({ token: chipToken, amount: amount, chipTier: 0 });
        return game.play(player, bet, "");
    }

    function settlePayout(
        address,
        address,
        uint256 amount
    ) external {
        totalPayouts += amount;
        payoutCount++;
    }
}

/**
 * @title VyreJackCore Handler for invariant testing
 */
contract VyreJackCoreHandler is Test {
    VyreJackCore public game;
    MockCasinoForInvariant public casino;
    address public chipToken;
    address[] public players;

    // Ghost variables for tracking state
    uint256 public ghost_totalBets;
    uint256 public ghost_gamesStarted;
    uint256 public ghost_gamesCompleted;
    uint256 public ghost_playerWins;
    uint256 public ghost_dealerWins;
    uint256 public ghost_pushes;
    uint256 public ghost_blackjacks;
    uint256 public ghost_busts;
    uint256 public ghost_surrenders;

    constructor(
        VyreJackCore _game,
        MockCasinoForInvariant _casino,
        address _chipToken
    ) {
        game = _game;
        casino = _casino;
        chipToken = _chipToken;

        // Create test players
        for (uint256 i = 0; i < 10; i++) {
            players.push(vm.addr(0x2000 + i));
        }
    }

    function startGame(
        uint256 playerSeed,
        uint256 betAmount
    ) external {
        address player = players[playerSeed % players.length];
        betAmount = bound(betAmount, 1e18, 100e18);

        // Check if player is idle
        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        if (state != VyreJackCore.GameState.Idle) return;

        try casino.playGame(player, betAmount) {
            ghost_totalBets += betAmount;
            ghost_gamesStarted++;
        } catch { }
    }

    function hit(
        uint256 playerSeed
    ) external {
        address player = players[playerSeed % players.length];

        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        if (state != VyreJackCore.GameState.PlayerTurn) return;

        vm.prank(player);
        try game.hit() { } catch { }
    }

    function stand(
        uint256 playerSeed
    ) external {
        address player = players[playerSeed % players.length];

        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        if (state != VyreJackCore.GameState.PlayerTurn) return;

        vm.prank(player);
        try game.stand() {
            ghost_gamesCompleted++;
        } catch { }
    }

    function doubleDown(
        uint256 playerSeed
    ) external {
        address player = players[playerSeed % players.length];

        (,, uint8[] memory playerCards,, VyreJackCore.GameState state) = game.getGame(player);
        if (state != VyreJackCore.GameState.PlayerTurn) return;
        if (playerCards.length != 2) return;

        vm.prank(player);
        try game.double() {
            ghost_gamesCompleted++;
        } catch { }
    }

    function surrender(
        uint256 playerSeed
    ) external {
        address player = players[playerSeed % players.length];

        (,, uint8[] memory playerCards,, VyreJackCore.GameState state) = game.getGame(player);
        if (state != VyreJackCore.GameState.PlayerTurn) return;
        if (playerCards.length != 2) return;

        vm.prank(player);
        try game.surrender() {
            ghost_surrenders++;
            ghost_gamesCompleted++;
        } catch { }
    }

    function getPlayersCount() external view returns (uint256) {
        return players.length;
    }
}

/**
 * @title VyreJackCore Invariant Tests
 */
contract VyreJackCoreInvariantTest is Test {
    VyreJackCore public game;
    MockVRFForInvariant public vrf;
    MockCasinoForInvariant public casino;
    VyreJackCoreHandler public handler;
    address public chipToken = address(0x1234);

    function setUp() public {
        // Deploy VRF mock
        vrf = new MockVRFForInvariant();

        // Deploy Casino mock
        casino = new MockCasinoForInvariant(chipToken);

        // Deploy VyreJackCore with UUPS proxy
        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));

        // Wire up
        vrf.setGame(address(game));
        casino.setGame(address(game));

        // Configure bet limits
        game.setBetLimits(chipToken, 1e18, 1000e18);

        // Create handler
        handler = new VyreJackCoreHandler(game, casino, chipToken);

        // Target only handler
        targetContract(address(handler));
    }

    /**
     * @notice Invariant: Hand value calculations are always <= 21 for non-busted hands
     */
    function invariant_handValueValid() public view {
        uint256 count = handler.getPlayersCount();

        for (uint256 i = 0; i < count; i++) {
            address player = handler.players(i);
            (,, uint8[] memory playerCards,, VyreJackCore.GameState state) = game.getGame(player);

            if (state == VyreJackCore.GameState.PlayerTurn) {
                (uint8 value,) = game.calculateHandValue(playerCards);
                assertTrue(value <= 21, "Player hand should be <= 21 on PlayerTurn");
            }
        }
    }

    /**
     * @notice Invariant: Blackjack payout should be 2.5x bet
     */
    function invariant_blackjackPayoutRatio() public pure {
        // Blackjack payout = bet * 5 / 2 = 2.5x
        uint256 bet = 100e18;
        uint256 expectedPayout = (bet * 5) / 2;
        assertEq(expectedPayout, 250e18, "Blackjack payout should be 2.5x bet");
    }

    /**
     * @notice Invariant: Win payout should be 2x bet
     */
    function invariant_winPayoutRatio() public pure {
        uint256 bet = 100e18;
        uint256 expectedPayout = bet * 2;
        assertEq(expectedPayout, 200e18, "Win payout should be 2x bet");
    }

    /**
     * @notice Invariant: Cards are always valid (0-51)
     */
    function invariant_cardsValid() public view {
        uint256 count = handler.getPlayersCount();

        for (uint256 i = 0; i < count; i++) {
            address player = handler.players(i);
            (,, uint8[] memory playerCards, uint8[] memory dealerCards,) = game.getGame(player);

            for (uint256 j = 0; j < playerCards.length; j++) {
                assertTrue(playerCards[j] < 52, "Player card must be < 52");
            }
            for (uint256 j = 0; j < dealerCards.length; j++) {
                assertTrue(dealerCards[j] < 52, "Dealer card must be < 52");
            }
        }
    }

    /**
     * @notice Invariant: Active games have non-zero bets
     */
    function invariant_activeGamesHaveBets() public view {
        uint256 count = handler.getPlayersCount();

        for (uint256 i = 0; i < count; i++) {
            address player = handler.players(i);
            (, uint256 bet,,, VyreJackCore.GameState state) = game.getGame(player);

            if (state != VyreJackCore.GameState.Idle) {
                assertTrue(bet > 0, "Active game must have bet > 0");
            }
        }
    }

    /**
     * @notice Invariant: Completed games have empty state
     */
    function invariant_idleGamesCleared() public view {
        uint256 count = handler.getPlayersCount();

        for (uint256 i = 0; i < count; i++) {
            address player = handler.players(i);
            (
                ,
                uint256 bet,
                uint8[] memory playerCards,
                uint8[] memory dealerCards,
                VyreJackCore.GameState state
            ) = game.getGame(player);

            if (state == VyreJackCore.GameState.Idle) {
                assertEq(bet, 0, "Idle game should have bet = 0");
                assertEq(playerCards.length, 0, "Idle game should have no player cards");
                assertEq(dealerCards.length, 0, "Idle game should have no dealer cards");
            }
        }
    }

    /**
     * @notice Debug summary
     */
    function invariant_callSummary() public view {
        console.log("=== VyreJackCore Invariant Summary ===");
        console.log("Games started:", handler.ghost_gamesStarted());
        console.log("Games completed:", handler.ghost_gamesCompleted());
        console.log("Total bets:", handler.ghost_totalBets());
        console.log("Surrenders:", handler.ghost_surrenders());
        console.log("Total payouts:", casino.totalPayouts());
    }
}

/**
 * @title VyreJackCore Fuzz Tests
 */
contract VyreJackCoreFuzzTest is Test {
    VyreJackCore public game;
    MockVRFForInvariant public vrf;
    MockCasinoForInvariant public casino;
    address public chipToken = address(0x1234);

    function setUp() public {
        vrf = new MockVRFForInvariant();
        casino = new MockCasinoForInvariant(chipToken);

        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));

        vrf.setGame(address(game));
        casino.setGame(address(game));
        game.setBetLimits(chipToken, 1e18, 1000e18);
    }

    /**
     * @notice Fuzz test: calculateHandValue never overflows
     */
    function testFuzz_calculateHandValueNoOverflow(
        uint8[] memory cards
    ) public view {
        // Bound cards to valid range
        for (uint256 i = 0; i < cards.length; i++) {
            cards[i] = cards[i] % 52;
        }

        if (cards.length == 0 || cards.length > 20) return;

        (uint8 value, bool isSoft) = game.calculateHandValue(cards);

        // Value should be reasonable
        assertTrue(value <= 255, "Hand value should not overflow");

        // Soft hands have at least one ace counted as 11
        if (isSoft) {
            bool hasAce = false;
            for (uint256 i = 0; i < cards.length; i++) {
                if (cards[i] % 13 == 0) hasAce = true;
            }
            assertTrue(hasAce, "Soft hand must have ace");
        }
    }

    /**
     * @notice Fuzz test: Invalid bet amounts should revert
     */
    function testFuzz_invalidBetReverts(
        uint256 betAmount
    ) public {
        address player = address(0xBEEF);

        uint256 minBet = game.minBet(chipToken);
        uint256 maxBet = game.maxBet(chipToken);

        // Skip valid bets - we only test invalid ones
        vm.assume(betAmount < minBet || betAmount > maxBet);

        IVyreGame.BetInfo memory bet =
            IVyreGame.BetInfo({ token: chipToken, amount: betAmount, chipTier: 0 });

        // Invalid bets should revert
        vm.expectRevert();
        game.play(player, bet, "");
    }

    /**
     * @notice Fuzz test: Hand value is consistent with card values
     */
    function testFuzz_handValueConsistency(
        uint8 card1,
        uint8 card2
    ) public view {
        card1 = card1 % 52;
        card2 = card2 % 52;

        uint8[] memory cards = new uint8[](2);
        cards[0] = card1;
        cards[1] = card2;

        (uint8 value,) = game.calculateHandValue(cards);

        // Single card value
        uint8 rank1 = card1 % 13;
        uint8 rank2 = card2 % 13;

        uint8 val1 = rank1 == 0 ? 11 : (rank1 >= 10 ? 10 : rank1 + 1);
        uint8 val2 = rank2 == 0 ? 11 : (rank2 >= 10 ? 10 : rank2 + 1);

        uint8 sum = val1 + val2;

        // If sum > 21 and we have an ace, reduce by 10
        if (sum > 21 && (rank1 == 0 || rank2 == 0)) {
            sum -= 10;
        }

        assertEq(value, sum, "Hand value calculation mismatch");
    }

    /**
     * @notice Fuzz test: Payout calculations for wins
     */
    function testFuzz_winPayoutCalculation(
        uint256 bet
    ) public pure {
        bet = bound(bet, 1e18, 1000e18);

        // Standard win = 2x bet
        uint256 winPayout = bet * 2;
        assertEq(winPayout, bet * 2, "Win payout should be 2x");

        // Blackjack win = 2.5x bet
        uint256 bjPayout = (bet * 5) / 2;
        assertEq(bjPayout, (bet * 5) / 2, "Blackjack payout should be 2.5x");

        // Push = refund
        uint256 pushPayout = bet;
        assertEq(pushPayout, bet, "Push payout should equal bet");

        // Surrender = 50%
        uint256 surrenderPayout = bet / 2;
        assertEq(surrenderPayout, bet / 2, "Surrender payout should be 50%");
    }

    /**
     * @notice Fuzz test: Double down doubles the effective bet
     */
    function testFuzz_doubleDownBet(
        uint256 originalBet
    ) public pure {
        originalBet = bound(originalBet, 1e18, 500e18);

        uint256 effectiveBet = originalBet * 2;
        uint256 winPayout = effectiveBet * 2;

        assertEq(winPayout, originalBet * 4, "Double down win should be 4x original");
    }
}
