// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IXPREGISTRY — XP LEVEL TRACKING INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for XP level tracking system used across the casino ecosystem.
 *
 * - XP Tracking: Add XP for gameplay
 * - Level System: Get player levels (0-255)
 * - House Edge Reduction: Level-based fee discounts
 * - Access Control: Level-gated features (Level 40+ vaults, Level 50+ tokens)
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IXPRegistry {
    /// @notice Add XP to a user
    /// @param user User address
    /// @param amount XP amount to add
    function addXP(
        address user,
        uint256 amount
    ) external;

    /// @notice Get user's current level
    /// @param user User address
    /// @return level Current level (0-255)
    function getLevel(
        address user
    ) external view returns (uint8);

    /// @notice Get house edge reduction based on user level
    /// @param user User address
    /// @return reduction Reduction in basis points
    function getHouseEdgeReduction(
        address user
    ) external view returns (uint256);

    /// @notice Get user's total XP
    /// @param user User address
    /// @return xp Total XP
    function getXP(
        address user
    ) external view returns (uint256);

    /// @notice Check if user is a Casino Owner (Level 50+)
    /// @param user User address
    /// @return isCasinoOwner True if Level 50+
    function isCasinoOwner(
        address user
    ) external view returns (bool);

    /// @notice Check if user can create vault (Level 40+)
    /// @param user User address
    /// @return canCreate True if Level 40+
    function canCreateVault(
        address user
    ) external view returns (bool);
}
