// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * VYRECASINO — CENTRAL ORCHESTRATOR FOR ALL CASINO GAMES
 * -------------------------------------------------------------------------
 * Routes player bets through registered games and handles all financial logic.
 *
 * - Game Routing: Players call play() which delegates to registered IVyreGame contracts
 * - House Edge: Configurable fee (default 2%) deducted before payouts
 * - Referral System: Multi-tier referral rewards from house edge share
 * - XP Integration: Awards XP based on bet amounts for level progression
 * - Token Whitelist: Only approved ERC20 tokens can be used for betting
 * - Security: ReentrancyGuard, pausable, only owner can configure
 * ------------------------------------------------------------------------*/

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVyreGame } from "./interfaces/IVyreGame.sol";
import { IPermit2 } from "./interfaces/IPermit2.sol";

// ----------------------------------------------------------------------
//  EXTERNAL INTERFACES
// ----------------------------------------------------------------------

/// @notice Interface for VyreTreasury vault
interface IVyreTreasury {
    function payout(
        address to,
        address token,
        uint256 amount
    ) external;
    function balance(
        address token
    ) external view returns (uint256);
}

/// @notice Interface for XP level tracking
interface IXPRegistry {
    function addXP(
        address user,
        uint256 amount
    ) external;
    function getLevel(
        address user
    ) external view returns (uint8);
    function getHouseEdgeReduction(
        address user
    ) external view returns (uint256);
}

/// @notice Interface for multi-tier referral system
interface IReferralRegistry {
    function recordEarnings(
        address player,
        address token,
        uint256 houseEdgeAmount,
        uint256 betAmount
    ) external;
    function setReferrer(
        address referrer
    ) external;
}

/**
 * @title  VyreCasino
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Central orchestrator for the Vyre Casino ecosystem.
 * @dev    This contract acts as the single entry point for all casino gameplay.
 *         Players interact with VyreCasino.play() which routes to registered games.
 *
 *         Flow:
 *         1. Player approves token to VyreCasino
 *         2. Player calls play(game, token, amount, params)
 *         3. VyreCasino transfers tokens from player to Treasury
 *         4. VyreCasino calls game.play() with player context
 *         5. Game returns result (won, payout amount)
 *         6. VyreCasino calculates house edge and referral share
 *         7. Treasury pays out net amount to player
 *
 *         Security:
 *         - ReentrancyGuard on all external functions
 *         - Pausable for emergency stops
 *         - Only registered games can be played
 *         - Only whitelisted tokens accepted
 */
contract VyreCasino is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------------
    //  CONSTANTS
    // ----------------------------------------------------------------------

    /// @notice Permit2 contract address (pre-deployed on Rise Testnet)
    IPermit2 public constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    // ----------------------------------------------------------------------
    //  STORAGE
    // ----------------------------------------------------------------------

    /// @notice Treasury contract that holds all funds
    IVyreTreasury public immutable treasury;

    /// @notice XP Registry for player level tracking
    IXPRegistry public xpRegistry;

    /// @notice Referral Registry for multi-tier referral rewards
    IReferralRegistry public referralRegistry;

    /// @notice Contract owner (should be SAFE multisig)
    address public owner;

    /// @notice Pending owner for two-step transfer
    address public pendingOwner;

    /// @notice Emergency pause state
    bool public paused;

    /// @notice Mapping of registered game contract addresses
    mapping(address => bool) public registeredGames;

    /// @notice Mapping of whitelisted betting tokens
    mapping(address => bool) public whitelistedTokens;

    /// @notice Primary betting token (CHIP), always whitelisted
    address public immutable chipToken;

    /// @notice Direct referrer per player (legacy, use referralRegistry for new logic)
    mapping(address => address) public referrers;

    /// @notice Referral earnings per player per token (legacy)
    mapping(address => mapping(address => uint256)) public referralEarnings;

    // ----------------------------------------------------------------------
    //  CONFIGURATION
    // ----------------------------------------------------------------------

    /// @notice House edge in basis points (200 = 2%)
    uint256 public houseEdgeBps = 200;

    /// @notice Referral share of house edge in basis points (5000 = 50%)
    uint256 public referralShareBps = 5000;

    /// @notice Treasury share of house edge in bps (3000 = 30%)
    uint256 public treasuryShareBps = 3000;

    /// @notice Buyback share of house edge in bps (2000 = 20%)
    uint256 public buybackShareBps = 2000;

    /// @notice Buyback wallet
    address public buybackWallet;

    /// @notice XP per bet unit (e.g., 1 XP per CHIP bet)
    uint256 public xpPerBet = 1;

    // ==================== CHIP TIERS ====================

    /// @notice Visual chip tiers for frontend
    uint256[12] public CHIP_TIERS = [
        1e18, // 0: 1 CHIP (white)
        5e18, // 1: 5 CHIP (red)
        10e18, // 2: 10 CHIP (blue)
        50e18, // 3: 50 CHIP (green)
        100e18, // 4: 100 CHIP (black)
        1000e18, // 5: 1K CHIP (purple)
        5000e18, // 6: 5K CHIP (orange)
        10_000e18, // 7: 10K CHIP (yellow)
        50_000e18, // 8: 50K CHIP (pink)
        100_000e18, // 9: 100K CHIP (cyan)
        500_000e18, // 10: 500K CHIP (gold)
        1_000_000e18 // 11: 1M CHIP (diamond)
    ];

    // ==================== EVENTS ====================

    event GameRegistered(address indexed game);
    event GameUnregistered(address indexed game);
    event TokenWhitelisted(address indexed token);
    event TokenRemoved(address indexed token);
    event ReferrerSet(address indexed player, address indexed referrer);
    event ReferralEarningsClaimed(address indexed referrer, address indexed token, uint256 amount);
    event GamePlayed(
        address indexed player,
        address indexed game,
        address indexed token,
        uint256 bet,
        bool won,
        uint256 netPayout,
        uint256 houseEdge
    );
    event XPAwarded(address indexed player, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event HouseEdgeUpdated(uint256 oldBps, uint256 newBps);
    event ReferralShareUpdated(uint256 oldBps, uint256 newBps);
    event XPRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event BuybackWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    /// @notice Emitted when async settlement is pending (for frontend tracking)
    event SettlementPending(address indexed game, address indexed player, address token, uint256 expectedAmount);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "VyreCasino: only owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "VyreCasino: paused");
        _;
    }

    modifier onlyRegisteredGame() {
        require(registeredGames[msg.sender], "VyreCasino: not registered game");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _treasury,
        address _chipToken,
        address _owner,
        address _buybackWallet
    ) {
        require(_treasury != address(0), "VyreCasino: zero treasury");
        require(_chipToken != address(0), "VyreCasino: zero chip");
        require(_owner != address(0), "VyreCasino: zero owner");

        treasury = IVyreTreasury(_treasury);
        chipToken = _chipToken;
        owner = _owner;
        buybackWallet = _buybackWallet;

        // CHIP is always whitelisted
        whitelistedTokens[_chipToken] = true;
    }

    // ==================== PLAYER FUNCTIONS ====================

    /**
     * @notice Play a game
     * @param game Game contract address
     * @param token Token to bet (must be whitelisted)
     * @param amount Bet amount
     * @param gameData Game-specific parameters
     */
    function play(
        address game,
        address token,
        uint256 amount,
        bytes calldata gameData
    ) external whenNotPaused nonReentrant returns (IVyreGame.GameResult memory result) {
        // Validations
        require(registeredGames[game], "VyreCasino: game not registered");
        require(whitelistedTokens[token], "VyreCasino: token not whitelisted");
        require(amount > 0, "VyreCasino: zero bet");
        require(
            amount >= IVyreGame(game).minBet(token) && amount <= IVyreGame(game).maxBet(token),
            "VyreCasino: bet out of range"
        );

        // Transfer bet from player to treasury
        IERC20(token).safeTransferFrom(msg.sender, address(treasury), amount);

        // Determine chip tier for display
        uint8 chipTier = _getChipTier(amount);

        // Call game
        IVyreGame.BetInfo memory betInfo =
            IVyreGame.BetInfo({ token: token, amount: amount, chipTier: chipTier });

        result = IVyreGame(game).play(msg.sender, betInfo, gameData);

        // Process result
        if (result.won && result.payout > 0) {
            _processWin(msg.sender, token, result.payout);
        }

        // Award XP (based on bet amount)
        _awardXP(msg.sender, amount);

        emit GamePlayed(
            msg.sender,
            game,
            token,
            amount,
            result.won,
            result.won ? _calculateNetPayout(result.payout) : 0,
            result.won ? _calculateHouseEdge(result.payout) : 0
        );
    }

    /**
     * @notice Play a game using Permit2 (gasless approval)
     * @dev User signs a permit off-chain, no separate approve tx needed
     * @param game Game contract address
     * @param token Token to bet (must be whitelisted)
     * @param amount Bet amount
     * @param gameData Game-specific parameters
     * @param permit The permit data signed by the user
     * @param signature The user's signature over the permit
     */
    function playWithPermit(
        address game,
        address token,
        uint256 amount,
        bytes calldata gameData,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external whenNotPaused nonReentrant returns (IVyreGame.GameResult memory result) {
        // Validations
        require(registeredGames[game], "VyreCasino: game not registered");
        require(whitelistedTokens[token], "VyreCasino: token not whitelisted");
        require(amount > 0, "VyreCasino: zero bet");
        require(permit.permitted.token == token, "VyreCasino: permit token mismatch");
        require(permit.permitted.amount >= amount, "VyreCasino: insufficient permit");
        require(
            amount >= IVyreGame(game).minBet(token) && amount <= IVyreGame(game).maxBet(token),
            "VyreCasino: bet out of range"
        );

        // Use Permit2 to transfer bet from player to treasury
        PERMIT2.permitTransferFrom(
            permit,
            IPermit2.SignatureTransferDetails({ to: address(treasury), requestedAmount: amount }),
            msg.sender,
            signature
        );

        // Determine chip tier for display
        uint8 chipTier = _getChipTier(amount);

        // Call game
        IVyreGame.BetInfo memory betInfo =
            IVyreGame.BetInfo({ token: token, amount: amount, chipTier: chipTier });

        result = IVyreGame(game).play(msg.sender, betInfo, gameData);

        // Process result
        if (result.won && result.payout > 0) {
            _processWin(msg.sender, token, result.payout);
        }

        // Award XP (based on bet amount)
        _awardXP(msg.sender, amount);

        emit GamePlayed(
            msg.sender,
            game,
            token,
            amount,
            result.won,
            result.won ? _calculateNetPayout(result.payout) : 0,
            result.won ? _calculateHouseEdge(result.payout) : 0
        );
    }

    /**
     * @notice Set referrer for caller
     * @param referrer Referrer address
     */
    function setReferrer(
        address referrer
    ) external {
        require(referrers[msg.sender] == address(0), "VyreCasino: referrer already set");
        require(referrer != address(0), "VyreCasino: zero referrer");
        require(referrer != msg.sender, "VyreCasino: self referral");

        referrers[msg.sender] = referrer;
        emit ReferrerSet(msg.sender, referrer);
    }

    /**
     * @notice Claim accumulated referral earnings
     * @param token Token to claim
     */
    function claimReferralEarnings(
        address token
    ) external nonReentrant {
        uint256 earnings = referralEarnings[msg.sender][token];
        require(earnings > 0, "VyreCasino: no earnings");

        referralEarnings[msg.sender][token] = 0;
        treasury.payout(msg.sender, token, earnings);

        emit ReferralEarningsClaimed(msg.sender, token, earnings);
    }

    // ==================== ADMIN FUNCTIONS ====================

    function registerGame(
        address game
    ) external onlyOwner {
        require(game != address(0), "VyreCasino: zero game");
        registeredGames[game] = true;
        emit GameRegistered(game);
    }

    function unregisterGame(
        address game
    ) external onlyOwner {
        registeredGames[game] = false;
        emit GameUnregistered(game);
    }

    function whitelistToken(
        address token
    ) external onlyOwner {
        require(token != address(0), "VyreCasino: zero token");
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    function removeToken(
        address token
    ) external onlyOwner {
        require(token != chipToken, "VyreCasino: cannot remove CHIP");
        whitelistedTokens[token] = false;
        emit TokenRemoved(token);
    }

    function setHouseEdge(
        uint256 bps
    ) external onlyOwner {
        require(bps <= 1000, "VyreCasino: max 10%");
        uint256 oldBps = houseEdgeBps;
        houseEdgeBps = bps;
        emit HouseEdgeUpdated(oldBps, bps);
    }

    function setReferralShare(
        uint256 bps
    ) external onlyOwner {
        require(bps <= 10_000, "VyreCasino: max 100%");
        uint256 oldBps = referralShareBps;
        referralShareBps = bps;
        emit ReferralShareUpdated(oldBps, bps);
    }

    function setXPRegistry(
        address _xpRegistry
    ) external onlyOwner {
        address oldRegistry = address(xpRegistry);
        xpRegistry = IXPRegistry(_xpRegistry);
        emit XPRegistryUpdated(oldRegistry, _xpRegistry);
    }

    function setBuybackWallet(
        address _wallet
    ) external onlyOwner {
        address oldWallet = buybackWallet;
        buybackWallet = _wallet;
        emit BuybackWalletUpdated(oldWallet, _wallet);
    }

    // ==================== GAME SETTLEMENT ====================

    /**
     * @notice Settle payout for async games (called by registered games after resolution)
     * @dev Only registered games can call this. Used for multi-step games like Blackjack
     *      where the final payout happens after player actions (hit, stand, surrender, etc)
     * @param player Player to receive payout
     * @param token Token to pay
     * @param amount Gross payout amount (before house edge)
     */
    function settlePayout(
        address player,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(registeredGames[msg.sender], "VyreCasino: only registered games");
        require(player != address(0), "VyreCasino: zero player");
        
        if (amount > 0) {
            _processWin(player, token, amount);
        }
        
        emit GameSettled(msg.sender, player, token, amount);
    }

    event GameSettled(address indexed game, address indexed player, address token, uint256 amount);

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "VyreCasino: zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "VyreCasino: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getChipTier(
        uint256 amount
    ) external pure returns (uint8) {
        return _getChipTier(amount);
    }

    function getAvailableChipTiers(
        address player,
        address token
    ) external view returns (bool[12] memory available) {
        uint256 balance = IERC20(token).balanceOf(player);
        for (uint8 i = 0; i < 12; i++) {
            available[i] = balance >= CHIP_TIERS[i];
        }
    }

    /**
     * @notice Get player stats for frontend dashboard (single call)
     * @param player Player address
     * @param token Token to check balance
     * @return tokenBalance Player's token balance
     * @return playerReferrer Player's referrer address
     * @return playerReferralEarnings Player's referral earnings for this token
     * @return isPaused Whether casino is paused
     * @return currentHouseEdgeBps Current house edge in basis points
     */
    function getPlayerStats(
        address player,
        address token
    )
        external
        view
        returns (
            uint256 tokenBalance,
            address playerReferrer,
            uint256 playerReferralEarnings,
            bool isPaused,
            uint256 currentHouseEdgeBps
        )
    {
        tokenBalance = IERC20(token).balanceOf(player);
        playerReferrer = referrers[player];
        playerReferralEarnings = referralEarnings[player][token];
        isPaused = paused;
        currentHouseEdgeBps = houseEdgeBps;
    }

    // ==================== INTERNAL ====================

    function _processWin(
        address player,
        address token,
        uint256 grossPayout
    ) internal {
        uint256 houseEdge = _calculateHouseEdge(grossPayout);
        uint256 netPayout = grossPayout - houseEdge;

        // Distribute house edge
        if (houseEdge > 0) {
            address referrer = referrers[player];

            if (referrer != address(0)) {
                // Referrer gets their share
                uint256 referralAmount = (houseEdge * referralShareBps) / 10_000;
                referralEarnings[referrer][token] += referralAmount;
            }

            // Buyback wallet gets their share (sent directly)
            if (buybackWallet != address(0)) {
                uint256 buybackAmount = (houseEdge * buybackShareBps) / 10_000;
                if (buybackAmount > 0) {
                    treasury.payout(buybackWallet, token, buybackAmount);
                }
            }
            // Treasury keeps remaining (already in treasury)
        }

        // Pay player
        if (netPayout > 0) {
            treasury.payout(player, token, netPayout);
        }
    }

    function _calculateHouseEdge(
        uint256 payout
    ) internal view returns (uint256) {
        return (payout * houseEdgeBps) / 10_000;
    }

    function _calculateNetPayout(
        uint256 grossPayout
    ) internal view returns (uint256) {
        return grossPayout - _calculateHouseEdge(grossPayout);
    }

    function _getChipTier(
        uint256 amount
    ) internal pure returns (uint8) {
        // Gas-optimized cascade (no loop, no storage reads)
        if (amount >= 1_000_000e18) return 11; // Diamond
        if (amount >= 500_000e18) return 10; // Gold
        if (amount >= 100_000e18) return 9; // Cyan
        if (amount >= 50_000e18) return 8; // Pink
        if (amount >= 10_000e18) return 7; // Yellow
        if (amount >= 5000e18) return 6; // Orange
        if (amount >= 1000e18) return 5; // Purple
        if (amount >= 100e18) return 4; // Black
        if (amount >= 50e18) return 3; // Green
        if (amount >= 10e18) return 2; // Blue
        if (amount >= 5e18) return 1; // Red
        return 0; // White
    }

    function _awardXP(
        address player,
        uint256 betAmount
    ) internal {
        if (address(xpRegistry) != address(0)) {
            uint256 xp = (betAmount * xpPerBet) / 1e18;
            if (xp > 0) {
                xpRegistry.addXP(player, xp);
                emit XPAwarded(player, xp);
            }
        }
    }
}
