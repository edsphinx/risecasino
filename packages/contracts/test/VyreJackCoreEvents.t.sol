// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IVRFCoordinator } from "../src/interfaces/IVRFCoordinator.sol";

/**
 * @title MockVRF for testing
 */
contract MockVRFForEvents is IVRFCoordinator {
    VyreJackCore public game;
    uint256 public requestId;
    mapping(uint256 => uint32) public pendingRequests;

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function requestRandomNumbers(
        uint32 numNumbers,
        uint256
    ) external returns (uint256) {
        requestId++;
        pendingRequests[requestId] = numNumbers;
        return requestId;
    }

    function fulfill(
        uint256 _requestId,
        uint256[] memory randomNumbers
    ) external {
        game.rawFulfillRandomNumbers(_requestId, randomNumbers);
    }

    function getLastRequestId() external view returns (uint256) {
        return requestId;
    }
}

/**
 * @title MockCasinoWithSettlePayout
 * @notice Mock casino that tracks settlePayout calls
 */
contract MockCasinoWithSettlePayout {
    VyreJackCore public game;

    // Track settlePayout calls
    struct PayoutCall {
        address player;
        address token;
        uint256 amount;
    }
    PayoutCall[] public payoutCalls;

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function playGame(
        address player,
        address token,
        uint256 amount
    ) external returns (IVyreGame.GameResult memory) {
        IVyreGame.BetInfo memory bet =
            IVyreGame.BetInfo({ token: token, amount: amount, chipTier: 0 });
        return game.play(player, bet, "");
    }

    // settlePayout callback (called by VyreJackCore._finishGame)
    function settlePayout(
        address player,
        address token,
        uint256 grossPayout
    ) external {
        payoutCalls.push(PayoutCall({ player: player, token: token, amount: grossPayout }));
    }

    function getPayoutCallCount() external view returns (uint256) {
        return payoutCalls.length;
    }

    function getLastPayoutCall()
        external
        view
        returns (address player, address token, uint256 amount)
    {
        require(payoutCalls.length > 0, "No payout calls");
        PayoutCall memory last = payoutCalls[payoutCalls.length - 1];
        return (last.player, last.token, last.amount);
    }
}

/**
 * @title VyreJackCoreEventsTest
 * @notice Tests for new events: GameResolved, PlayerBusted, DealerBusted, DealerCardRevealed
 *         and settlePayout callback
 */
contract VyreJackCoreEventsTest is Test {
    VyreJackCore public game;
    MockVRFForEvents public vrf;
    MockCasinoWithSettlePayout public casino;
    address public chipToken = address(0x1234);

    address public owner = address(this);
    address public player1 = address(0x1);

    // Events to test
    event GameResolved(
        address indexed player,
        VyreJackCore.GameState result,
        uint256 payout,
        uint8 playerFinalValue,
        uint8 dealerFinalValue
    );
    event PlayerBusted(address indexed player, uint8 finalValue);
    event DealerBusted(address indexed player, uint8 finalValue);
    event DealerCardRevealed(address indexed player, uint8 card);
    event CardDealt(address indexed player, uint8 card, bool isDealer, bool faceUp);

    function setUp() public {
        // Deploy mocks
        vrf = new MockVRFForEvents();
        casino = new MockCasinoWithSettlePayout();

        // Deploy game
        game = new VyreJackCore(address(vrf), address(casino));
        vrf.setGame(address(game));
        casino.setGame(address(game));

        // Configure
        game.setBetLimits(chipToken, 1e18, 1000e18);
    }

    // ==================== SETTLE PAYOUT TESTS ====================

    function test_SettlePayoutCalledOnPlayerWin() public {
        // Start game
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal cards: Player 20 (10+10), Dealer 18 (10+8)
        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 9; // Dealer: 10 = 10
        cards[2] = 11; // Player: Queen = 10 (total 20)
        cards[3] = 7; // Dealer: 8 = 8 (total 18)
        vrf.fulfill(reqId, cards);

        // Player stands (calls dealer turn)
        vm.prank(player1);
        game.stand();

        // Verify settlePayout was called with correct amounts
        assertEq(casino.getPayoutCallCount(), 1);
        (address p, address t, uint256 amount) = casino.getLastPayoutCall();
        assertEq(p, player1);
        assertEq(t, chipToken);
        assertEq(amount, 200e18); // 2x bet for win
    }

    function test_SettlePayoutCalledOnBlackjack() public {
        // Start game
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal blackjack: Player A+K = 21, Dealer 10+8 = 18
        uint256[] memory cards = new uint256[](4);
        cards[0] = 0; // Player: Ace = 11
        cards[1] = 9; // Dealer: 10 = 10
        cards[2] = 12; // Player: King = 10 (total 21 Blackjack!)
        cards[3] = 7; // Dealer: 8 = 8 (total 18)
        vrf.fulfill(reqId, cards);

        // Blackjack auto-resolves, verify payout
        assertEq(casino.getPayoutCallCount(), 1);
        (,, uint256 amount) = casino.getLastPayoutCall();
        assertEq(amount, 250e18); // 2.5x bet for blackjack
    }

    function test_SettlePayoutCalledOnPush() public {
        // Start game
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal push: Both 20
        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 11; // Dealer: Queen = 10
        cards[2] = 11; // Player: Queen = 10 (total 20)
        cards[3] = 10; // Dealer: Jack = 10 (total 20)
        vrf.fulfill(reqId, cards);

        // Player stands, should push
        vm.prank(player1);
        game.stand();

        // Verify push payout (return of bet)
        assertEq(casino.getPayoutCallCount(), 1);
        (,, uint256 amount) = casino.getLastPayoutCall();
        assertEq(amount, 100e18); // 1x bet returned for push
    }

    function test_NoSettlePayoutOnDealerWin() public {
        // Start game
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal: Player 15, Dealer 20
        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 10; // Dealer: Jack = 10
        cards[2] = 4; // Player: 5 (total 15)
        cards[3] = 11; // Dealer: Queen (total 20)
        vrf.fulfill(reqId, cards);

        // Player stands, dealer wins
        vm.prank(player1);
        game.stand();

        // No payout call (dealer wins)
        assertEq(casino.getPayoutCallCount(), 0);
    }

    // ==================== GAME RESOLVED EVENT TESTS ====================

    function test_GameResolvedEventOnPlayerWin() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 9; // Dealer: 10
        cards[2] = 11; // Player: Queen = 10 (total 20)
        cards[3] = 7; // Dealer: 8 (total 18)
        vrf.fulfill(reqId, cards);

        // Expect GameResolved event
        vm.expectEmit(true, false, false, true);
        emit GameResolved(player1, VyreJackCore.GameState.PlayerWin, 200e18, 20, 18);

        vm.prank(player1);
        game.stand();
    }

    // ==================== PLAYER BUSTED EVENT TESTS ====================

    function test_PlayerBustedEventOnBust() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal: Player 15 (10+5)
        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 9; // Dealer: 10
        cards[2] = 4; // Player: 5 (total 15)
        cards[3] = 7; // Dealer: 8 (hidden)
        vrf.fulfill(reqId, cards);

        // Hit - get high card to bust
        vm.prank(player1);
        game.hit();
        uint256 hitReqId = vrf.getLastRequestId();

        // Fulfill with card that causes bust (10 -> 25)
        uint256[] memory hitCard = new uint256[](1);
        hitCard[0] = 10; // Another Jack = 10 (total 25, bust!)

        vm.expectEmit(true, false, false, true);
        emit PlayerBusted(player1, 25);

        vrf.fulfill(hitReqId, hitCard);

        // Game should be resolved (dealer wins via bust)
        assertEq(casino.getPayoutCallCount(), 0);
    }

    // ==================== DEALER BUSTED EVENT TESTS ====================

    function test_DealerBustedEventOnBust() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Deal: Player 20, Dealer 16 (will need to hit and bust)
        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 5; // Dealer: 6
        cards[2] = 11; // Player: Queen = 10 (total 20)
        cards[3] = 9; // Dealer: 10 (total 16, must hit)
        vrf.fulfill(reqId, cards);

        // Player stands, dealer hits and busts with 10
        vm.prank(player1);
        game.stand();
        uint256 dealerReqId = vrf.getLastRequestId();

        // Dealer gets 10, busts (16 + 10 = 26)
        uint256[] memory dealerCard = new uint256[](1);
        dealerCard[0] = 10; // Jack = 10 (total 26, bust!)

        vm.expectEmit(true, false, false, true);
        emit DealerBusted(player1, 26);

        vrf.fulfill(dealerReqId, dealerCard);

        // Player wins via dealer bust
        assertEq(casino.getPayoutCallCount(), 1);
    }

    // ==================== DEALER CARD REVEALED EVENT TESTS ====================

    function test_DealerCardRevealedOnStand() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack
        cards[1] = 9; // Dealer: 10
        cards[2] = 11; // Player: Queen (total 20)
        cards[3] = 7; // Dealer: 8 (hidden)
        vrf.fulfill(reqId, cards);

        // When player stands, dealer's hole card should be revealed
        vm.expectEmit(true, false, false, true);
        emit DealerCardRevealed(player1, 7); // Card at index 3

        vm.prank(player1);
        game.stand();
    }
}
