// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VyreStaking } from "../../src/tokens/defi/VyreStaking.sol";
import { MockToken } from "../../src/mocks/MockToken.sol";

/**
 * @title VyreStakingSameTokenTest
 * @notice TDD for the same-token staking hazard (audit L6). When the reward token and
 *         the staking token are identical, `rewardsToken.balanceOf(this)` includes the
 *         stakers' principal — so the owner could notify rewards "backed" by user stake
 *         and getReward could pay principal out as rewards. The fix excludes the staked
 *         principal from the available-reward balance.
 */
contract VyreStakingSameTokenTest is Test {
    VyreStaking public staking;
    MockToken public token; // same token used for BOTH stake and rewards

    address public owner = address(this);
    address public user = address(0x1);

    function setUp() public {
        token = new MockToken("CHIP", "CHIP");
        staking = new VyreStaking(owner, address(token), address(token));
        token.transfer(user, 1000e18);
    }

    function _stakePrincipal() internal {
        vm.startPrank(user);
        token.approve(address(staking), 1000e18);
        staking.stake(1000e18);
        vm.stopPrank();
    }

    function test_notifyReward_sameToken_cannotBackRewardsWithStake() public {
        _stakePrincipal();

        // No genuine reward surplus was deposited; the staked principal must not count
        // as available rewards, so this notification must revert.
        vm.expectRevert("Provided reward too high");
        staking.notifyRewardAmount(1000e18);
    }

    function test_notifyReward_sameToken_worksWithRealSurplus() public {
        _stakePrincipal();

        // A genuine reward surplus is deposited on top of the staked principal.
        token.transfer(address(staking), 500e18);
        staking.notifyRewardAmount(500e18);
        assertGt(staking.rewardRate(), 0, "rewards backed by real surplus are accepted");
    }
}
