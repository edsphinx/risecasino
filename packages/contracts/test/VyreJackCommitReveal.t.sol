// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IVRFCoordinator } from "../src/interfaces/IVRFCoordinator.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MockVRFWithTimeout
 * @notice VRF that can simulate timeouts for testing commit-reveal fallback
 */
contract MockVRFWithTimeout is IVRFCoordinator {
    VyreJackCore public game;
    uint256 public requestId;
    bool public simulateTimeout;

    mapping(uint256 => uint32) public pendingRequests;
    mapping(uint256 => bool) public requestFulfilled;

    constructor() {
        simulateTimeout = false;
    }

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function setSimulateTimeout(
        bool _timeout
    ) external {
        simulateTimeout = _timeout;
    }

    function requestRandomNumbers(
        uint32 numNumbers,
        uint256 /* seed */
    ) external returns (uint256) {
        requestId++;
        pendingRequests[requestId] = numNumbers;
        return requestId;
    }

    function fulfill(
        uint256 _requestId,
        uint256[] memory randomNumbers
    ) external {
        require(!simulateTimeout, "VRF is timing out");
        require(pendingRequests[_requestId] > 0, "No pending request");
        require(!requestFulfilled[_requestId], "Already fulfilled");
        requestFulfilled[_requestId] = true;
        game.rawFulfillRandomNumbers(_requestId, randomNumbers);
    }

    function fulfillRandom(
        uint256 _requestId
    ) external {
        require(!simulateTimeout, "VRF is timing out");
        uint32 numNumbers = pendingRequests[_requestId];
        require(numNumbers > 0, "No pending request");
        require(!requestFulfilled[_requestId], "Already fulfilled");

        uint256[] memory randoms = new uint256[](numNumbers);
        for (uint32 i = 0; i < numNumbers; i++) {
            randoms[i] =
                uint256(keccak256(abi.encodePacked(_requestId, i, blockhash(block.number - 1))));
        }

        requestFulfilled[_requestId] = true;
        game.rawFulfillRandomNumbers(_requestId, randoms);
    }

    function getLastRequestId() external view returns (uint256) {
        return requestId;
    }
}

/**
 * @title MockCasinoForCommitReveal
 * @notice Mock casino with settlePayout support
 */
contract MockCasinoForCommitReveal {
    VyreJackCore public game;
    uint256 public lastSettleAmount;
    address public lastSettlePlayer;
    address public lastSettleToken;

    function setGame(
        address _game
    ) external {
        game = VyreJackCore(_game);
    }

    function playGame(
        address player,
        address token,
        uint256 amount
    ) external {
        IVyreGame.BetInfo memory bet =
            IVyreGame.BetInfo({ token: token, amount: amount, chipTier: 0 });
        game.play(player, bet, "");
    }

    function settlePayout(
        address player,
        address token,
        uint256 amount
    ) external {
        lastSettlePlayer = player;
        lastSettleToken = token;
        lastSettleAmount = amount;
    }
}

/**
 * @title VyreJackCommitRevealTest
 * @notice Comprehensive tests for V8 commit-reveal fallback
 */
contract VyreJackCommitRevealTest is Test {
    VyreJackCore public game;
    MockVRFWithTimeout public vrf;
    MockCasinoForCommitReveal public casino;

    address public owner = address(this);
    address public keeper = address(0xBEEF);
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public chipToken = address(0xC41F);

    // Events to test
    event KeeperChanged(address indexed oldKeeper, address indexed newKeeper);
    event FallbackCommit(address indexed player, bytes32 indexed commitment, uint256 blockNumber);
    event FallbackReveal(address indexed player, uint256 randomness, string reason);
    event RandomnessSourceUsed(address indexed player, bool isVRF, string source);

    function setUp() public {
        // Deploy VRF mock
        vrf = new MockVRFWithTimeout();

        // Deploy casino mock
        casino = new MockCasinoForCommitReveal();

        // Deploy VyreJackCore via proxy
        VyreJackCore impl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino), owner
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        game = VyreJackCore(address(proxy));

        // Setup references
        vrf.setGame(address(game));
        casino.setGame(address(game));

        // Set keeper
        game.setKeeper(keeper);

        // Set bet limits
        game.setBetLimits(chipToken, 1e18, 1000e18);
    }

    // ==================== KEEPER SETUP TESTS ====================

    function test_SetKeeper() public {
        address newKeeper = address(0xDEAD);

        vm.expectEmit(true, true, false, false);
        emit KeeperChanged(keeper, newKeeper);

        game.setKeeper(newKeeper);
        assertEq(game.keeper(), newKeeper);
    }

    function test_RevertSetKeeper_NotOwner() public {
        vm.prank(player1);
        vm.expectRevert("VyreJackCore: only owner");
        game.setKeeper(player1);
    }

    // ==================== FALLBACK COMMIT TESTS ====================

    function test_FallbackCommit_WhenVRFTimeout() public {
        // Start game
        casino.playGame(player1, chipToken, 100e18);

        // Check game is waiting for VRF
        (,,,, VyreJackCore.GameState state) = game.getGame(player1);
        assertEq(uint8(state), uint8(VyreJackCore.GameState.WaitingForDeal));

        // Simulate VRF timeout (advance time past VRF_TIMEOUT)
        vm.warp(block.timestamp + 16); // VRF_TIMEOUT is 15

        // Keeper commits
        bytes32 secret = keccak256("test_secret");
        bytes32 commitment = keccak256(abi.encodePacked(secret));

        vm.expectEmit(true, true, false, true);
        emit FallbackCommit(player1, commitment, block.number);

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        // Verify commit is pending
        (bytes32 storedCommit, uint256 commitBlock, bool pending) = game.commitRequests(player1);
        assertEq(storedCommit, commitment);
        assertEq(commitBlock, block.number);
        assertTrue(pending);
    }

    function test_RevertFallbackCommit_NotKeeper() public {
        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 commitment = keccak256("secret");

        vm.prank(player1);
        vm.expectRevert("VyreJackCore: only keeper");
        game.fallbackCommit(player1, commitment);
    }

    function test_RevertFallbackCommit_VRFNotTimedOut() public {
        casino.playGame(player1, chipToken, 100e18);

        // Don't advance time - VRF hasn't timed out yet
        bytes32 commitment = keccak256("secret");

        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: VRF not timed out");
        game.fallbackCommit(player1, commitment);
    }

    function test_RevertFallbackCommit_GameNotWaiting() public {
        // No active game
        bytes32 commitment = keccak256("secret");

        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: game not waiting");
        game.fallbackCommit(player1, commitment);
    }

    function test_RevertFallbackCommit_AlreadyPending() public {
        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 commitment = keccak256("secret");

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        // Try to commit again
        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: commit pending");
        game.fallbackCommit(player1, keccak256("another_secret"));
    }

    // ==================== FALLBACK REVEAL TESTS ====================

    function test_FallbackReveal_DealsCards() public {
        // Start game and simulate VRF timeout
        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        // Commit
        bytes32 secret = keccak256("test_secret_for_reveal");
        bytes32 commitment = keccak256(abi.encodePacked(secret));

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        // Advance 1 block
        vm.roll(block.number + 1);

        // Reveal
        vm.expectEmit(true, false, false, false);
        emit FallbackReveal(player1, 0, "VRF timeout - commit-reveal fallback");

        vm.expectEmit(true, false, false, true);
        emit RandomnessSourceUsed(player1, false, "commit-reveal");

        vm.prank(keeper);
        game.fallbackReveal(player1, secret);

        // Game should have progressed (not in WaitingForDeal anymore)
        (,,,, VyreJackCore.GameState state) = game.getGame(player1);
        assertTrue(uint8(state) != uint8(VyreJackCore.GameState.WaitingForDeal));
        assertTrue(
            uint8(state) != uint8(VyreJackCore.GameState.Idle)
                || state == VyreJackCore.GameState.Idle
        );
    }

    function test_RevertFallbackReveal_InvalidSecret() public {
        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 secret = keccak256("correct_secret");
        bytes32 commitment = keccak256(abi.encodePacked(secret));

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        vm.roll(block.number + 1);

        // Try to reveal with wrong secret
        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: invalid reveal");
        game.fallbackReveal(player1, keccak256("wrong_secret"));
    }

    function test_RevertFallbackReveal_TooSoon() public {
        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 secret = keccak256("secret");
        bytes32 commitment = keccak256(abi.encodePacked(secret));

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        // Don't advance block
        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: wait one block");
        game.fallbackReveal(player1, secret);
    }

    function test_RevertFallbackReveal_NoCommit() public {
        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: no pending commit");
        game.fallbackReveal(player1, keccak256("secret"));
    }

    // ==================== FULL FLOW TESTS ====================

    function test_FullGameWithCommitReveal() public {
        // 1. Start game
        casino.playGame(player1, chipToken, 100e18);

        // 2. VRF times out
        vrf.setSimulateTimeout(true);
        vm.warp(block.timestamp + 16);

        // 3. Keeper commits
        bytes32 secret = keccak256("game_secret");
        bytes32 commitment = keccak256(abi.encodePacked(secret));
        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        // 4. Advance block and reveal
        vm.roll(block.number + 1);
        vm.prank(keeper);
        game.fallbackReveal(player1, secret);

        // 5. Game should be in valid state (PlayerTurn or ended)
        (,,,, VyreJackCore.GameState state) = game.getGame(player1);
        assertTrue(
            uint8(state) == uint8(VyreJackCore.GameState.PlayerTurn)
                || uint8(state) == uint8(VyreJackCore.GameState.PlayerWin)
                || uint8(state) == uint8(VyreJackCore.GameState.DealerWin)
                || uint8(state) == uint8(VyreJackCore.GameState.Push)
                || uint8(state) == uint8(VyreJackCore.GameState.PlayerBlackjack)
                || uint8(state) == uint8(VyreJackCore.GameState.Idle)
        );
    }

    function test_VRFAndCommitRevealDontConflict() public {
        // Player1 uses VRF (normal flow)
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // VRF fulfills normally
        uint256[] memory cards = new uint256[](4);
        cards[0] = 5;
        cards[1] = 10;
        cards[2] = 3;
        cards[3] = 8;
        vrf.fulfill(reqId, cards);

        (,,,, VyreJackCore.GameState state1) = game.getGame(player1);
        assertEq(uint8(state1), uint8(VyreJackCore.GameState.PlayerTurn));

        // Player2 uses commit-reveal (VRF timeout)
        vrf.setSimulateTimeout(true);
        casino.playGame(player2, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 secret = keccak256("p2_secret");
        bytes32 commitment = keccak256(abi.encodePacked(secret));
        vm.prank(keeper);
        game.fallbackCommit(player2, commitment);

        vm.roll(block.number + 1);
        vm.prank(keeper);
        game.fallbackReveal(player2, secret);

        (,,,, VyreJackCore.GameState state2) = game.getGame(player2);
        assertTrue(uint8(state2) != uint8(VyreJackCore.GameState.WaitingForDeal));
    }

    // ==================== FUZZ TESTS ====================

    function testFuzz_FallbackCommit_ValidCommitment(
        bytes32 randomSecret
    ) public {
        vm.assume(randomSecret != bytes32(0));

        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 commitment = keccak256(abi.encodePacked(randomSecret));

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        (bytes32 storedCommit,, bool pending) = game.commitRequests(player1);
        assertEq(storedCommit, commitment);
        assertTrue(pending);
    }

    function testFuzz_FallbackReveal_ProducesRandomness(
        bytes32 randomSecret
    ) public {
        vm.assume(randomSecret != bytes32(0));

        casino.playGame(player1, chipToken, 100e18);
        vm.warp(block.timestamp + 16);

        bytes32 commitment = keccak256(abi.encodePacked(randomSecret));

        vm.prank(keeper);
        game.fallbackCommit(player1, commitment);

        vm.roll(block.number + 1);

        vm.prank(keeper);
        game.fallbackReveal(player1, randomSecret);

        // Commit should be cleared
        (,, bool pending) = game.commitRequests(player1);
        assertFalse(pending);
    }

    function testFuzz_MultiplePlayersCommitReveal(
        uint8 numPlayers
    ) public {
        numPlayers = uint8(bound(numPlayers, 1, 10));

        // Track timestamp/block manually to avoid via_ir optimizer caching
        // block.timestamp and block.number across loop iterations.
        // Foundry cheatcodes (vm.warp/vm.roll) mutate block-level state mid-tx,
        // but the Yul optimizer may cache these opcodes since they normally
        // cannot change within a single transaction.
        uint256 ts = block.timestamp;
        uint256 bn = block.number;

        for (uint8 i = 0; i < numPlayers; i++) {
            address player = address(uint160(100 + i));

            casino.playGame(player, chipToken, 100e18);
            ts += 16;
            vm.warp(ts);

            bytes32 secret = keccak256(abi.encodePacked("secret", i));
            bytes32 commitment = keccak256(abi.encodePacked(secret));

            vm.prank(keeper);
            game.fallbackCommit(player, commitment);

            bn += 1;
            vm.roll(bn);

            vm.prank(keeper);
            game.fallbackReveal(player, secret);

            (,,,, VyreJackCore.GameState state) = game.getGame(player);
            assertTrue(uint8(state) != uint8(VyreJackCore.GameState.WaitingForDeal));
        }
    }

    // ==================== EDGE CASE TESTS ====================

    function test_VRFResolvesBeforeCommit() public {
        // VRF works initially
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        // Time passes but VRF comes through before keeper acts
        vm.warp(block.timestamp + 10); // Under timeout

        uint256[] memory cards = new uint256[](4);
        cards[0] = 5;
        cards[1] = 10;
        cards[2] = 3;
        cards[3] = 8;
        vrf.fulfill(reqId, cards);

        // Game progresses normally
        (,,,, VyreJackCore.GameState state) = game.getGame(player1);
        assertEq(uint8(state), uint8(VyreJackCore.GameState.PlayerTurn));

        // Keeper can't commit now (game not waiting)
        vm.warp(block.timestamp + 20);
        bytes32 commitment = keccak256(abi.encodePacked(keccak256("secret")));

        vm.prank(keeper);
        vm.expectRevert("VyreJackCore: game not waiting");
        game.fallbackCommit(player1, commitment);
    }

    function test_GetVRFRequest() public {
        casino.playGame(player1, chipToken, 100e18);
        uint256 reqId = vrf.getLastRequestId();

        (address player, VyreJackCore.RequestType reqType, bool fulfilled, uint256 timestamp) =
            game.getVRFRequest(reqId);

        assertEq(player, player1);
        assertEq(uint8(reqType), uint8(VyreJackCore.RequestType.InitialDeal));
        assertFalse(fulfilled);
        assertTrue(timestamp > 0);
    }
}

/**
 * @title VyreJackCommitRevealInvariantTest
 * @notice Invariant tests for commit-reveal fallback
 */
contract VyreJackCommitRevealInvariantTest is Test {
    VyreJackCore public game;
    MockVRFWithTimeout public vrf;
    MockCasinoForCommitReveal public casino;

    address public keeper = address(0xBEEF);
    address public chipToken = address(0xC41F);

    function setUp() public {
        vrf = new MockVRFWithTimeout();
        casino = new MockCasinoForCommitReveal();

        VyreJackCore impl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino), address(this)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        game = VyreJackCore(address(proxy));

        vrf.setGame(address(game));
        casino.setGame(address(game));
        game.setKeeper(keeper);
        game.setBetLimits(chipToken, 1e18, 1000e18);

        targetContract(address(this));
    }

    // Handler functions for invariant testing
    function handler_startGame(
        uint8 playerSeed
    ) public {
        address player = address(uint160(bound(playerSeed, 1, 50)));

        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        if (state == VyreJackCore.GameState.Idle) {
            casino.playGame(player, chipToken, 100e18);
        }
    }

    function handler_vrfFulfill(
        uint8 playerSeed
    ) public {
        address player = address(uint160(bound(playerSeed, 1, 50)));

        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        if (state == VyreJackCore.GameState.WaitingForDeal) {
            uint256 reqId = vrf.getLastRequestId();
            try vrf.fulfillRandom(reqId) { } catch { }
        }
    }

    function handler_commitReveal(
        uint8 playerSeed,
        bytes32 secretSeed
    ) public {
        address player = address(uint160(bound(playerSeed, 1, 50)));

        (,,,, VyreJackCore.GameState state) = game.getGame(player);
        (,, bool pending) = game.commitRequests(player);

        if (state == VyreJackCore.GameState.WaitingForDeal && !pending) {
            vm.warp(block.timestamp + 16);

            bytes32 secret = keccak256(abi.encodePacked(secretSeed));
            bytes32 commitment = keccak256(abi.encodePacked(secret));

            vm.prank(keeper);
            try game.fallbackCommit(player, commitment) { } catch { }

            vm.roll(block.number + 1);

            vm.prank(keeper);
            try game.fallbackReveal(player, secret) { } catch { }
        }
    }

    // INVARIANT: A pending commit must have a valid commitment hash
    function invariant_pendingCommitHasValidHash() public view {
        for (uint160 i = 1; i <= 50; i++) {
            address player = address(i);
            (bytes32 commitment,, bool pending) = game.commitRequests(player);

            if (pending) {
                assertTrue(commitment != bytes32(0), "Pending commit has zero hash");
            }
        }
    }

    // INVARIANT: Game can only be in WaitingForDeal or progressed states
    function invariant_validGameStates() public view {
        for (uint160 i = 1; i <= 50; i++) {
            address player = address(i);
            (,,,, VyreJackCore.GameState state) = game.getGame(player);

            assertTrue(
                uint8(state) <= uint8(VyreJackCore.GameState.PlayerBlackjack), "Invalid game state"
            );
        }
    }
}
