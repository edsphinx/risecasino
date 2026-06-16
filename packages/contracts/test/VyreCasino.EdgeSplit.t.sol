// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VyreCasino } from "../src/core/VyreCasino.sol";

/**
 * @title VyreCasinoEdgeSplitTest
 * @notice TDD for the atomic edge-split setter (bounded config layer, knob group 2).
 *         Fixes audit M5: the three house-edge shares could be set independently
 *         and sum to != 100%, letting the treasury pay out more edge than collected.
 */
contract VyreCasinoEdgeSplitTest is Test {
    VyreCasino public casino;

    address public owner = address(this);
    address public notOwner = address(0xBAD);
    address public buyback = address(0xBB);

    event EdgeSplitUpdated(uint256 referralBps, uint256 treasuryBps, uint256 buybackBps);

    function setUp() public {
        // setEdgeSplit touches neither treasury nor chip, so dummy non-zero
        // addresses satisfy the constructor's zero-checks.
        casino = new VyreCasino(address(0x7), address(0xC417), owner, buyback);
    }

    function test_setEdgeSplit_updatesAllThreeShares() public {
        casino.setEdgeSplit(4000, 4000, 2000);
        assertEq(casino.referralShareBps(), 4000, "referral");
        assertEq(casino.treasuryShareBps(), 4000, "treasury");
        assertEq(casino.buybackShareBps(), 2000, "buyback");
    }

    function test_setEdgeSplit_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit EdgeSplitUpdated(6000, 2500, 1500);
        casino.setEdgeSplit(6000, 2500, 1500);
    }

    function test_setEdgeSplit_revertsWhenSumNotOneHundredPercent() public {
        vm.expectRevert("VyreCasino: split must total 100%");
        casino.setEdgeSplit(5000, 3000, 3000); // sums to 11000
    }

    function test_setEdgeSplit_revertsForNonOwner() public {
        vm.prank(notOwner);
        vm.expectRevert();
        casino.setEdgeSplit(5000, 3000, 2000);
    }
}
