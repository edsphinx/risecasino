// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * ILPVESTING — LP TOKEN VESTING INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for LP token vesting contract used in token launches.
 *
 * - Lock: Lock LP tokens with beneficiary
 * - Claim: Claim vested LP tokens after cliff
 * - Vesting: 6 month cliff + 6 month linear vesting
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface ILPVesting {
    /// @notice Lock LP tokens for a beneficiary
    /// @param pair LP pair address
    /// @param amount LP tokens to lock
    /// @param beneficiary Address to receive vested tokens
    function lockLP(
        address pair,
        uint256 amount,
        address beneficiary
    ) external;

    /// @notice Get claimable amount for a beneficiary
    /// @param beneficiary Beneficiary address
    /// @param pair LP pair address
    /// @return amount Claimable LP tokens
    function claimable(
        address beneficiary,
        address pair
    ) external view returns (uint256);

    /// @notice Claim vested LP tokens
    /// @param pair LP pair address
    function claim(
        address pair
    ) external;
}
