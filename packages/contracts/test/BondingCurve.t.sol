// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { BondingCurve } from "../src/vaults/BondingCurve.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mock CHIP token
contract MockCHIP is ERC20 {
    constructor() ERC20("MockCHIP", "CHIP") {
        _mint(msg.sender, 10_000_000e18);
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Mock XP Registry
contract MockXPRegistry {
    mapping(address => bool) public casinoOwners;

    function isCasinoOwner(
        address user
    ) external view returns (bool) {
        return casinoOwners[user];
    }

    function setCasinoOwner(
        address user,
        bool is_
    ) external {
        casinoOwners[user] = is_;
    }
}

/// @dev Mock LP pair token (a real contract so approve()/IERC20 calls succeed)
contract MockPair is ERC20 {
    constructor() ERC20("LP", "LP") { }
}

/// @dev Mock Uniswap Factory — mimics real Uniswap: createPair reverts if the pair
///      already exists ("PAIR_EXISTS"), which is exactly what the old _graduate hit.
contract MockUniFactory {
    mapping(bytes32 => address) internal _pairs;

    function _key(
        address a,
        address b
    ) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function getPair(
        address a,
        address b
    ) external view returns (address) {
        return _pairs[_key(a, b)];
    }

    function createPair(
        address a,
        address b
    ) external returns (address pair) {
        bytes32 k = _key(a, b);
        require(_pairs[k] == address(0), "PAIR_EXISTS");
        pair = address(new MockPair());
        _pairs[k] = pair;
    }
}

/// @dev Mock Uniswap Router — mimics real Uniswap: addLiquidity creates the pair if
///      it does not exist yet.
contract MockUniRouter {
    MockUniFactory public factory;

    function setFactory(
        address f
    ) external {
        factory = MockUniFactory(f);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256,
        uint256,
        uint256,
        uint256,
        address,
        uint256
    ) external returns (uint256, uint256, uint256) {
        if (factory.getPair(tokenA, tokenB) == address(0)) {
            factory.createPair(tokenA, tokenB);
        }
        return (0, 0, 1000e18);
    }
}

/// @dev Mock LP Vesting — records the lock (matches ILPVesting.lockLP)
contract MockLPVesting {
    address public lastPair;
    uint256 public lastAmount;
    address public lastBeneficiary;

    function lockLP(
        address pair,
        uint256 amount,
        address beneficiary
    ) external {
        lastPair = pair;
        lastAmount = amount;
        lastBeneficiary = beneficiary;
    }
}

/**
 * @title BondingCurve Test Suite
 * @notice Tests for pump.fun style token launches
 */
contract BondingCurveTest is Test {
    BondingCurve curve;
    MockCHIP chip;
    MockXPRegistry xpRegistry;
    MockUniFactory uniFactory;
    MockUniRouter uniRouter;
    MockLPVesting lpVesting;

    address owner = address(this);
    address creator = address(0x1000);
    address buyer1 = address(0x2000);
    address buyer2 = address(0x3000);

    function setUp() public {
        chip = new MockCHIP();
        xpRegistry = new MockXPRegistry();
        uniFactory = new MockUniFactory();
        uniRouter = new MockUniRouter();
        uniRouter.setFactory(address(uniFactory));
        lpVesting = new MockLPVesting();

        curve = new BondingCurve(
            address(chip),
            address(uniFactory),
            address(uniRouter),
            address(lpVesting),
            address(xpRegistry),
            owner
        );

        // Setup
        xpRegistry.setCasinoOwner(creator, true);
        chip.mint(creator, 1_000_000e18);
        chip.mint(buyer1, 100_000e18);
        chip.mint(buyer2, 100_000e18);

        // Pre-approve curve for creator (launch fees)
        vm.prank(creator);
        chip.approve(address(curve), type(uint256).max);

        vm.label(address(curve), "BondingCurve");
        vm.label(creator, "Creator");
        vm.label(buyer1, "Buyer1");
    }

    // ==================== DEPLOYMENT ====================

    function test_Deployment() public view {
        assertEq(address(curve.chip()), address(chip));
        assertEq(curve.owner(), owner);
        assertEq(curve.graduationThreshold(), 60_000e18);
    }

    function test_ConstructorZeroChip() public {
        vm.expectRevert("BondingCurve: zero chip");
        new BondingCurve(
            address(0),
            address(uniFactory),
            address(uniRouter),
            address(lpVesting),
            address(xpRegistry),
            owner
        );
    }

    function test_ConstructorZeroFactory() public {
        vm.expectRevert("BondingCurve: zero factory");
        new BondingCurve(
            address(chip),
            address(0),
            address(uniRouter),
            address(lpVesting),
            address(xpRegistry),
            owner
        );
    }

    function test_ConstructorZeroRouter() public {
        vm.expectRevert("BondingCurve: zero router");
        new BondingCurve(
            address(chip),
            address(uniFactory),
            address(0),
            address(lpVesting),
            address(xpRegistry),
            owner
        );
    }

    function test_ConstructorZeroVesting() public {
        vm.expectRevert("BondingCurve: zero vesting");
        new BondingCurve(
            address(chip),
            address(uniFactory),
            address(uniRouter),
            address(0),
            address(xpRegistry),
            owner
        );
    }

    function test_ConstructorZeroXPRegistry() public {
        vm.expectRevert("BondingCurve: zero xpRegistry");
        new BondingCurve(
            address(chip),
            address(uniFactory),
            address(uniRouter),
            address(lpVesting),
            address(0),
            owner
        );
    }

    function test_ConstructorZeroOwner() public {
        vm.expectRevert("BondingCurve: zero owner");
        new BondingCurve(
            address(chip),
            address(uniFactory),
            address(uniRouter),
            address(lpVesting),
            address(xpRegistry),
            address(0)
        );
    }

    function test_LaunchToken() public {
        vm.prank(creator);
        address token = curve.launchToken("TestMeme", "TMEME");

        assertNotEq(token, address(0));

        // Verify token is in list
        address[] memory tokens = curve.getAllTokens();
        assertEq(tokens.length, 1);
        assertEq(tokens[0], token);
    }

    function test_LaunchTokenNotCasinoOwner() public {
        vm.prank(buyer1); // Not Level 50
        vm.expectRevert("BondingCurve: Level 50 required");
        curve.launchToken("Fail", "FAIL");
    }

    function test_LaunchTokenEmptyName() public {
        vm.prank(creator);
        vm.expectRevert("BondingCurve: empty name");
        curve.launchToken("", "SYM");
    }

    function test_LaunchTokenEmptySymbol() public {
        vm.prank(creator);
        vm.expectRevert("BondingCurve: empty symbol");
        curve.launchToken("Name", "");
    }

    // ==================== BUY ====================

    function test_Buy() public {
        vm.prank(creator);
        address token = curve.launchToken("BuyTest", "BUY");

        vm.startPrank(buyer1);
        chip.approve(address(curve), 1000e18);
        uint256 tokensOut = curve.buy(token, 1000e18, 0);
        vm.stopPrank();

        assertGt(tokensOut, 0);
        assertEq(IERC20(token).balanceOf(buyer1), tokensOut);
    }

    function test_buy_graduatesAtThreshold() public {
        vm.prank(creator);
        address token = curve.launchToken("Grad", "GRAD");

        // One large buy crosses the 60K CHIP graduation threshold (chipIn well within
        // CURVE_SUPPLY). This must graduate the token, not revert.
        vm.startPrank(buyer1);
        chip.approve(address(curve), 90_000e18);
        curve.buy(token, 90_000e18, 0);
        vm.stopPrank();

        (,,,,,, bool graduated, address lpPair,) = curve.curves(token);
        assertTrue(graduated, "token should be graduated");
        assertTrue(lpPair != address(0), "lp pair must be set");
        // LP was locked for the creator via vesting.
        assertEq(lpVesting.lastBeneficiary(), creator, "LP locked for creator");
    }

    function test_BuyZeroAmount() public {
        vm.prank(creator);
        address token = curve.launchToken("ZeroBuy", "ZB");

        vm.prank(buyer1);
        vm.expectRevert("BondingCurve: zero amount");
        curve.buy(token, 0, 0);
    }

    function test_BuySlippageProtection() public {
        vm.prank(creator);
        address token = curve.launchToken("Slippage", "SLIP");

        vm.startPrank(buyer1);
        chip.approve(address(curve), 1000e18);
        vm.expectRevert("BondingCurve: slippage");
        curve.buy(token, 1000e18, type(uint256).max); // Impossible min
        vm.stopPrank();
    }

    // ==================== SELL ====================

    function test_Sell() public {
        vm.prank(creator);
        address token = curve.launchToken("SellTest", "SELL");

        // Buy first
        vm.startPrank(buyer1);
        chip.approve(address(curve), 1000e18);
        uint256 bought = curve.buy(token, 1000e18, 0);

        // Approve and sell
        IERC20(token).approve(address(curve), bought);
        uint256 chipBack = curve.sell(token, bought / 2, 0);
        vm.stopPrank();

        assertGt(chipBack, 0);
    }

    function test_SellZeroAmount() public {
        vm.prank(creator);
        address token = curve.launchToken("ZeroSell", "ZS");

        vm.prank(buyer1);
        vm.expectRevert("BondingCurve: zero amount");
        curve.sell(token, 0, 0);
    }

    function test_SellSlippageProtection() public {
        vm.prank(creator);
        address token = curve.launchToken("SellSlip", "SS");

        vm.startPrank(buyer1);
        chip.approve(address(curve), 1000e18);
        uint256 bought = curve.buy(token, 1000e18, 0);

        IERC20(token).approve(address(curve), bought);
        vm.expectRevert("BondingCurve: slippage");
        curve.sell(token, bought, type(uint256).max);
        vm.stopPrank();
    }

    // ==================== VIEW FUNCTIONS ====================

    function test_GetCurrentPrice() public {
        vm.prank(creator);
        address token = curve.launchToken("Price", "PRC");

        uint256 price = curve.getCurrentPrice(token);
        assertGt(price, 0);
    }

    function test_GetProgress() public {
        vm.prank(creator);
        address token = curve.launchToken("Progress", "PRG");

        uint256 progress = curve.getProgress(token);
        assertEq(progress, 0); // No buys yet
    }

    function test_GetAmountOut() public view {
        uint256 amountOut = curve.getAmountOut(100e18, 1000e18, 1000e18);
        // Should be less than input due to curve
        assertGt(amountOut, 0);
        assertLt(amountOut, 100e18);
    }

    function test_GetAmountOutZeroInput() public {
        vm.expectRevert("BondingCurve: zero input");
        curve.getAmountOut(0, 1000e18, 1000e18);
    }

    function test_GetAmountOutZeroReserve() public {
        vm.expectRevert("BondingCurve: zero reserve");
        curve.getAmountOut(100e18, 0, 1000e18);
    }

    function test_GetAllTokens() public {
        vm.prank(creator);
        curve.launchToken("Token1", "T1");

        vm.prank(creator);
        curve.launchToken("Token2", "T2");

        address[] memory tokens = curve.getAllTokens();
        assertEq(tokens.length, 2);
    }

    function test_GetTokensByCreator() public {
        vm.startPrank(creator);
        curve.launchToken("My1", "M1");
        curve.launchToken("My2", "M2");
        vm.stopPrank();

        address[] memory tokens = curve.getTokensByCreator(creator);
        assertEq(tokens.length, 2);
    }

    // ==================== ADMIN ====================

    function test_SetGraduationThreshold() public {
        curve.setGraduationThreshold(100_000e18);
        assertEq(curve.graduationThreshold(), 100_000e18);
    }

    function test_SetGraduationThresholdOnlyOwner() public {
        vm.prank(buyer1);
        vm.expectRevert("BondingCurve: only owner");
        curve.setGraduationThreshold(100_000e18);
    }

    function test_TransferOwnership() public {
        curve.transferOwnership(creator);
        assertEq(curve.owner(), creator);
    }

    function test_TransferOwnershipZeroAddress() public {
        vm.expectRevert("BondingCurve: zero owner");
        curve.transferOwnership(address(0));
    }
}
