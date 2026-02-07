// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IVYRETREASURY — TREASURY VAULT INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for VyreTreasury vault that holds all casino funds.
 *
 * - Payout: Games request payouts for winners
 * - Balance: Check token reserves
 * - Daily Limits: Monitor withdrawal caps
 * - Freeze: Emergency halt check
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IVyreTreasury {
    /// @notice Pay out tokens to a recipient
    /// @param to Recipient address
    /// @param token ERC20 token address
    /// @param amount Amount to pay
    function payout(
        address to,
        address token,
        uint256 amount
    ) external;

    /// @notice Get token balance held in treasury
    /// @param token ERC20 token address
    /// @return balance Current balance
    function balance(
        address token
    ) external view returns (uint256);

    /// @notice Get remaining daily withdrawal limit for a token
    /// @param token ERC20 token address
    /// @return remaining Remaining limit
    function remainingDailyLimit(
        address token
    ) external view returns (uint256);

    /// @notice Check if treasury is frozen
    /// @return frozen True if frozen
    function frozen() external view returns (bool);
}
