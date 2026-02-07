// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IPRICEORACLE — RISE CHAIN PRICE ORACLE INTERFACE V4
 * -------------------------------------------------------------------------
 * Interface for Rise Chain internal price oracles.
 *
 * - Oracle Decimals: All prices returned with 8 decimals
 * - Rise Testnet Oracles:
 *   - ETH:  0x7114E2537851e727678DE5a96C8eE5d0Ca14f03D
 *   - USDC: 0x50524C5bDa18aE25C600a8b81449B9CeAeB50471
 *   - USDT: 0x9190159b1bb78482Dca6EBaDf03ab744de0c0197
 *   - BTC:  0xadDAEd879D549E5DBfaf3e35470C20D8C50fDed0
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

interface IPriceOracle {
    /// @notice Get the latest price
    /// @return price The price with 8 decimals (e.g., ETH at $3300 = 330000000000)
    function latest_answer() external view returns (int256 price);
}
