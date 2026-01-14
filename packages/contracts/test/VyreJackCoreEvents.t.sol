// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, Vm } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IVRFCoordinator } from "../src/interfaces/IVRFCoordinator.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

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

        // Deploy game (UUPS upgradeable pattern)
        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));
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
        // PUSH now returns bet refund (traditional behavior)
        // House edge (2%) applied via settlePayout
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

        // Verify payout called with bet amount (house edge applied by casino)
        assertEq(casino.getPayoutCallCount(), 1);
        (,, uint256 amount) = casino.getLastPayoutCall();
        assertEq(amount, 100e18); // Full bet returned (house edge applied by casino)
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
    // GameResolved is now emitted in normal game flow alongside GamePlayed

    function test_GameResolvedEventOnPlayerWin() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        uint256[] memory cards = new uint256[](4);
        cards[0] = 10; // Player: Jack = 10
        cards[1] = 9; // Dealer: 10
        cards[2] = 11; // Player: Queen = 10 (total 20)
        cards[3] = 7; // Dealer: 8 (total 18)
        vrf.fulfill(reqId, cards);

        // Record logs to check both GameResolved and GamePlayed
        vm.recordLogs();

        vm.prank(player1);
        game.stand();

        // Check logs for both events
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundGameResolved = false;
        bool foundGamePlayed = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("GameResolved(address,uint8,uint256,uint8,uint8)")) {
                foundGameResolved = true;
                assertEq(logs[i].topics[1], bytes32(uint256(uint160(player1))));
            }
            if (logs[i].topics[0] == keccak256("GamePlayed(address,address,uint256,bool,uint256)"))
            {
                foundGamePlayed = true;
            }
        }
        assertTrue(foundGameResolved, "GameResolved event not found on player win");
        assertTrue(foundGamePlayed, "GamePlayed event not found on player win");
    }

    // ==================== PLAYER BUSTED EVENT TESTS ====================
    // PlayerBusted is now properly emitted when player exceeds 21

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

        // Record logs to verify GamePlayed was emitted on bust
        vm.recordLogs();
        vrf.fulfill(hitReqId, hitCard);

        // Check logs for PlayerBusted event (now implemented!)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundPlayerBusted = false;
        bool foundGameResolved = false;
        bool foundGamePlayed = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("PlayerBusted(address,uint8)")) {
                foundPlayerBusted = true;
            }
            if (logs[i].topics[0] == keccak256("GameResolved(address,uint8,uint256,uint8,uint8)")) {
                foundGameResolved = true;
            }
            if (logs[i].topics[0] == keccak256("GamePlayed(address,address,uint256,bool,uint256)"))
            {
                foundGamePlayed = true;
            }
        }
        assertTrue(foundPlayerBusted, "PlayerBusted event not found on player bust");
        assertTrue(foundGameResolved, "GameResolved event not found on player bust");
        assertTrue(foundGamePlayed, "GamePlayed event not found on player bust");

        // Game should be resolved (dealer wins via bust)
        assertEq(casino.getPayoutCallCount(), 0);
    }

    // ==================== DEALER BUSTED EVENT TESTS ====================
    // DealerBusted is now properly emitted when dealer exceeds 21

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

        // Record logs to verify GamePlayed was emitted on dealer bust
        vm.recordLogs();
        vrf.fulfill(dealerReqId, dealerCard);

        // Check logs for DealerBusted event (now implemented!)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundDealerBusted = false;
        bool foundGameResolved = false;
        bool foundGamePlayed = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("DealerBusted(address,uint8)")) {
                foundDealerBusted = true;
            }
            if (logs[i].topics[0] == keccak256("GameResolved(address,uint8,uint256,uint8,uint8)")) {
                foundGameResolved = true;
            }
            if (logs[i].topics[0] == keccak256("GamePlayed(address,address,uint256,bool,uint256)"))
            {
                foundGamePlayed = true;
            }
        }
        assertTrue(foundDealerBusted, "DealerBusted event not found on dealer bust");
        assertTrue(foundGameResolved, "GameResolved event not found on dealer bust");
        assertTrue(foundGamePlayed, "GamePlayed event not found on dealer bust");

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

        // Record logs to verify DealerCardRevealed was emitted
        vm.recordLogs();

        vm.prank(player1);
        game.stand();

        // Check logs for DealerCardRevealed event (now implemented!)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundDealerCardRevealed = false;
        bool foundCardDealt = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("DealerCardRevealed(address,uint8)")) {
                foundDealerCardRevealed = true;
            }
            if (logs[i].topics[0] == keccak256("CardDealt(address,uint8,bool,bool)")) {
                foundCardDealt = true;
            }
        }
        assertTrue(foundDealerCardRevealed, "DealerCardRevealed event not found when standing");
        assertTrue(foundCardDealt, "CardDealt event not found when standing");
    }
}
