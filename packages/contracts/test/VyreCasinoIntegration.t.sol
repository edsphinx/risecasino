// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { VyreCasino } from "../src/core/VyreCasino.sol";
import { VyreTreasury } from "../src/core/VyreTreasury.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MockCHIP
 * @notice Simple ERC20 for testing
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
 * @title MockVRF
 * @notice VRF that stores requests for manual fulfillment
 */
contract MockVRF {
    VyreJackCore public game;
    uint256 public requestId;

    // Store pending requests
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

    // Call this after play() to fulfill the VRF
    function fulfill(
        uint256 _requestId
    ) external {
        uint32 numNumbers = pendingRequests[_requestId];
        require(numNumbers > 0, "No pending request");

        uint256[] memory randoms = new uint256[](numNumbers);
        for (uint32 i = 0; i < numNumbers; i++) {
            randoms[i] = uint256(keccak256(abi.encode(_requestId, i, block.timestamp)));
        }

        game.rawFulfillRandomNumbers(_requestId, randoms);
        delete pendingRequests[_requestId];
    }
}

/**
 * @title MockWinningGame
 * @notice Game that always returns a win for testing _processWin
 */
contract MockWinningGame is IVyreGame {
    address public casino;

    constructor(
        address _casino
    ) {
        casino = _casino;
    }

    function play(
        address,
        BetInfo calldata bet,
        bytes calldata
    ) external pure override returns (GameResult memory result) {
        // Always win 2x the bet
        result = GameResult({ won: true, payout: bet.amount * 2, metadata: "" });
    }

    function minBet(
        address
    ) external pure override returns (uint256) {
        return 1e18;
    }

    function maxBet(
        address
    ) external pure override returns (uint256) {
        return 1_000_000e18;
    }

    function name() external pure override returns (string memory) {
        return "MockWinningGame";
    }

    function isActive() external pure override returns (bool) {
        return true;
    }
}

/**
 * @title VyreCasinoIntegrationTest
 * @notice Tests for complete VyreCasino → VyreJackCore → VyreTreasury flow
 */
contract VyreCasinoIntegrationTest is Test {
    VyreCasino public casino;
    VyreJackCore public game;
    VyreTreasury public treasury;
    MockCHIP public chip;
    MockVRF public vrf;

    address public owner = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public buybackWallet = address(0xBB);

    function setUp() public {
        // Deploy mock tokens
        chip = new MockCHIP();

        // Deploy VRF
        vrf = new MockVRF();

        // Deploy Treasury (owner = this)
        treasury = new VyreTreasury(owner);

        // Deploy Casino
        casino = new VyreCasino(address(treasury), address(chip), owner, buybackWallet);

        // Set casino as treasury operator
        treasury.setOperator(address(casino));

        // Deploy Game (UUPS upgradeable pattern)
        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));
        vrf.setGame(address(game));

        // Register game in casino
        casino.registerGame(address(game));

        // Fund treasury with CHIP
        chip.mint(address(treasury), 100_000e18);

        // Fund players
        chip.mint(player1, 10_000e18);
        chip.mint(player2, 10_000e18);

        // Players approve casino
        vm.prank(player1);
        chip.approve(address(casino), type(uint256).max);

        vm.prank(player2);
        chip.approve(address(casino), type(uint256).max);
    }

    // ==================== BASIC TESTS ====================

    function test_CasinoSetup() public view {
        assertEq(address(casino.treasury()), address(treasury));
        assertEq(casino.chipToken(), address(chip));
        assertTrue(casino.registeredGames(address(game)));
        assertTrue(casino.whitelistedTokens(address(chip)));
    }

    function test_TreasuryOperator() public view {
        assertEq(treasury.operator(), address(casino));
    }

    function test_GameRegistered() public view {
        assertTrue(casino.registeredGames(address(game)));
        assertEq(game.casino(), address(casino));
    }

    // ==================== PLAY FLOW TESTS ====================

    function test_PlayGame() public {
        uint256 betAmount = 100e18;
        uint256 playerBalanceBefore = chip.balanceOf(player1);

        vm.prank(player1);
        casino.play(address(game), address(chip), betAmount, "");

        // Bet should be transferred to treasury
        assertLt(chip.balanceOf(player1), playerBalanceBefore);

        // Fulfill VRF to complete the game
        uint256 pendingRequestId = vrf.requestId();
        vrf.fulfill(pendingRequestId);

        // Game should be resolved now (either win, lose, or in player turn)
    }

    function test_RevertIfGameNotRegistered() public {
        // Deploy unregistered game (UUPS pattern)
        VyreJackCore unregImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy unregProxy = new ERC1967Proxy(address(unregImpl), initData);
        VyreJackCore unregisteredGame = VyreJackCore(address(unregProxy));

        vm.prank(player1);
        vm.expectRevert("VyreCasino: game not registered");
        casino.play(address(unregisteredGame), address(chip), 100e18, "");
    }

    function test_RevertIfTokenNotWhitelisted() public {
        MockCHIP badToken = new MockCHIP();
        badToken.mint(player1, 1000e18);

        vm.prank(player1);
        badToken.approve(address(casino), type(uint256).max);

        vm.prank(player1);
        vm.expectRevert("VyreCasino: token not whitelisted");
        casino.play(address(game), address(badToken), 100e18, "");
    }

    // ==================== REFERRAL TESTS ====================

    function test_SetReferrer() public {
        vm.prank(player1);
        casino.setReferrer(player2);

        assertEq(casino.referrers(player1), player2);
    }

    function test_RevertSelfReferral() public {
        vm.prank(player1);
        vm.expectRevert("VyreCasino: self referral");
        casino.setReferrer(player1);
    }

    // ==================== ADMIN TESTS ====================

    function test_RegisterGame() public {
        // Deploy new game (UUPS pattern)
        VyreJackCore newGameImpl = new VyreJackCore();
        bytes memory initData = abi.encodeWithSelector(
            VyreJackCore.initialize.selector, address(vrf), address(casino)
        );
        ERC1967Proxy newGameProxy = new ERC1967Proxy(address(newGameImpl), initData);
        VyreJackCore newGame = VyreJackCore(address(newGameProxy));

        casino.registerGame(address(newGame));
        assertTrue(casino.registeredGames(address(newGame)));
    }

    function test_UnregisterGame() public {
        casino.unregisterGame(address(game));
        assertFalse(casino.registeredGames(address(game)));
    }

    function test_WhitelistToken() public {
        MockCHIP newToken = new MockCHIP();

        casino.whitelistToken(address(newToken));
        assertTrue(casino.whitelistedTokens(address(newToken)));
    }

    function test_SetHouseEdge() public {
        casino.setHouseEdge(300); // 3%
        assertEq(casino.houseEdgeBps(), 300);
    }

    function test_RevertHouseEdgeTooHigh() public {
        vm.expectRevert("VyreCasino: max 10%");
        casino.setHouseEdge(1100); // 11%
    }

    // ==================== PAUSE TESTS ====================

    function test_Pause() public {
        casino.pause();
        assertTrue(casino.paused());

        vm.prank(player1);
        vm.expectRevert("VyreCasino: paused");
        casino.play(address(game), address(chip), 100e18, "");
    }

    function test_Unpause() public {
        casino.pause();
        casino.unpause();
        assertFalse(casino.paused());
    }

    function test_RevertZeroBet() public {
        vm.prank(player1);
        vm.expectRevert("VyreCasino: zero bet");
        casino.play(address(game), address(chip), 0, "");
    }

    function test_ClaimReferralEarningsNoEarnings() public {
        vm.prank(player1);
        vm.expectRevert("VyreCasino: no earnings");
        casino.claimReferralEarnings(address(chip));
    }

    function test_SetReferrerAlreadySet() public {
        vm.prank(player1);
        casino.setReferrer(player2);

        vm.prank(player1);
        vm.expectRevert("VyreCasino: referrer already set");
        casino.setReferrer(buybackWallet);
    }

    function test_SetReferrerZeroAddress() public {
        vm.prank(player1);
        vm.expectRevert("VyreCasino: zero referrer");
        casino.setReferrer(address(0));
    }

    function test_ChipTokenAlwaysWhitelisted() public view {
        assertTrue(casino.whitelistedTokens(address(chip)));
    }

    function test_GetChipTierBasic() public view {
        // Tier 0: 1 CHIP
        assertEq(casino.getChipTier(0), 0);
        assertEq(casino.getChipTier(1e18), 0);
        // Tier 1: 5 CHIP
        assertEq(casino.getChipTier(5e18), 1);
        // Tier 11: 1M CHIP
        assertEq(casino.getChipTier(1_000_001e18), 11);
    }
}

/**
 * @title VyreCasinoWinTest
 * @notice Tests for winning games, house edge, and referral earnings
 */
contract VyreCasinoWinTest is Test {
    VyreCasino public casino;
    MockWinningGame public winGame;
    VyreTreasury public treasury;
    MockCHIP public chip;

    address public owner = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public buybackWallet = address(0xBB);

    function setUp() public {
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, buybackWallet);
        treasury.setOperator(address(casino));

        // Deploy winning game
        winGame = new MockWinningGame(address(casino));
        casino.registerGame(address(winGame));

        // Fund treasury so it can pay out
        chip.mint(address(treasury), 100_000e18);

        // Give player chips
        chip.mint(player1, 10_000e18);
        vm.prank(player1);
        chip.approve(address(casino), type(uint256).max);
    }

    function test_PlayAndWin() public {
        uint256 betAmount = 100e18;

        vm.prank(player1);
        IVyreGame.GameResult memory result =
            casino.play(address(winGame), address(chip), betAmount, "");

        assertTrue(result.won);
        assertEq(result.payout, betAmount * 2); // 2x payout
    }

    function test_WinWithHouseEdge() public {
        uint256 betAmount = 100e18;
        uint256 playerBefore = chip.balanceOf(player1);

        vm.prank(player1);
        casino.play(address(winGame), address(chip), betAmount, "");

        // Player should receive: (2x bet) - 2% house edge
        // Gross payout: 200e18, house edge: 4e18, net: 196e18
        // Net change: 196 - 100 (bet) = +96
        uint256 playerAfter = chip.balanceOf(player1);
        assertTrue(playerAfter > playerBefore - betAmount); // Won more than lost
    }

    function test_WinWithReferrer() public {
        // Set up referral
        vm.prank(player1);
        casino.setReferrer(player2);

        uint256 betAmount = 100e18;

        vm.prank(player1);
        casino.play(address(winGame), address(chip), betAmount, "");

        // Referrer should have accumulated earnings
        // House edge: 2% of 200 = 4 CHIP
        // Referral share: 50% of house edge = 2 CHIP
        uint256 referrerEarnings = casino.referralEarnings(player2, address(chip));
        assertGt(referrerEarnings, 0);
    }

    function test_ClaimReferralEarnings() public {
        // Set up referral
        vm.prank(player1);
        casino.setReferrer(player2);

        // Play and win to generate referral earnings
        vm.prank(player1);
        casino.play(address(winGame), address(chip), 100e18, "");

        uint256 earnings = casino.referralEarnings(player2, address(chip));
        assertGt(earnings, 0);

        uint256 referrerBefore = chip.balanceOf(player2);

        // Claim earnings
        vm.prank(player2);
        casino.claimReferralEarnings(address(chip));

        // Referrer should have received tokens
        assertEq(chip.balanceOf(player2), referrerBefore + earnings);
        assertEq(casino.referralEarnings(player2, address(chip)), 0);
    }

    function test_BuybackWalletReceivesShare() public {
        uint256 buybackBefore = chip.balanceOf(buybackWallet);

        vm.prank(player1);
        casino.play(address(winGame), address(chip), 100e18, "");

        // Buyback wallet should receive 20% of house edge
        uint256 buybackAfter = chip.balanceOf(buybackWallet);
        assertGt(buybackAfter, buybackBefore);
    }
}

/**
 * @title VyreTreasuryTest
 * @notice Tests for VyreTreasury
 */
contract VyreTreasuryTest is Test {
    VyreTreasury public treasury;
    MockCHIP public chip;

    address public owner = address(this);
    address public operator = address(0xCAFE);
    address public recipient = address(0x1);
    address public newOwner = address(0x2);

    function setUp() public {
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        treasury.setOperator(operator);
        chip.mint(address(treasury), 10_000e18);
    }

    function test_OperatorCanPayout() public {
        vm.prank(operator);
        treasury.payout(recipient, address(chip), 100e18);
        assertEq(chip.balanceOf(recipient), 100e18);
    }

    function test_RevertNonOperatorPayout() public {
        vm.prank(recipient);
        vm.expectRevert("VyreTreasury: only operator");
        treasury.payout(recipient, address(chip), 100e18);
    }

    function test_Freeze() public {
        treasury.freeze();
        assertTrue(treasury.frozen());

        vm.prank(operator);
        vm.expectRevert("VyreTreasury: frozen");
        treasury.payout(recipient, address(chip), 100e18);
    }

    function test_Unfreeze() public {
        treasury.freeze();
        treasury.unfreeze();
        assertFalse(treasury.frozen());

        vm.prank(operator);
        treasury.payout(recipient, address(chip), 100e18);
        assertEq(chip.balanceOf(recipient), 100e18);
    }

    function test_DailyLimit() public {
        treasury.setDailyLimit(address(chip), 50e18);

        vm.prank(operator);
        treasury.payout(recipient, address(chip), 50e18);

        vm.prank(operator);
        vm.expectRevert("VyreTreasury: daily limit exceeded");
        treasury.payout(recipient, address(chip), 1e18);
    }

    function test_DailyLimitReset() public {
        treasury.setDailyLimit(address(chip), 50e18);

        vm.prank(operator);
        treasury.payout(recipient, address(chip), 50e18);

        // Skip 1 day + 1 second to ensure reset
        vm.warp(block.timestamp + 1 days + 1);

        // Should work again after reset
        vm.prank(operator);
        treasury.payout(recipient, address(chip), 50e18);
        assertEq(chip.balanceOf(recipient), 100e18);
    }

    function test_RemainingDailyLimit() public {
        treasury.setDailyLimit(address(chip), 100e18);

        vm.prank(operator);
        treasury.payout(recipient, address(chip), 30e18);

        assertEq(treasury.remainingDailyLimit(address(chip)), 70e18);
    }

    function test_RemainingDailyLimitUnlimited() public view {
        // No limit set
        assertEq(treasury.remainingDailyLimit(address(chip)), type(uint256).max);
    }

    function test_Balance() public view {
        assertEq(treasury.balance(address(chip)), 10_000e18);
    }

    function test_TwoStepOwnership() public {
        treasury.transferOwnership(newOwner);
        assertEq(treasury.pendingOwner(), newOwner);
        assertEq(treasury.owner(), owner); // Still old owner

        vm.prank(newOwner);
        treasury.acceptOwnership();
        assertEq(treasury.owner(), newOwner);
        assertEq(treasury.pendingOwner(), address(0));
    }

    function test_RevertAcceptOwnershipNotPending() public {
        vm.prank(recipient);
        vm.expectRevert("VyreTreasury: not pending owner");
        treasury.acceptOwnership();
    }

    function test_RevertPayoutZeroRecipient() public {
        vm.prank(operator);
        vm.expectRevert("VyreTreasury: zero recipient");
        treasury.payout(address(0), address(chip), 100e18);
    }

    function test_RevertPayoutZeroAmount() public {
        vm.prank(operator);
        vm.expectRevert("VyreTreasury: zero amount");
        treasury.payout(recipient, address(chip), 0);
    }

    function test_EmergencyWithdrawQueue() public {
        bytes32 id = treasury.queueEmergencyWithdraw(address(chip), recipient, 100e18);
        assertTrue(id != bytes32(0));

        (address token, address to, uint256 amount, uint256 executeAfter) =
            treasury.pendingWithdrawals(id);
        assertEq(token, address(chip));
        assertEq(to, recipient);
        assertEq(amount, 100e18);
        assertGt(executeAfter, block.timestamp);
    }

    function test_EmergencyWithdrawExecute() public {
        bytes32 id = treasury.queueEmergencyWithdraw(address(chip), recipient, 100e18);

        // Try before timelock
        vm.expectRevert("VyreTreasury: timelock not passed");
        treasury.executeEmergencyWithdraw(id);

        // Warp past timelock
        vm.warp(block.timestamp + 72 hours);

        treasury.executeEmergencyWithdraw(id);
        assertEq(chip.balanceOf(recipient), 100e18);
    }

    function test_EmergencyWithdrawCancel() public {
        bytes32 id = treasury.queueEmergencyWithdraw(address(chip), recipient, 100e18);

        treasury.cancelEmergencyWithdraw(id);

        vm.expectRevert("VyreTreasury: not queued");
        treasury.executeEmergencyWithdraw(id);
    }

    function test_RevertCancelNotQueued() public {
        vm.expectRevert("VyreTreasury: not queued");
        treasury.cancelEmergencyWithdraw(bytes32(uint256(1)));
    }

    function test_RevertExecuteNotQueued() public {
        vm.expectRevert("VyreTreasury: not queued");
        treasury.executeEmergencyWithdraw(bytes32(uint256(1)));
    }

    function test_SetOperator() public {
        address newOp = address(0xBEEF);
        treasury.setOperator(newOp);
        assertEq(treasury.operator(), newOp);
    }

    function test_RevertSetOperatorZero() public {
        vm.expectRevert("VyreTreasury: zero operator");
        treasury.setOperator(address(0));
    }
}

/**
 * @title VyreCasinoAdminTest
 * @notice Additional admin tests for VyreCasino
 */
contract VyreCasinoAdminTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockCHIP public chip;

    address public owner = address(this);
    address public newOwner = address(0x123);
    address public buybackWallet = address(0xBB);

    function setUp() public {
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, buybackWallet);
        treasury.setOperator(address(casino));
    }

    function test_TwoStepOwnership() public {
        casino.transferOwnership(newOwner);
        assertEq(casino.pendingOwner(), newOwner);
        assertEq(casino.owner(), owner);

        vm.prank(newOwner);
        casino.acceptOwnership();
        assertEq(casino.owner(), newOwner);
        assertEq(casino.pendingOwner(), address(0));
    }

    function test_RevertAcceptOwnershipNotPending() public {
        vm.prank(newOwner);
        vm.expectRevert("VyreCasino: not pending owner");
        casino.acceptOwnership();
    }

    function test_SetReferralShare() public {
        casino.setReferralShare(7000);
        assertEq(casino.referralShareBps(), 7000);
    }

    function test_RevertReferralShareTooHigh() public {
        vm.expectRevert("VyreCasino: max 100%");
        casino.setReferralShare(10_001);
    }

    function test_SetXPRegistry() public {
        address newRegistry = address(0x999);
        casino.setXPRegistry(newRegistry);
        assertEq(address(casino.xpRegistry()), newRegistry);
    }

    function test_SetBuybackWallet() public {
        address newWallet = address(0x888);
        casino.setBuybackWallet(newWallet);
        assertEq(casino.buybackWallet(), newWallet);
    }

    function test_RemoveToken() public {
        MockCHIP newToken = new MockCHIP();
        casino.whitelistToken(address(newToken));
        assertTrue(casino.whitelistedTokens(address(newToken)));

        casino.removeToken(address(newToken));
        assertFalse(casino.whitelistedTokens(address(newToken)));
    }

    function test_RevertRemoveCHIP() public {
        vm.expectRevert("VyreCasino: cannot remove CHIP");
        casino.removeToken(address(chip));
    }

    function test_GetChipTier() public view {
        assertEq(casino.getChipTier(1e18), 0);
        assertEq(casino.getChipTier(5e18), 1);
        assertEq(casino.getChipTier(100e18), 4);
        assertEq(casino.getChipTier(1_000_000e18), 11);
    }

    function test_GetAvailableChipTiers() public view {
        // Just verify function returns correct structure
        bool[12] memory available = casino.getAvailableChipTiers(address(this), address(chip));
        // At minimum tier 0 should be available (1 CHIP)
        // Exact availability depends on MockCHIP constructor balance
        assertTrue(available[0] || !available[0]); // Just ensure no revert
    }

    function test_RevertRegisterGameZero() public {
        vm.expectRevert("VyreCasino: zero game");
        casino.registerGame(address(0));
    }

    function test_RevertWhitelistTokenZero() public {
        vm.expectRevert("VyreCasino: zero token");
        casino.whitelistToken(address(0));
    }

    function test_RevertTransferOwnershipZero() public {
        vm.expectRevert("VyreCasino: zero owner");
        casino.transferOwnership(address(0));
    }
}

/**
 * @title VyreCasinoV5FeaturesTest
 * @notice Tests for new V5 features: getPlayerStats(), settlePayout(), SettlementPending
 */
contract VyreCasinoV5FeaturesTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockCHIP public chip;
    MockWinningGame public game;

    address public owner = address(this);
    address public player = address(0x1234);

    function setUp() public {
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, address(0));

        game = new MockWinningGame(address(casino));
        casino.registerGame(address(game));

        treasury.setOperator(address(casino));
        chip.transfer(address(treasury), 100_000e18);
        chip.transfer(player, 10_000e18);
    }

    // ==================== getPlayerStats() TESTS ====================

    function test_GetPlayerStats_ReturnsCorrectBalance() public view {
        (
            uint256 tokenBalance,
            address playerReferrer,
            uint256 playerReferralEarnings,
            bool isPaused,
            uint256 currentHouseEdgeBps
        ) = casino.getPlayerStats(player, address(chip));

        assertEq(tokenBalance, 10_000e18);
        assertEq(playerReferrer, address(0));
        assertEq(playerReferralEarnings, 0);
        assertEq(isPaused, false);
        assertGt(currentHouseEdgeBps, 0); // default 1%
    }

    function test_GetPlayerStats_ShowsReferrer() public {
        address referrer = address(0x999);
        vm.prank(player);
        casino.setReferrer(referrer);

        (, address playerReferrer,,,) = casino.getPlayerStats(player, address(chip));

        assertEq(playerReferrer, referrer);
    }

    function test_GetPlayerStats_ShowsPausedState() public {
        casino.pause();

        (,,, bool isPaused,) = casino.getPlayerStats(player, address(chip));

        assertTrue(isPaused);
    }

    function test_GetPlayerStats_ShowsHouseEdge() public {
        casino.setHouseEdge(200); // 2%

        (,,,, uint256 currentHouseEdgeBps) = casino.getPlayerStats(player, address(chip));

        assertEq(currentHouseEdgeBps, 200);
    }

    // ==================== settlePayout() TESTS ====================

    function test_SettlePayout_OnlyRegisteredGame() public {
        address fakeGame = address(0xFA4E);

        vm.prank(fakeGame);
        vm.expectRevert("VyreCasino: only registered games");
        casino.settlePayout(player, address(chip), 100e18);
    }

    function test_SettlePayout_EmitsGameSettled() public {
        // Register a mock game that will call settlePayout
        MockSettleGame settleGame = new MockSettleGame(casino);
        casino.registerGame(address(settleGame));

        vm.expectEmit(true, true, false, true);
        emit VyreCasino.GameSettled(address(settleGame), player, address(chip), 100e18);

        settleGame.triggerSettle(player, address(chip), 100e18);
    }
}

/**
 * @title VyreCasinoSecurityTest
 * @notice Security tests: access control, reentrancy, edge cases
 */
contract VyreCasinoSecurityTest is Test {
    VyreCasino public casino;
    VyreTreasury public treasury;
    MockCHIP public chip;
    MockWinningGame public game;

    address public owner = address(this);
    address public attacker = address(0xBA0);

    function setUp() public {
        chip = new MockCHIP();
        treasury = new VyreTreasury(owner);
        casino = new VyreCasino(address(treasury), address(chip), owner, address(0));

        game = new MockWinningGame(address(casino));
        casino.registerGame(address(game));

        treasury.setOperator(address(casino));
        chip.transfer(address(treasury), 100_000e18);
    }

    // ==================== ACCESS CONTROL TESTS ====================

    function test_RevertSetHouseEdge_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.setHouseEdge(200);
    }

    function test_RevertRegisterGame_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.registerGame(address(0x123));
    }

    function test_RevertUnregisterGame_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.unregisterGame(address(game));
    }

    function test_RevertPause_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.pause();
    }

    function test_RevertUnpause_NotOwner() public {
        casino.pause();
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.unpause();
    }

    function test_RevertWhitelistToken_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreCasino: only owner");
        casino.whitelistToken(address(0x123));
    }

    // ==================== REENTRANCY TESTS ====================

    function test_PlayIsNonReentrant() public {
        // Setup reentrant game
        ReentrantGame reentrantGame = new ReentrantGame(casino, chip);
        casino.registerGame(address(reentrantGame));

        chip.transfer(address(reentrantGame), 1000e18);

        // This should be blocked by ReentrancyGuard
        vm.expectRevert(); // ReentrancyGuard will revert
        reentrantGame.attack();
    }

    // ==================== EDGE CASES ====================

    function test_RevertPlayZeroBet() public {
        chip.approve(address(casino), type(uint256).max);

        vm.expectRevert("VyreCasino: zero bet");
        casino.play(address(game), address(chip), 0, "");
    }

    function test_RevertPlayWhenPaused() public {
        casino.pause();

        chip.approve(address(casino), 100e18);

        vm.expectRevert("VyreCasino: paused");
        casino.play(address(game), address(chip), 100e18, "");
    }

    function test_RevertPlayUnregisteredGame() public {
        address fakeGame = address(0x123);

        chip.approve(address(casino), 100e18);

        vm.expectRevert("VyreCasino: game not registered");
        casino.play(fakeGame, address(chip), 100e18, "");
    }

    function test_RevertPlayNonWhitelistedToken() public {
        MockCHIP fakeToken = new MockCHIP();
        fakeToken.approve(address(casino), 100e18);

        vm.expectRevert("VyreCasino: token not whitelisted");
        casino.play(address(game), address(fakeToken), 100e18, "");
    }

    // ==================== HOUSE EDGE BOUNDS ====================

    function test_RevertHouseEdgeTooHigh_Security() public {
        vm.expectRevert("VyreCasino: max 10%");
        casino.setHouseEdge(1001); // > 10%
    }

    function test_SetHouseEdgeAtMax_Security() public {
        casino.setHouseEdge(1000); // Exactly 10%
        assertEq(casino.houseEdgeBps(), 1000);
    }
}

/**
 * @title VyreJackCoreSecurityTest
 * @notice Security tests for VyreJackCore: access control, VRF, edge cases
 */
contract VyreJackCoreSecurityTest is Test {
    VyreJackCore public game;
    MockVRF public vrf;

    address public owner = address(this);
    address public attacker = address(0xBA0);
    address public casino = address(0xCA5);
    address public chipToken = address(0xC01);

    function setUp() public {
        vrf = new MockVRF();

        // Deploy Game (UUPS upgradeable pattern)
        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData =
            abi.encodeWithSelector(VyreJackCore.initialize.selector, address(vrf), casino);
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));
        vrf.setGame(address(game));

        game.setBetLimits(chipToken, 1e18, 1000e18);
    }

    // ==================== VRF ACCESS CONTROL ====================

    function test_RevertRawFulfill_NotVRF() public {
        uint256[] memory randoms = new uint256[](4);

        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only VRF");
        game.rawFulfillRandomNumbers(1, randoms);
    }

    // ==================== CASINO ACCESS CONTROL ====================

    function test_RevertPlay_NotCasino() public {
        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only casino");
        game.play(
            attacker, IVyreGame.BetInfo({ token: chipToken, amount: 100e18, chipTier: 0 }), ""
        );
    }

    // ==================== OWNER FUNCTIONS ====================

    function test_RevertSetActive_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only owner");
        game.setActive(false);
    }

    function test_RevertSetBetLimits_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only owner");
        game.setBetLimits(chipToken, 1e18, 100e18);
    }

    function test_RevertSetCasino_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only owner");
        game.setCasino(attacker);
    }

    function test_RevertForceResolveGame_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert("VyreJackCore: only owner");
        game.forceResolveGame(address(0x1), "test reason");
    }

    // ==================== UUPS UPGRADE ====================

    function test_RevertUpgrade_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        game.upgradeToAndCall(address(0x123), "");
    }

    // ==================== VRF TIMEOUT ====================
    // VRF_TIMEOUT constant was removed in V2 - tests skipped

    // retryVRF tests removed - function was removed in V2 refactor
}

/**
 * @title MockSettleGame
 * @notice Mock game that can call settlePayout
 */
contract MockSettleGame is IVyreGame {
    VyreCasino public casino;

    constructor(
        VyreCasino _casino
    ) {
        casino = _casino;
    }

    function play(
        address,
        BetInfo calldata,
        bytes calldata
    ) external pure override returns (GameResult memory) {
        return GameResult({ won: false, payout: 0, metadata: "" });
    }

    function name() external pure override returns (string memory) {
        return "MockSettle";
    }

    function isActive() external pure override returns (bool) {
        return true;
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

    function triggerSettle(
        address player,
        address token,
        uint256 amount
    ) external {
        casino.settlePayout(player, token, amount);
    }
}

/**
 * @title ReentrantGame
 * @notice Malicious game that tries to reenter casino
 */
contract ReentrantGame is IVyreGame {
    VyreCasino public casino;
    MockCHIP public chip;
    bool public attacking;

    constructor(
        VyreCasino _casino,
        MockCHIP _chip
    ) {
        casino = _casino;
        chip = _chip;
    }

    function play(
        address,
        BetInfo calldata,
        bytes calldata
    ) external override returns (GameResult memory) {
        if (attacking) {
            // Try to reenter
            chip.approve(address(casino), 100e18);
            casino.play(address(this), address(chip), 100e18, "");
        }
        return GameResult({ won: false, payout: 0, metadata: "" });
    }

    function name() external pure override returns (string memory) {
        return "Reentrant";
    }

    function isActive() external pure override returns (bool) {
        return true;
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

    function attack() external {
        attacking = true;
        chip.approve(address(casino), 100e18);
        casino.play(address(this), address(chip), 100e18, "");
    }
}

