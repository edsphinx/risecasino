// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IVRFCOORDINATOR — RISE CHAIN VRF COORDINATOR INTERFACE V4
 * -------------------------------------------------------------------------
 * Interface for Rise Chain VRF Coordinator.
 *
 * - Request: Request random numbers with seed
 * - Callback: VRF Coordinator calls consumer.rawFulfillRandomNumbers
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

interface IVRFCoordinator {
    /// @notice Request random numbers from VRF
    /// @param numNumbers How many random numbers you need
    /// @param seed Seed for randomness generation
    /// @return requestId Unique identifier for the request
    function requestRandomNumbers(
        uint32 numNumbers,
        uint256 seed
    ) external returns (uint256 requestId);
}
