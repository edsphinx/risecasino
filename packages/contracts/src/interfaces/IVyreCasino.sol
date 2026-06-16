// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IVYRECASINO — CENTRAL CASINO ORCHESTRATOR INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for VyreCasino central orchestrator used by game contracts.
 *
 * - Game Callbacks: Games call settlePayout() for async game resolution
 * - Game Registry: Verify registered game and token status
 * - Configuration: Access house edge and treasury settings
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IVyreCasino {
    /// @notice Settle payout for async games
    /// @param player Player to receive payout
    /// @param token Token to pay
    /// @param amount Gross payout amount (before house edge)
    function settlePayout(
        address player,
        address token,
        uint256 amount
    ) external;

    /// @notice Refund a stuck game's bet in full (no house edge applied)
    /// @param player Player to refund
    /// @param token Token to refund
    /// @param amount Original bet amount
    function refundBet(
        address player,
        address token,
        uint256 amount
    ) external;

    /// @notice Pull an additional stake from a player mid-game (e.g. double-down)
    /// @param player Player to pull from (uses their approval to the casino)
    /// @param token Token to collect
    /// @param amount Additional stake amount
    function collectBet(
        address player,
        address token,
        uint256 amount
    ) external;

    /// @notice Check if a game is registered
    /// @param game Game contract address
    /// @return registered True if registered
    function registeredGames(
        address game
    ) external view returns (bool);

    /// @notice Check if a token is whitelisted
    /// @param token Token address
    /// @return whitelisted True if whitelisted
    function whitelistedTokens(
        address token
    ) external view returns (bool);

    /// @notice Get current house edge in basis points
    /// @return bps House edge (e.g., 200 = 2%)
    function houseEdgeBps() external view returns (uint256);

    /// @notice Get treasury address
    /// @return treasury Treasury contract address
    function treasury() external view returns (address);
}
