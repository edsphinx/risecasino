// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IUNISWAPV2ROUTER02 — UNISWAP V2 ROUTER INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for Uniswap V2 Router used in DeFi integrations.
 *
 * - Liquidity: Add/remove liquidity to pairs
 * - Swaps: Execute token swaps
 * - Price Queries: Get amounts out for swaps
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IUniswapV2Router02 {
    /// @notice Add liquidity to a pair
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @notice Remove liquidity from a pair
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    /// @notice Swap exact tokens for tokens
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Get amounts out for a given input
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    /// @notice Get factory address
    function factory() external view returns (address);

    /// @notice Get WETH address
    function WETH() external view returns (address);
}
