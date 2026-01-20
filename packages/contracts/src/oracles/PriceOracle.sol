// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IUniswapV2Pair } from "../interfaces/IUniswapV2Pair.sol";

/**
 * @title PriceOracle
 * @notice TWAP oracle with 5 minute window and circuit breaker
 * @dev Used to price MEME tokens in CHIP for game betting
 *
 * FEATURES:
 * - 5 minute TWAP (Time Weighted Average Price)
 * - Circuit breaker: pauses token if >20% volatility
 * - Spot price fallback for new tokens
 */
contract PriceOracle is ReentrancyGuard {
    // ==================== STATE ====================

    /// @notice CHIP token
    address public immutable chip;

    /// @notice Owner
    address public owner;

    /// @notice TWAP window (5 minutes)
    uint256 public constant TWAP_WINDOW = 5 minutes;

    /// @notice Circuit breaker threshold (20% = 2000 bps)
    uint256 public circuitBreakerBps = 2000;

    /// @notice Minimum liquidity for price validity
    uint256 public minLiquidity = 1000e18; // 1000 CHIP

    // ==================== PRICE DATA ====================

    struct PriceObservation {
        uint256 timestamp;
        uint256 priceCumulative;
        uint256 price; // Spot price at observation
    }

    struct TokenPriceData {
        address pair;
        bool isToken0;
        PriceObservation[] observations;
        uint256 lastTWAP;
        bool isPaused; // Circuit breaker triggered
        uint256 pausedAt;
    }

    /// @notice Price data per token
    mapping(address => TokenPriceData) public priceData;

    /// @notice Registered tokens
    address[] public registeredTokens;

    // ==================== EVENTS ====================

    event TokenRegistered(address indexed token, address indexed pair);
    event PriceUpdated(address indexed token, uint256 twap, uint256 spot);
    event CircuitBreakerTriggered(address indexed token, uint256 changePercent);
    event CircuitBreakerReset(address indexed token);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CircuitBreakerThresholdUpdated(uint256 newThresholdBps);
    event MinLiquidityUpdated(uint256 newMinLiquidity);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "PriceOracle: only owner");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _chip,
        address _owner
    ) {
        require(_chip != address(0), "PriceOracle: zero chip");
        require(_owner != address(0), "PriceOracle: zero owner");
        chip = _chip;
        owner = _owner;
    }

    // ==================== REGISTRATION ====================

    /**
     * @notice Register a MEME/CHIP pair for price tracking
     * @param token MEME token address
     * @param pair Uniswap pair address
     */
    function registerToken(
        address token,
        address pair
    ) external onlyOwner {
        require(token != address(0), "PriceOracle: zero token");
        require(pair != address(0), "PriceOracle: zero pair");
        require(priceData[token].pair == address(0), "PriceOracle: already registered");

        IUniswapV2Pair uniPair = IUniswapV2Pair(pair);
        bool isToken0 = uniPair.token0() == token;

        require(
            (isToken0 && uniPair.token1() == chip) || (!isToken0 && uniPair.token0() == chip),
            "PriceOracle: invalid pair"
        );

        TokenPriceData storage data = priceData[token];
        data.pair = pair;
        data.isToken0 = isToken0;
        data.lastTWAP = 0;
        data.isPaused = false;
        data.pausedAt = 0;

        registeredTokens.push(token);

        // Initial observation
        _recordObservation(token);

        emit TokenRegistered(token, pair);
    }

    // ==================== PRICE UPDATES ====================

    /**
     * @notice Update TWAP for a token (can be called by anyone)
     */
    function updatePrice(
        address token
    ) external {
        _recordObservation(token);
        _updateTWAP(token);
    }

    function _recordObservation(
        address token
    ) internal {
        TokenPriceData storage data = priceData[token];
        require(data.pair != address(0), "PriceOracle: not registered");

        IUniswapV2Pair pair = IUniswapV2Pair(data.pair);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

        uint256 spotPrice;
        if (data.isToken0) {
            // token is token0, chip is token1
            // price = chip per token = reserve1 / reserve0
            spotPrice = reserve0 > 0 ? (uint256(reserve1) * 1e18) / uint256(reserve0) : 0;
        } else {
            // token is token1, chip is token0
            // price = chip per token = reserve0 / reserve1
            spotPrice = reserve1 > 0 ? (uint256(reserve0) * 1e18) / uint256(reserve1) : 0;
        }

        uint256 priceCumulative =
            data.isToken0 ? pair.price0CumulativeLast() : pair.price1CumulativeLast();

        data.observations
            .push(
                PriceObservation({
                    timestamp: block.timestamp, priceCumulative: priceCumulative, price: spotPrice
                })
            );

        // Keep only last 10 observations to save gas
        if (data.observations.length > 10) {
            // Shift array (expensive but keeps it bounded)
            for (uint256 i = 0; i < data.observations.length - 1; i++) {
                data.observations[i] = data.observations[i + 1];
            }
            data.observations.pop();
        }
    }

    function _updateTWAP(
        address token
    ) internal {
        TokenPriceData storage data = priceData[token];
        if (data.observations.length < 2) return;

        PriceObservation storage oldest = data.observations[0];
        PriceObservation storage newest = data.observations[data.observations.length - 1];

        uint256 timeElapsed = newest.timestamp - oldest.timestamp;
        if (timeElapsed < TWAP_WINDOW / 2) return; // Not enough time

        uint256 newTWAP;
        if (timeElapsed >= TWAP_WINDOW) {
            // Full TWAP
            newTWAP = (newest.priceCumulative - oldest.priceCumulative) / timeElapsed;
        } else {
            // Use spot for young pairs
            newTWAP = newest.price;
        }

        // Circuit breaker check
        if (data.lastTWAP > 0 && !data.isPaused) {
            uint256 change;
            if (newTWAP > data.lastTWAP) {
                change = ((newTWAP - data.lastTWAP) * 10_000) / data.lastTWAP;
            } else {
                change = ((data.lastTWAP - newTWAP) * 10_000) / data.lastTWAP;
            }

            if (change > circuitBreakerBps) {
                data.isPaused = true;
                data.pausedAt = block.timestamp;
                emit CircuitBreakerTriggered(token, change);
            }
        }

        data.lastTWAP = newTWAP;
        emit PriceUpdated(token, newTWAP, newest.price);
    }

    // ==================== PRICE QUERIES ====================

    /**
     * @notice Get price in CHIP for token amount
     * @param token MEME token
     * @param amount Token amount
     * @return chipValue Value in CHIP
     * @return isValid Whether price is valid (liquidity + not paused)
     */
    function getPrice(
        address token,
        uint256 amount
    ) external view returns (uint256 chipValue, bool isValid) {
        TokenPriceData storage data = priceData[token];

        if (data.pair == address(0) || data.isPaused) {
            return (0, false);
        }

        // Check liquidity
        IUniswapV2Pair pair = IUniswapV2Pair(data.pair);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        uint256 chipReserve = data.isToken0 ? reserve1 : reserve0;

        if (chipReserve < minLiquidity) {
            return (0, false);
        }

        uint256 price = data.lastTWAP > 0 ? data.lastTWAP : _getSpotPrice(token);
        chipValue = (amount * price) / 1e18;
        isValid = true;
    }

    function _getSpotPrice(
        address token
    ) internal view returns (uint256) {
        TokenPriceData storage data = priceData[token];
        IUniswapV2Pair pair = IUniswapV2Pair(data.pair);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

        if (data.isToken0) {
            return reserve0 > 0 ? (uint256(reserve1) * 1e18) / uint256(reserve0) : 0;
        } else {
            return reserve1 > 0 ? (uint256(reserve0) * 1e18) / uint256(reserve1) : 0;
        }
    }

    function getSpotPrice(
        address token
    ) external view returns (uint256) {
        return _getSpotPrice(token);
    }

    function getTWAP(
        address token
    ) external view returns (uint256) {
        return priceData[token].lastTWAP;
    }

    function isPaused(
        address token
    ) external view returns (bool) {
        return priceData[token].isPaused;
    }

    // ==================== ADMIN ====================

    function resetCircuitBreaker(
        address token
    ) external onlyOwner {
        TokenPriceData storage data = priceData[token];
        require(data.isPaused, "PriceOracle: not paused");
        data.isPaused = false;
        emit CircuitBreakerReset(token);
    }

    function setCircuitBreakerThreshold(
        uint256 bps
    ) external onlyOwner {
        require(bps >= 500 && bps <= 5000, "PriceOracle: 5-50%");
        circuitBreakerBps = bps;
        emit CircuitBreakerThresholdUpdated(bps);
    }

    function setMinLiquidity(
        uint256 amount
    ) external onlyOwner {
        minLiquidity = amount;
        emit MinLiquidityUpdated(amount);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "PriceOracle: zero owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
