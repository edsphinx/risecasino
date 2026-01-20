// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * VYRETREASURY — SECURE VAULT FOR CASINO FUNDS V4
 * -------------------------------------------------------------------------
 * Holds all betting tokens and manages payouts with multiple security layers.
 *
 * - Access Control: Owner (SAFE multisig) + Operator (VyreCasino)
 * - Daily Limits: Configurable withdrawal caps per token to limit exposure
 * - Emergency Freeze: Instant halt of all operations
 * - Timelocked Withdrawals: 72-hour delay for emergency admin withdrawals
 * - Reentrancy Protection: All payout functions are guarded
 *
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * ------------------------------------------------------------------------*/

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  VyreTreasury
 * @author edsphinx
 * @custom:company Blocketh
 * @custom:version 4.0.0
 * @notice Secure vault holding all casino funds with multi-layer security.
 * @dev    This contract is designed to be controlled by a SAFE multisig as owner
 *         and VyreCasino as the operator. The operator can only request payouts
 *         within configured daily limits, while the owner can freeze operations
 *         and perform timelocked emergency withdrawals.
 *
 *         Security Model:
 *         - Owner (SAFE multisig): Full control - freeze, limits, emergency withdraw
 *         - Operator (VyreCasino): Limited - payouts only within daily limits
 *         - Daily limits reset every 24 hours automatically
 *         - Emergency withdrawals have 72-hour timelock for transparency
 */
contract VyreTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------------
    //  STORAGE
    // ----------------------------------------------------------------------

    /// @notice Owner (SAFE multisig)
    address public owner;

    /// @notice Pending owner for two-step transfer
    address public pendingOwner;

    /// @notice Operator (VyreCasino contract)
    address public operator;

    /// @notice Emergency freeze status
    bool public frozen;

    /// @notice Daily withdrawal limit per token (0 = unlimited)
    mapping(address => uint256) public dailyLimits;

    /// @notice Amount spent today per token
    mapping(address => uint256) public dailySpent;

    /// @notice Last reset timestamp
    uint256 public lastResetTime;

    /// @notice Timelock for emergency withdraw (72 hours)
    uint256 public constant TIMELOCK_DURATION = 72 hours;

    /// @notice Pending emergency withdrawals
    struct PendingWithdraw {
        address token;
        address to;
        uint256 amount;
        uint256 executeAfter;
    }
    mapping(bytes32 => PendingWithdraw) public pendingWithdrawals;

    // ==================== EVENTS ====================

    event OperatorSet(address indexed operator);
    event DailyLimitSet(address indexed token, uint256 limit);
    event Payout(address indexed to, address indexed token, uint256 amount);
    event Frozen();
    event Unfrozen();
    event EmergencyWithdrawQueued(
        bytes32 indexed id, address token, address to, uint256 amount, uint256 executeAfter
    );
    event EmergencyWithdrawExecuted(bytes32 indexed id);
    event EmergencyWithdrawCancelled(bytes32 indexed id);
    event Deposit(address indexed from, address indexed token, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "VyreTreasury: only owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "VyreTreasury: only operator");
        _;
    }

    modifier notFrozen() {
        require(!frozen, "VyreTreasury: frozen");
        _;
    }

    modifier withinDailyLimit(
        address token,
        uint256 amount
    ) {
        // Check if we need to reset the day
        if (block.timestamp >= lastResetTime + 1 days) {
            lastResetTime = block.timestamp;
            dailySpent[token] = 0; // Reset spent for this token
        }
        uint256 limit = dailyLimits[token];
        if (limit > 0) {
            require(dailySpent[token] + amount <= limit, "VyreTreasury: daily limit exceeded");
        }
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _owner
    ) {
        require(_owner != address(0), "VyreTreasury: zero owner");
        owner = _owner;
        lastResetTime = block.timestamp;
    }

    // ==================== OPERATOR FUNCTIONS ====================

    /**
     * @notice Payout to player (called by VyreCasino)
     * @param to Recipient address
     * @param token ERC20 token address
     * @param amount Amount to pay
     */
    function payout(
        address to,
        address token,
        uint256 amount
    ) external onlyOperator notFrozen withinDailyLimit(token, amount) nonReentrant {
        require(to != address(0), "VyreTreasury: zero recipient");
        require(amount > 0, "VyreTreasury: zero amount");

        dailySpent[token] += amount;

        IERC20(token).safeTransfer(to, amount);

        emit Payout(to, token, amount);
    }

    // ==================== OWNER FUNCTIONS ====================

    /**
     * @notice Set operator address (VyreCasino)
     */
    function setOperator(
        address _operator
    ) external onlyOwner {
        require(_operator != address(0), "VyreTreasury: zero operator");
        operator = _operator;
        emit OperatorSet(_operator);
    }

    /**
     * @notice Set daily withdrawal limit for a token
     * @param token Token address
     * @param limit Daily limit (0 = unlimited)
     */
    function setDailyLimit(
        address token,
        uint256 limit
    ) external onlyOwner {
        dailyLimits[token] = limit;
        emit DailyLimitSet(token, limit);
    }

    /**
     * @notice Emergency freeze all operations
     */
    function freeze() external onlyOwner {
        frozen = true;
        emit Frozen();
    }

    /**
     * @notice Unfreeze operations
     */
    function unfreeze() external onlyOwner {
        frozen = false;
        emit Unfrozen();
    }

    /**
     * @notice Queue emergency withdrawal (with timelock)
     */
    function queueEmergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner returns (bytes32 id) {
        id = keccak256(abi.encodePacked(token, to, amount, block.timestamp));

        pendingWithdrawals[id] = PendingWithdraw({
            token: token, to: to, amount: amount, executeAfter: block.timestamp + TIMELOCK_DURATION
        });

        emit EmergencyWithdrawQueued(id, token, to, amount, block.timestamp + TIMELOCK_DURATION);
    }

    /**
     * @notice Execute queued emergency withdrawal
     */
    function executeEmergencyWithdraw(
        bytes32 id
    ) external onlyOwner nonReentrant {
        PendingWithdraw memory pw = pendingWithdrawals[id];
        require(pw.executeAfter > 0, "VyreTreasury: not queued");
        require(block.timestamp >= pw.executeAfter, "VyreTreasury: timelock not passed");

        delete pendingWithdrawals[id];

        IERC20(pw.token).safeTransfer(pw.to, pw.amount);

        emit EmergencyWithdrawExecuted(id);
    }

    /**
     * @notice Cancel queued emergency withdrawal
     */
    function cancelEmergencyWithdraw(
        bytes32 id
    ) external onlyOwner {
        require(pendingWithdrawals[id].executeAfter > 0, "VyreTreasury: not queued");
        delete pendingWithdrawals[id];
        emit EmergencyWithdrawCancelled(id);
    }

    /**
     * @notice Transfer ownership to new SAFE
     */
    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "VyreTreasury: zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "VyreTreasury: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ==================== VIEW FUNCTIONS ====================

    /**
     * @notice Get token balance
     */
    function balance(
        address token
    ) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Get remaining daily limit
     */
    function remainingDailyLimit(
        address token
    ) external view returns (uint256) {
        uint256 limit = dailyLimits[token];
        if (limit == 0) return type(uint256).max;

        // Check if reset needed
        if (block.timestamp >= lastResetTime + 1 days) {
            return limit;
        }

        return limit > dailySpent[token] ? limit - dailySpent[token] : 0;
    }

    // ==================== INTERNAL ====================

    function _resetDailyIfNeeded() internal {
        if (block.timestamp >= lastResetTime + 1 days) {
            lastResetTime = block.timestamp;
            // Note: dailySpent is not reset here for gas efficiency
            // Instead, we reset lazily per token when accessed
        }
    }

    // ==================== RECEIVE ====================

    /// @notice Allow receiving ETH for potential future use
    receive() external payable { }
}
