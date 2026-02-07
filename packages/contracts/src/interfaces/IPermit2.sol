// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IPERMIT2 — UNISWAP PERMIT2 INTERFACE V4
 * -------------------------------------------------------------------------
 * Interface for Uniswap's Permit2 contract for gasless token approvals.
 *
 * - Gasless Approvals: Users sign permits off-chain
 * - Single Transaction: Approve + transfer in one call
 * - Pre-deployed: Rise Testnet 0x000000000022D473030F116dDEE9F6B43aC78BA3
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

interface IPermit2 {
    /// @notice Token and amount in a permit message
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    /// @notice The permit data for a single token
    struct PermitSingle {
        TokenPermissions details;
        address spender;
        uint256 sigDeadline;
    }

    /// @notice A mapping from token to spender to allowance
    struct PackedAllowance {
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }

    /// @notice Details for a transfer
    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    /// @notice The permit message signed by the owner
    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    /// @notice Transfer tokens using a signed permit
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;

    /// @notice Get the allowance for a token/spender pair
    function allowance(
        address owner,
        address token,
        address spender
    ) external view returns (uint160, uint48, uint48);
}
