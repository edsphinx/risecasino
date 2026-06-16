// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { MemeTokenSink } from "../src/vaults/MemeTokenSink.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock Meme Token
contract MockMeme is ERC20 {
    constructor() ERC20("MockMeme", "MEME") {
        _mint(msg.sender, 1_000_000e18);
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Mock fee-on-transfer token: charges 1% on every transfer.
contract MockFeeMeme is ERC20 {
    constructor() ERC20("FeeMeme", "FMEME") { }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0) && value > 0) {
            uint256 fee = value / 100; // 1%
            super._update(from, to, value - fee);
            super._update(from, address(0xdEaD), fee);
            return;
        }
        super._update(from, to, value);
    }
}

/**
 * @title MemeTokenSink Test Suite
 * @notice Tests for MEME token loss distribution (50% burn, 25% creator, 25% casino)
 */
contract MemeTokenSinkTest is Test {
    MemeTokenSink sink;
    MockMeme meme;

    address owner = address(this);
    address treasury = address(0x8888);
    address game = address(0x1);
    address creator = address(0x2);

    function setUp() public {
        treasury = address(0x8888);

        sink = new MemeTokenSink(treasury, owner);
        meme = new MockMeme();

        sink.authorizeGame(game);

        // Give tokens to game for testing
        meme.mint(game, 100_000e18);

        vm.label(address(sink), "MemeTokenSink");
        vm.label(treasury, "Treasury");
        vm.label(game, "Game");
        vm.label(creator, "Creator");
    }

    // ==================== DEPLOYMENT ====================

    function test_Deployment() public view {
        assertEq(sink.treasury(), treasury);
        assertEq(sink.owner(), owner);
        assertEq(sink.burnShareBps(), 5000);
        assertEq(sink.creatorShareBps(), 2500);
        assertEq(sink.casinoShareBps(), 2500);
    }

    function test_ConstructorZeroTreasury() public {
        vm.expectRevert("MemeTokenSink: zero treasury");
        new MemeTokenSink(address(0), owner);
    }

    function test_ConstructorZeroOwner() public {
        vm.expectRevert("MemeTokenSink: zero owner");
        new MemeTokenSink(treasury, address(0));
    }

    // ==================== PROCESS LOSS ====================

    function test_ProcessLoss() public {
        // Register creator
        vm.prank(game);
        sink.registerTokenCreator(address(meme), creator);

        // Process loss
        vm.startPrank(game);
        meme.approve(address(sink), 1000e18);
        sink.processLoss(address(meme), 1000e18);
        vm.stopPrank();

        // 50% burned, 25% creator, 25% treasury
        assertEq(meme.balanceOf(sink.BURN_ADDRESS()), 500e18);
        assertEq(meme.balanceOf(creator), 250e18);
        assertEq(meme.balanceOf(treasury), 250e18);
    }

    function test_processLoss_feeOnTransfer_splitsActualReceived() public {
        MockFeeMeme fee = new MockFeeMeme();
        fee.mint(game, 100_000e18);

        // The game sends 1000 but, with a 1% transfer fee, the sink only receives 990.
        // Splits must be computed on what was actually received so the contract doesn't
        // try to distribute more than it holds (audit M6).
        vm.startPrank(game);
        fee.approve(address(sink), 1000e18);
        sink.processLoss(address(fee), 1000e18);
        vm.stopPrank();

        // All received tokens were distributed; the sink retains nothing.
        assertEq(fee.balanceOf(address(sink)), 0, "sink must not retain or over-distribute");
    }

    function test_ProcessLossNoCreator() public {
        // No creator registered - creator share goes to treasury
        vm.startPrank(game);
        meme.approve(address(sink), 1000e18);
        sink.processLoss(address(meme), 1000e18);
        vm.stopPrank();

        // 50% burned, 50% treasury (creator share + casino share)
        assertEq(meme.balanceOf(sink.BURN_ADDRESS()), 500e18);
        assertEq(meme.balanceOf(treasury), 500e18);
    }

    function test_ProcessLossZeroToken() public {
        vm.prank(game);
        vm.expectRevert("MemeTokenSink: zero token");
        sink.processLoss(address(0), 1000e18);
    }

    function test_ProcessLossZeroAmount() public {
        vm.prank(game);
        vm.expectRevert("MemeTokenSink: zero amount");
        sink.processLoss(address(meme), 0);
    }

    function test_ProcessLossNotAuthorized() public {
        vm.prank(creator);
        vm.expectRevert("MemeTokenSink: not authorized");
        sink.processLoss(address(meme), 1000e18);
    }

    // ==================== REGISTER CREATOR ====================

    function test_RegisterTokenCreator() public {
        vm.prank(game);
        sink.registerTokenCreator(address(meme), creator);

        assertEq(sink.getCreator(address(meme)), creator);
    }

    function test_RegisterTokenCreatorZeroToken() public {
        vm.prank(game);
        vm.expectRevert("MemeTokenSink: zero token");
        sink.registerTokenCreator(address(0), creator);
    }

    function test_RegisterTokenCreatorZeroCreator() public {
        vm.prank(game);
        vm.expectRevert("MemeTokenSink: zero creator");
        sink.registerTokenCreator(address(meme), address(0));
    }

    // ==================== VIEW ====================

    function test_GetSplitAmounts() public view {
        (uint256 burn, uint256 creatorShare, uint256 casino) = sink.getSplitAmounts(1000e18);
        assertEq(burn, 500e18);
        assertEq(creatorShare, 250e18);
        assertEq(casino, 250e18);
    }

    // ==================== ADMIN ====================

    function test_AuthorizeGame() public {
        address newGame = address(0x999);
        sink.authorizeGame(newGame);
        assertTrue(sink.authorizedGames(newGame));
    }

    function test_AuthorizeGameZeroAddress() public {
        vm.expectRevert("MemeTokenSink: zero game");
        sink.authorizeGame(address(0));
    }

    function test_AuthorizeGameOnlyOwner() public {
        vm.prank(game);
        vm.expectRevert("MemeTokenSink: only owner");
        sink.authorizeGame(address(0x999));
    }

    function test_RevokeGame() public {
        sink.revokeGame(game);
        assertFalse(sink.authorizedGames(game));
    }

    function test_SetShares() public {
        sink.setShares(4000, 3000, 3000);
        assertEq(sink.burnShareBps(), 4000);
        assertEq(sink.creatorShareBps(), 3000);
        assertEq(sink.casinoShareBps(), 3000);
    }

    function test_SetSharesMustTotal100() public {
        vm.expectRevert("MemeTokenSink: must total 100%");
        sink.setShares(4000, 3000, 2000); // Only 90%
    }

    function test_SetTreasury() public {
        address newTreasury = address(0x7777);
        sink.setTreasury(newTreasury);
        assertEq(sink.treasury(), newTreasury);
    }

    function test_SetTreasuryZeroAddress() public {
        vm.expectRevert("MemeTokenSink: zero treasury");
        sink.setTreasury(address(0));
    }

    function test_TransferOwnership() public {
        sink.transferOwnership(creator);
        assertEq(sink.owner(), creator);
    }

    function test_TransferOwnershipZeroAddress() public {
        vm.expectRevert("MemeTokenSink: zero owner");
        sink.transferOwnership(address(0));
    }
}
