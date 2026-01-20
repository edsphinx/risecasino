// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IVRFCONSUMER — VRF CALLBACK INTERFACE V4
 * -------------------------------------------------------------------------
 * Interface that contracts must implement to receive VRF callbacks.
 *
 * - Callback: rawFulfillRandomNumbers called by VRF Coordinator
 * - Security: Only VRF Coordinator should call the callback
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

interface IVRFConsumer {
    /// @notice Callback function called by VRF Coordinator with random numbers
    /// @param requestId The request ID returned from requestRandomNumbers
    /// @param randomNumbers Array of random numbers
    function rawFulfillRandomNumbers(
        uint256 requestId,
        uint256[] memory randomNumbers
    ) external;
}
