// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * IUNISWAPV2PAIR — UNISWAP V2 PAIR INTERFACE V8
 * -------------------------------------------------------------------------
 * Interface for Uniswap V2 Pair used for price oracles and trading.
 *
 * - Reserves: Get current liquidity reserves
 * - Tokens: Get token0/token1 addresses
 * - TWAP: Access price cumulative values for time-weighted averages
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 8.0.0
 * ------------------------------------------------------------------------*/

interface IUniswapV2Pair {
    /// @notice Get current reserves
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    /// @notice Get token0 address
    function token0() external view returns (address);

    /// @notice Get token1 address
    function token1() external view returns (address);

    /// @notice Get total LP token supply
    function totalSupply() external view returns (uint256);

    /// @notice Get LP token balance
    function balanceOf(
        address owner
    ) external view returns (uint256);

    /// @notice Approve LP tokens
    function approve(
        address spender,
        uint256 value
    ) external returns (bool);

    /// @notice Transfer LP tokens
    function transfer(
        address to,
        uint256 value
    ) external returns (bool);

    /// @notice Get price0 cumulative for TWAP
    function price0CumulativeLast() external view returns (uint256);

    /// @notice Get price1 cumulative for TWAP
    function price1CumulativeLast() external view returns (uint256);
}
