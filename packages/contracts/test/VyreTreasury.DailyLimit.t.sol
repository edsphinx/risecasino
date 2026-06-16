// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VyreTreasury } from "../src/core/VyreTreasury.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") { }

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
 * @title VyreTreasuryDailyLimitTest
 * @notice TDD for the per-token daily-limit reset (audit C3). The reset clock was a
 *         single global value, so once one token reset the day, every other token
 *         touched later never reset — its dailySpent accumulated forever and bricked
 *         that token's payouts.
 */
contract VyreTreasuryDailyLimitTest is Test {
    VyreTreasury public treasury;
    MockToken public tA;
    MockToken public tB;

    address public owner = address(this);
    address public player = address(0x1);

    function setUp() public {
        vm.warp(1_700_000_000);
        treasury = new VyreTreasury(owner);
        treasury.setOperator(address(this)); // this test acts as the operator
        tA = new MockToken();
        tB = new MockToken();
        tA.mint(address(treasury), 1_000_000e6);
        tB.mint(address(treasury), 1_000_000e6);
        treasury.setDailyLimit(address(tA), 1000e6);
        treasury.setDailyLimit(address(tB), 1000e6);
    }

    function test_dailyLimitResetsIndependentlyPerToken() public {
        // Day 1: spend tB up to its limit.
        treasury.payout(player, address(tB), 1000e6);

        // A full day passes.
        vm.warp(block.timestamp + 1 days + 1);

        // tA is touched first on the new day. With a single global clock this moves the
        // reset time and starves tB; per-token reset must keep tB independent.
        treasury.payout(player, address(tA), 1e6);

        // tB must have a fresh limit on the new day, so a full payout must succeed.
        treasury.payout(player, address(tB), 1000e6);
        assertEq(
            treasury.dailySpent(address(tB)), 1000e6, "tB reset and spent fresh on the new day"
        );
    }
}
