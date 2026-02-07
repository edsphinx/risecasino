// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IUNISWAPV2FACTORY — UNISWAP V2 FACTORY INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for Uniswap V2 Factory used in DeFi integrations.
 *
 * - Pair Creation: Create new token pairs
 * - Pair Lookup: Get existing pair addresses
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IUniswapV2Factory {
    /// @notice Create a new trading pair
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @return pair Created pair address
    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair);

    /// @notice Get existing pair address
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @return pair Pair address (address(0) if not exists)
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}
