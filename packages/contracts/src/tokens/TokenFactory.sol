// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * TOKENFACTORY — MEME TOKEN CREATION FOR CASINO OWNERS
 * -------------------------------------------------------------------------
 * Allows Level 50+ players to create their own MEME tokens with anti-rug safeguards.
 *
 * - Access Control: Only Level 50+ (Casino Owners) can create tokens
 * - LP Lock: All liquidity is locked forever in this contract (no withdrawal)
 * - Fair Launch: Creator receives only 20% of supply, rest goes to LP
 * - CHIP Paired: All tokens are paired with CHIP for trading
 * ------------------------------------------------------------------------*/

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IXPRegistry } from "../interfaces/IXPRegistry.sol";
import { IUniswapV2Factory } from "../interfaces/IUniswapV2Factory.sol";
import { IUniswapV2Router02 } from "../interfaces/IUniswapV2Router02.sol";

/**
 * @title  MemeToken
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Standard ERC20 token created by Level 50 Casino Owners.
 * @dev    Simple ERC20 with creator tracking for transparency.
 */
contract MemeToken is ERC20 {
    address public immutable creator;
    uint256 public immutable createdAt;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        address _creator
    ) ERC20(name_, symbol_) {
        creator = _creator;
        createdAt = block.timestamp;
        _mint(_creator, initialSupply);
    }
}

/**
 * @title  TokenFactory
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Factory for Level 50 Casino Owners to create MEME tokens.
 * @dev    Anti-rug safeguards:
 *         1. Only Level 50+ can create tokens
 *         2. LP tokens locked in this contract forever
 *         3. Creator receives limited supply (default 20%)
 *         4. Minimum CHIP liquidity required
 */
contract TokenFactory {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------------
    //  STORAGE
    // ----------------------------------------------------------------------

    /// @notice XP Registry for level verification
    IXPRegistry public immutable xpRegistry;

    /// @notice Uniswap V2 Factory
    IUniswapV2Factory public immutable uniswapFactory;

    /// @notice Uniswap V2 Router
    IUniswapV2Router02 public immutable uniswapRouter;

    /// @notice CHIP token address
    address public immutable chipToken;

    /// @notice Owner
    address public owner;

    /// @notice Pending owner for two-step transfer
    address public pendingOwner;

    /// @notice Token creation fee (in CHIP)
    uint256 public creationFee = 1000e18; // 1000 CHIP

    /// @notice Minimum CHIP liquidity required
    uint256 public minChipLiquidity = 10_000e18; // 10,000 CHIP

    /// @notice Percentage of token supply that goes to creator (rest to LP)
    uint256 public creatorShareBps = 2000; // 20%

    /// @notice LP lock duration (forever = max uint256)
    uint256 public lpLockDuration = type(uint256).max;

    /// @notice All created tokens
    address[] public allTokens;

    /// @notice Token info
    struct TokenInfo {
        address token;
        address creator;
        address lpPair;
        uint256 lpAmount;
        uint256 lpLockedUntil;
        uint256 createdAt;
    }

    /// @notice Token info by address
    mapping(address => TokenInfo) public tokenInfo;

    /// @notice Tokens created by address
    mapping(address => address[]) public tokensBy;

    /// @notice Locked LP per pair
    mapping(address => uint256) public lockedLP;

    // ==================== EVENTS ====================

    event TokenCreated(
        address indexed creator,
        address indexed token,
        address indexed lpPair,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 chipLiquidity,
        uint256 lpAmount
    );

    event FeeUpdated(uint256 newFee);
    event MinLiquidityUpdated(uint256 newMin);
    event CreatorShareUpdated(uint256 newBps);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "TokenFactory: only owner");
        _;
    }

    modifier onlyCasinoOwner() {
        require(xpRegistry.isCasinoOwner(msg.sender), "TokenFactory: must be Level 50+");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _xpRegistry,
        address _uniswapFactory,
        address _uniswapRouter,
        address _chipToken,
        address _owner
    ) {
        require(_xpRegistry != address(0), "TokenFactory: zero xpRegistry");
        require(_uniswapFactory != address(0), "TokenFactory: zero factory");
        require(_uniswapRouter != address(0), "TokenFactory: zero router");
        require(_chipToken != address(0), "TokenFactory: zero chip");
        require(_owner != address(0), "TokenFactory: zero owner");

        xpRegistry = IXPRegistry(_xpRegistry);
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        chipToken = _chipToken;
        owner = _owner;
    }

    // ==================== MAIN FUNCTION ====================

    /**
     * @notice Create a new MEME token and pair with CHIP
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total token supply
     * @param chipAmount CHIP to add to LP (must be >= minChipLiquidity)
     * @return token Created token address
     * @return lpPair LP pair address
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        uint256 chipAmount
    ) external onlyCasinoOwner returns (address token, address lpPair) {
        require(bytes(name).length > 0, "TokenFactory: empty name");
        require(bytes(symbol).length > 0, "TokenFactory: empty symbol");
        require(totalSupply > 0, "TokenFactory: zero supply");
        require(chipAmount >= minChipLiquidity, "TokenFactory: insufficient CHIP");

        // Collect fee
        if (creationFee > 0) {
            IERC20(chipToken).safeTransferFrom(msg.sender, owner, creationFee);
        }

        // Collect CHIP for LP
        IERC20(chipToken).safeTransferFrom(msg.sender, address(this), chipAmount);

        // Create token
        MemeToken memeToken = new MemeToken(name, symbol, totalSupply, address(this));
        token = address(memeToken);

        // Calculate splits
        uint256 creatorAmount = (totalSupply * creatorShareBps) / 10_000;
        uint256 lpTokenAmount = totalSupply - creatorAmount;

        // Create pair if needed
        lpPair = uniswapFactory.getPair(token, chipToken);
        if (lpPair == address(0)) {
            lpPair = uniswapFactory.createPair(token, chipToken);
        }

        // Approve router
        IERC20(token).approve(address(uniswapRouter), lpTokenAmount);
        IERC20(chipToken).approve(address(uniswapRouter), chipAmount);

        // Add liquidity (LP tokens go to this contract = locked forever)
        (,, uint256 lpAmount) = uniswapRouter.addLiquidity(
            token,
            chipToken,
            lpTokenAmount,
            chipAmount,
            lpTokenAmount,
            chipAmount,
            address(this), // LP locked in factory
            block.timestamp + 300
        );

        // Transfer creator share
        IERC20(token).safeTransfer(msg.sender, creatorAmount);

        // Emit before recording to reduce stack depth
        emit TokenCreated(
            msg.sender, token, lpPair, name, symbol, totalSupply, chipAmount, lpAmount
        );

        // Record token info
        // Safely calculate lock end time (avoid overflow when lpLockDuration is max uint256)
        tokenInfo[token] = TokenInfo({
            token: token,
            creator: msg.sender,
            lpPair: lpPair,
            lpAmount: lpAmount,
            lpLockedUntil: lpLockDuration == type(uint256).max
                ? type(uint256).max
                : block.timestamp + lpLockDuration,
            createdAt: block.timestamp
        });

        lockedLP[lpPair] += lpAmount;
        allTokens.push(token);
        tokensBy[msg.sender].push(token);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function getTokensByCreator(
        address creator
    ) external view returns (address[] memory) {
        return tokensBy[creator];
    }

    function getTokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function isLPLocked(
        address lpPair
    ) external view returns (bool) {
        return lockedLP[lpPair] > 0;
    }

    // ==================== ADMIN FUNCTIONS ====================

    function setCreationFee(
        uint256 fee
    ) external onlyOwner {
        creationFee = fee;
        emit FeeUpdated(fee);
    }

    function setMinLiquidity(
        uint256 min
    ) external onlyOwner {
        minChipLiquidity = min;
        emit MinLiquidityUpdated(min);
    }

    function setCreatorShare(
        uint256 bps
    ) external onlyOwner {
        require(bps <= 5000, "TokenFactory: max 50%");
        creatorShareBps = bps;
        emit CreatorShareUpdated(bps);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "TokenFactory: zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "TokenFactory: not pending owner");
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    // NOTE: No function to withdraw LP tokens - they are locked forever
}
