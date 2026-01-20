// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IREFERRALREGISTRY — MULTI-TIER REFERRAL SYSTEM INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for multi-tier referral rewards distribution.
 *
 * - Level 1: Direct referrer gets 50% of referral share
 * - Level 2: Indirect referrer gets 10% of referral share
 * - Earnings: Claimable tokens accumulated from referee gameplay
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IReferralRegistry {
    /// @notice Record earnings from a bet for referral distribution
    /// @param player Player who placed the bet
    /// @param token Token used for betting
    /// @param houseEdgeAmount Amount of house edge taken
    /// @param betAmount Original bet amount
    function recordEarnings(
        address player,
        address token,
        uint256 houseEdgeAmount,
        uint256 betAmount
    ) external;

    /// @notice Set referrer for the caller
    /// @param referrer Referrer address
    function setReferrer(
        address referrer
    ) external;

    /// @notice Get referrer for a user
    /// @param user User address
    /// @return referrer Referrer address
    function getReferrer(
        address user
    ) external view returns (address);

    /// @notice Get claimable earnings for a referrer
    /// @param referrer Referrer address
    /// @param token Token address
    /// @return amount Claimable amount
    function getClaimableEarnings(
        address referrer,
        address token
    ) external view returns (uint256);
}
