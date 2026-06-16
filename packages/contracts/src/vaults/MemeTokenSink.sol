// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * MEMETOKENSINK — MEME TOKEN LOSS DISTRIBUTION
 * -------------------------------------------------------------------------
 * Handles distribution of MEME tokens lost in games.
 *
 * - Burn: 50% sent to dead address (deflationary)
 * - Creator: 25% returned to token creator
 * - Casino: 25% sent to treasury
 * ------------------------------------------------------------------------*/

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  MemeTokenSink
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Handles distribution of MEME tokens lost in games
 * @dev Split: 50% Burn / 25% Creator / 25% Casino
 *
 * Called by games when player loses with non-CHIP tokens
 */
contract MemeTokenSink {
    using SafeERC20 for IERC20;

    // ==================== STATE ====================

    /// @notice Casino treasury
    address public treasury;

    /// @notice Owner
    address public owner;

    /// @notice Token creator mapping
    mapping(address => address) public tokenCreators;

    /// @notice Authorized games that can call processLoss
    mapping(address => bool) public authorizedGames;

    /// @notice Burn address
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ==================== CONFIG ====================

    /// @notice Burn share in bps (5000 = 50%)
    uint256 public burnShareBps = 5000;

    /// @notice Creator share in bps (2500 = 25%)
    uint256 public creatorShareBps = 2500;

    /// @notice Casino share in bps (2500 = 25%)
    uint256 public casinoShareBps = 2500;

    // ==================== EVENTS ====================

    event LossProcessed(
        address indexed token,
        uint256 totalAmount,
        uint256 burned,
        uint256 toCreator,
        uint256 toCasino
    );

    event TokenCreatorRegistered(address indexed token, address indexed creator);
    event GameAuthorized(address indexed game);
    event GameRevoked(address indexed game);
    event SharesUpdated(uint256 burnShareBps, uint256 creatorShareBps, uint256 casinoShareBps);
    event TreasuryUpdated(address indexed newTreasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "MemeTokenSink: only owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedGames[msg.sender], "MemeTokenSink: not authorized");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _treasury,
        address _owner
    ) {
        require(_treasury != address(0), "MemeTokenSink: zero treasury");
        require(_owner != address(0), "MemeTokenSink: zero owner");
        treasury = _treasury;
        owner = _owner;
    }

    // ==================== MAIN FUNCTION ====================

    /**
     * @notice Process lost MEME tokens from game
     * @param token MEME token address
     * @param amount Total amount lost
     */
    function processLoss(
        address token,
        uint256 amount
    ) external onlyAuthorized {
        require(token != address(0), "MemeTokenSink: zero token");
        require(amount > 0, "MemeTokenSink: zero amount");

        // Transfer tokens in, measuring what actually arrived — fee-on-transfer or
        // rebasing tokens deliver less than `amount`, and splitting `amount` would try
        // to distribute more than the contract holds (audit M6).
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        // Calculate splits on the received amount
        uint256 burnAmount = (received * burnShareBps) / 10_000;
        uint256 creatorAmount = (received * creatorShareBps) / 10_000;
        uint256 casinoAmount = received - burnAmount - creatorAmount;

        // Burn (send to dead address)
        if (burnAmount > 0) {
            IERC20(token).safeTransfer(BURN_ADDRESS, burnAmount);
        }

        // Creator share
        address creator = tokenCreators[token];
        if (creatorAmount > 0 && creator != address(0)) {
            IERC20(token).safeTransfer(creator, creatorAmount);
        } else if (creatorAmount > 0) {
            // If no creator registered, send to treasury
            IERC20(token).safeTransfer(treasury, creatorAmount);
        }

        // Casino share
        if (casinoAmount > 0) {
            IERC20(token).safeTransfer(treasury, casinoAmount);
        }

        emit LossProcessed(token, received, burnAmount, creatorAmount, casinoAmount);
    }

    // ==================== REGISTRATION ====================

    /**
     * @notice Register token creator (called by BondingCurve/TokenFactory)
     */
    function registerTokenCreator(
        address token,
        address creator
    ) external onlyAuthorized {
        require(token != address(0), "MemeTokenSink: zero token");
        require(creator != address(0), "MemeTokenSink: zero creator");
        tokenCreators[token] = creator;
        emit TokenCreatorRegistered(token, creator);
    }

    // ==================== VIEW ====================

    function getCreator(
        address token
    ) external view returns (address) {
        return tokenCreators[token];
    }

    function getSplitAmounts(
        uint256 amount
    ) external view returns (uint256 burn, uint256 creator, uint256 casino) {
        burn = (amount * burnShareBps) / 10_000;
        creator = (amount * creatorShareBps) / 10_000;
        casino = amount - burn - creator;
    }

    // ==================== ADMIN ====================

    function authorizeGame(
        address game
    ) external onlyOwner {
        require(game != address(0), "MemeTokenSink: zero game");
        authorizedGames[game] = true;
        emit GameAuthorized(game);
    }

    function revokeGame(
        address game
    ) external onlyOwner {
        authorizedGames[game] = false;
        emit GameRevoked(game);
    }

    function setShares(
        uint256 _burnBps,
        uint256 _creatorBps,
        uint256 _casinoBps
    ) external onlyOwner {
        require(_burnBps + _creatorBps + _casinoBps == 10_000, "MemeTokenSink: must total 100%");
        burnShareBps = _burnBps;
        creatorShareBps = _creatorBps;
        casinoShareBps = _casinoBps;
        emit SharesUpdated(_burnBps, _creatorBps, _casinoBps);
    }

    function setTreasury(
        address _treasury
    ) external onlyOwner {
        require(_treasury != address(0), "MemeTokenSink: zero treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "MemeTokenSink: zero owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
