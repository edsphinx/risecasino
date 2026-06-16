// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ReferralRegistry } from "../src/registries/ReferralRegistry.sol";

/**
 * @title ReferralRegistryCycleGuardTest
 * @notice TDD for the 1-level referral cycle guard (bounded config layer, knob group 3).
 *         Mitigates audit H4: the simplest sybil vector is two wallets referring each
 *         other (A->B and B->A) to farm both tiers of house-edge share back to oneself.
 */
contract ReferralRegistryCycleGuardTest is Test {
    ReferralRegistry public registry;

    address public owner = address(this);
    address public A = address(0xA);
    address public B = address(0xB);
    address public C = address(0xC);

    function setUp() public {
        // setReferrer touches neither treasury nor authorized callers.
        registry = new ReferralRegistry(owner, address(0x7));
    }

    function test_setReferrer_rejectsDirectCycle() public {
        vm.prank(B);
        registry.setReferrer(A); // B -> A

        vm.prank(A);
        vm.expectRevert("ReferralRegistry: referral cycle");
        registry.setReferrer(B); // A -> B would close the A<->B loop
    }

    function test_setReferrer_allowsNonCyclic() public {
        vm.prank(A);
        registry.setReferrer(B); // A -> B
        vm.prank(C);
        registry.setReferrer(B); // C -> B, no cycle

        assertEq(registry.referrers(A), B);
        assertEq(registry.referrers(C), B);
    }
}
