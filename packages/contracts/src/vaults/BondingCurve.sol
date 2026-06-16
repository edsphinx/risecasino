// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * BONDINGCURVE — PUMP.FUN STYLE TOKEN LAUNCHES
 * -------------------------------------------------------------------------
 * Automated market maker for fair token launches with LP graduation.
 *
 * - Fair Launch: Price rises with demand (x*y=k curve)
 * - Anti-Rug: LP auto-locks on Uniswap graduation
 * - Level Gated: Only Level 50+ can launch tokens
 * - LP Vesting: 6mo cliff + 6mo linear vesting for creators
 * ------------------------------------------------------------------------*/

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IUniswapV2Factory } from "../interfaces/IUniswapV2Factory.sol";
import { IUniswapV2Router02 } from "../interfaces/IUniswapV2Router02.sol";
import { ILPVesting } from "../interfaces/ILPVesting.sol";
import { IXPRegistry } from "../interfaces/IXPRegistry.sol";

/**
 * @title  BondingCurveToken
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Token created on bonding curve, minted/burned on buy/sell
 */
contract BondingCurveToken is ERC20 {
    address public immutable curve;

    modifier onlyCurve() {
        require(msg.sender == curve, "Only curve");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        curve = msg.sender;
    }

    function mint(
        address to,
        uint256 amount
    ) external onlyCurve {
        _mint(to, amount);
    }

    function burn(
        address from,
        uint256 amount
    ) external onlyCurve {
        _burn(from, amount);
    }
}

/**
 * @title  BondingCurve
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Pump.fun style token launch with automatic LP graduation
 * @dev Uses x * y = k style curve where price increases with supply
 *
 * FLOW:
 * 1. Creator launches token (Level 50 required)
 * 2. Users buy/sell on curve (price rises with buys)
 * 3. At GRADUATION_THRESHOLD, LP migrates to Uniswap
 * 4. LP tokens locked via LPVesting (6mo + 6mo vesting)
 */
contract BondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== STATE ====================

    /// @notice CHIP token (quote currency)
    IERC20 public immutable chip;

    /// @notice Uniswap Factory
    IUniswapV2Factory public immutable uniswapFactory;

    /// @notice Uniswap Router
    IUniswapV2Router02 public immutable uniswapRouter;

    /// @notice LP Vesting contract
    ILPVesting public immutable lpVesting;

    /// @notice XP Registry for level check
    IXPRegistry public immutable xpRegistry;

    /// @notice Owner
    address public owner;

    /// @notice Market cap threshold for graduation (in CHIP)
    uint256 public graduationThreshold = 60_000e18; // $60K worth of CHIP

    /// @notice Creation fee in CHIP
    uint256 public creationFee = 500e18; // 500 CHIP

    /// @notice Trading fee in bps (1% = 100)
    uint256 public tradingFeeBps = 100; // 1%

    // ==================== CURVE STATE ====================

    struct CurveInfo {
        address token;
        address creator;
        uint256 virtualChipReserve; // Virtual CHIP in curve
        uint256 virtualTokenReserve; // Virtual tokens in curve
        uint256 realChipReserve; // Actual CHIP deposited
        uint256 tokensSold; // Tokens bought from curve
        bool graduated; // Migrated to Uniswap
        address lpPair; // Uniswap pair (after graduation)
        uint256 createdAt;
    }

    /// @notice All curves by token address
    mapping(address => CurveInfo) public curves;

    /// @notice All tokens created
    address[] public allTokens;

    /// @notice Tokens by creator
    mapping(address => address[]) public tokensByCreator;

    // ==================== CONSTANTS ====================

    /// @notice Initial virtual reserves (determines starting price)
    uint256 public constant INITIAL_VIRTUAL_CHIP = 30_000e18; // 30K CHIP
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_000_000_000e18; // 1B tokens

    /// @notice Max supply that can be sold on curve (rest goes to LP)
    uint256 public constant CURVE_SUPPLY = 800_000_000e18; // 800M (80%)
    uint256 public constant LP_SUPPLY = 200_000_000e18; // 200M (20%)

    // ==================== EVENTS ====================

    event TokenLaunched(address indexed creator, address indexed token, string name, string symbol);

    event TokenBought(
        address indexed buyer,
        address indexed token,
        uint256 chipSpent,
        uint256 tokensReceived,
        uint256 newPrice
    );

    event TokenSold(
        address indexed seller,
        address indexed token,
        uint256 tokensSold,
        uint256 chipReceived,
        uint256 newPrice
    );

    event TokenGraduated(
        address indexed token, address indexed lpPair, uint256 chipLiquidity, uint256 tokenLiquidity
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event GraduationThresholdUpdated(uint256 newThreshold);
    event CreationFeeUpdated(uint256 newFee);

    // ==================== MODIFIERS ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "BondingCurve: only owner");
        _;
    }

    modifier onlyCasinoOwner() {
        require(xpRegistry.isCasinoOwner(msg.sender), "BondingCurve: Level 50 required");
        _;
    }

    modifier notGraduated(
        address token
    ) {
        require(!curves[token].graduated, "BondingCurve: already graduated");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        address _chip,
        address _uniswapFactory,
        address _uniswapRouter,
        address _lpVesting,
        address _xpRegistry,
        address _owner
    ) {
        require(_chip != address(0), "BondingCurve: zero chip");
        require(_uniswapFactory != address(0), "BondingCurve: zero factory");
        require(_uniswapRouter != address(0), "BondingCurve: zero router");
        require(_lpVesting != address(0), "BondingCurve: zero vesting");
        require(_xpRegistry != address(0), "BondingCurve: zero xpRegistry");
        require(_owner != address(0), "BondingCurve: zero owner");

        chip = IERC20(_chip);
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        lpVesting = ILPVesting(_lpVesting);
        xpRegistry = IXPRegistry(_xpRegistry);
        owner = _owner;
    }

    // ==================== LAUNCH ====================

    /**
     * @notice Launch a new token on bonding curve
     * @param name Token name
     * @param symbol Token symbol
     */
    function launchToken(
        string calldata name,
        string calldata symbol
    ) external onlyCasinoOwner nonReentrant returns (address token) {
        require(bytes(name).length > 0, "BondingCurve: empty name");
        require(bytes(symbol).length > 0, "BondingCurve: empty symbol");

        // Collect fee
        if (creationFee > 0) {
            chip.safeTransferFrom(msg.sender, owner, creationFee);
        }

        // Create token
        BondingCurveToken newToken = new BondingCurveToken(name, symbol);
        token = address(newToken);

        // Initialize curve
        curves[token] = CurveInfo({
            token: token,
            creator: msg.sender,
            virtualChipReserve: INITIAL_VIRTUAL_CHIP,
            virtualTokenReserve: INITIAL_VIRTUAL_TOKEN,
            realChipReserve: 0,
            tokensSold: 0,
            graduated: false,
            lpPair: address(0),
            createdAt: block.timestamp
        });

        allTokens.push(token);
        tokensByCreator[msg.sender].push(token);

        emit TokenLaunched(msg.sender, token, name, symbol);
    }

    // ==================== TRADING ====================

    /**
     * @notice Buy tokens with CHIP
     * @param token Token to buy
     * @param chipAmount CHIP to spend
     * @param minTokens Minimum tokens out (slippage protection)
     */
    function buy(
        address token,
        uint256 chipAmount,
        uint256 minTokens
    ) external nonReentrant notGraduated(token) returns (uint256 tokensOut) {
        require(chipAmount > 0, "BondingCurve: zero amount");
        CurveInfo storage curve = curves[token];
        require(curve.token != address(0), "BondingCurve: token not found");

        // Calculate tokens out using x*y=k
        uint256 fee = (chipAmount * tradingFeeBps) / 10_000;
        uint256 chipIn = chipAmount - fee;

        tokensOut = getAmountOut(chipIn, curve.virtualChipReserve, curve.virtualTokenReserve);
        require(tokensOut >= minTokens, "BondingCurve: slippage");
        require(curve.tokensSold + tokensOut <= CURVE_SUPPLY, "BondingCurve: sold out");

        // Update reserves
        curve.virtualChipReserve += chipIn;
        curve.virtualTokenReserve -= tokensOut;
        curve.realChipReserve += chipIn;
        curve.tokensSold += tokensOut;

        // Transfer CHIP
        chip.safeTransferFrom(msg.sender, address(this), chipAmount);
        if (fee > 0) {
            chip.safeTransfer(owner, fee);
        }

        // Mint tokens to buyer
        BondingCurveToken(token).mint(msg.sender, tokensOut);

        emit TokenBought(msg.sender, token, chipAmount, tokensOut, getCurrentPrice(token));

        // Check graduation
        if (curve.realChipReserve >= graduationThreshold) {
            _graduate(token);
        }
    }

    /**
     * @notice Sell tokens for CHIP
     * @param token Token to sell
     * @param tokenAmount Tokens to sell
     * @param minChip Minimum CHIP out (slippage protection)
     */
    function sell(
        address token,
        uint256 tokenAmount,
        uint256 minChip
    ) external nonReentrant notGraduated(token) returns (uint256 chipOut) {
        require(tokenAmount > 0, "BondingCurve: zero amount");
        CurveInfo storage curve = curves[token];
        require(curve.token != address(0), "BondingCurve: token not found");

        // Calculate CHIP out
        uint256 grossChipOut =
            getAmountOut(tokenAmount, curve.virtualTokenReserve, curve.virtualChipReserve);
        uint256 fee = (grossChipOut * tradingFeeBps) / 10_000;
        chipOut = grossChipOut - fee;

        require(chipOut >= minChip, "BondingCurve: slippage");
        require(chipOut <= curve.realChipReserve, "BondingCurve: insufficient liquidity");

        // Update reserves
        curve.virtualTokenReserve += tokenAmount;
        curve.virtualChipReserve -= grossChipOut;
        curve.realChipReserve -= grossChipOut;
        curve.tokensSold -= tokenAmount;

        // Burn tokens from seller
        BondingCurveToken(token).burn(msg.sender, tokenAmount);

        // Transfer CHIP
        chip.safeTransfer(msg.sender, chipOut);
        if (fee > 0) {
            chip.safeTransfer(owner, fee);
        }

        emit TokenSold(msg.sender, token, tokenAmount, chipOut, getCurrentPrice(token));
    }

    // ==================== GRADUATION ====================

    function _graduate(
        address token
    ) internal {
        CurveInfo storage curve = curves[token];
        curve.graduated = true;

        uint256 chipForLP = curve.realChipReserve;
        uint256 tokensForLP = LP_SUPPLY;

        // Resolve the pair BEFORE adding liquidity. addLiquidity would otherwise create
        // it internally, and a later createPair() reverts with "PAIR_EXISTS" — the bug
        // that bricked every graduation. Fetch an existing pair or create a fresh one.
        address pair = uniswapFactory.getPair(token, address(chip));
        if (pair == address(0)) {
            pair = uniswapFactory.createPair(token, address(chip));
        }
        curve.lpPair = pair;

        // Mint LP tokens to this contract and approve the router.
        BondingCurveToken(token).mint(address(this), tokensForLP);
        IERC20(token).approve(address(uniswapRouter), tokensForLP);
        chip.approve(address(uniswapRouter), chipForLP);

        // Add liquidity. Mins are 0 because a permanent brick (DoS) from a pre-seeded
        // pair is worse than the migration-MEV that strict mins would prevent; harden
        // the migration step for mainnet (permissioned/snapshot) per audit M3.
        (,, uint256 lpAmount) = uniswapRouter.addLiquidity(
            token, address(chip), tokensForLP, chipForLP, 0, 0, address(this), block.timestamp + 300
        );

        // Lock the real LP tokens via the vesting contract.
        IERC20(pair).approve(address(lpVesting), lpAmount);
        lpVesting.lockLP(pair, lpAmount, curve.creator);

        emit TokenGraduated(token, pair, chipForLP, tokensForLP);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "BondingCurve: zero input");
        require(reserveIn > 0 && reserveOut > 0, "BondingCurve: zero reserve");

        uint256 numerator = amountIn * reserveOut;
        uint256 denominator = reserveIn + amountIn;
        amountOut = numerator / denominator;
    }

    function getCurrentPrice(
        address token
    ) public view returns (uint256) {
        CurveInfo storage curve = curves[token];
        if (curve.virtualTokenReserve == 0) return 0;
        return (curve.virtualChipReserve * 1e18) / curve.virtualTokenReserve;
    }

    function getMarketCap(
        address token
    ) public view returns (uint256) {
        CurveInfo storage curve = curves[token];
        uint256 price = getCurrentPrice(token);
        return (price * curve.tokensSold) / 1e18;
    }

    function getProgress(
        address token
    ) external view returns (uint256 progressBps) {
        CurveInfo storage curve = curves[token];
        if (graduationThreshold == 0) return 10_000;
        progressBps = (curve.realChipReserve * 10_000) / graduationThreshold;
        if (progressBps > 10_000) progressBps = 10_000;
    }

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function getTokensByCreator(
        address creator
    ) external view returns (address[] memory) {
        return tokensByCreator[creator];
    }

    // ==================== ADMIN ====================

    function setGraduationThreshold(
        uint256 threshold
    ) external onlyOwner {
        graduationThreshold = threshold;
        emit GraduationThresholdUpdated(threshold);
    }

    function setCreationFee(
        uint256 fee
    ) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setTradingFee(
        uint256 bps
    ) external onlyOwner {
        require(bps <= 500, "BondingCurve: max 5%");
        tradingFeeBps = bps;
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "BondingCurve: zero owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
