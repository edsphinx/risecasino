// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IVYREGAME — STANDARD INTERFACE FOR ALL CASINO GAMES V4
 * -------------------------------------------------------------------------
 * All games registered with VyreCasino must implement this interface.
 *
 * - play(): Called by VyreCasino to execute game logic
 * - BetInfo: Standardized bet structure with token, amount, and visual tier
 * - GameResult: Standardized result with win status and payout amount
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

interface IVyreGame {
    // ==================== STRUCTS ====================

    /// @notice Bet information
    struct BetInfo {
        address token; // ERC20 token (CHIP or approved)
        uint256 amount; // Bet amount in token units
        uint8 chipTier; // Visual chip tier (0=1, 1=5, 2=10, etc.)
    }

    /// @notice Game result returned to casino
    struct GameResult {
        bool won; // Did player win?
        uint256 payout; // Gross payout amount (before house edge)
        bytes metadata; // Game-specific data (cards, etc.)
    }

    // ==================== FUNCTIONS ====================

    /// @notice Start a game for a player
    /// @param player The player address
    /// @param bet Bet information (token, amount, tier)
    /// @param gameData Game-specific parameters
    /// @return result The game result
    function play(
        address player,
        BetInfo calldata bet,
        bytes calldata gameData
    ) external returns (GameResult memory result);

    /// @notice Get game name
    function name() external view returns (string memory);

    /// @notice Get minimum bet for a token
    function minBet(
        address token
    ) external view returns (uint256);

    /// @notice Get maximum bet for a token
    function maxBet(
        address token
    ) external view returns (uint256);

    /// @notice Check if game is active
    function isActive() external view returns (bool);

    // ==================== EVENTS ====================

    event GamePlayed(
        address indexed player, address indexed token, uint256 bet, bool won, uint256 payout
    );
}
