// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * TABLEVAULT — SOCIAL TRADING / SHARED BANKROLL VAULT
 * -------------------------------------------------------------------------
 * ERC4626 vault for Level 40+ Casino Owners to create shared bankrolls.
 *
 * - Social Trading: Players deposit CHIP, earn/lose from table performance
 * - Performance Fees: Creator takes configurable fee from profits
 * - Cooldown Protection: Optional withdrawal lockup period
 * - Game Authorization: Only approved games can use bankroll
 * ------------------------------------------------------------------------*/

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IXPRegistry } from "../interfaces/IXPRegistry.sol";

/**
 * @title  TableVault
 * @author edsphinx
 * @custom:company Blocketh
 * @notice ERC4626 vault for social trading / shared bankrolls
 * @dev Casino Owners (Level 40+) can create vaults for community betting
 *
 * FLOW:
 * 1. Level 40+ creator creates vault with CHIP as underlying
 * 2. Players deposit CHIP, receive vault shares
 * 3. Creator's table uses vault as bankroll
 * 4. Profits/losses affect share value
 * 5. Players can withdraw anytime (with possible cooldown)
 */
contract TableVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== STATE ====================

    /// @notice Vault creator (table owner)
    address public immutable creator;

    /// @notice Table/vault name
    string public tableName;

    /// @notice Performance fee in bps (taken from profits)
    uint256 public performanceFee = 1000; // 10%

    /// @notice Withdrawal cooldown (0 = no cooldown)
    uint256 public withdrawalCooldown = 0;

    /// @notice Last deposit timestamp per user
    mapping(address => uint256) public lastDeposit;

    /// @notice High water mark for performance fee
    uint256 public highWaterMark;

    /// @notice Only authorized game contracts can use bankroll
    mapping(address => bool) public authorizedGames;

    /// @notice Creator has received their fee share
    uint256 public accumulatedFees;

    // ==================== EVENTS ====================

    event TableCreated(address indexed creator, string name, address asset);
    event ProfitDistributed(uint256 profit, uint256 creatorFee, uint256 stakerShare);
    event LossRecorded(uint256 loss);
    event GameAuthorized(address indexed game);
    event GameRevoked(address indexed game);
    event FeesClaimed(address indexed creator, uint256 amount);

    // ==================== MODIFIERS ====================

    modifier onlyCreator() {
        require(msg.sender == creator, "TableVault: only creator");
        _;
    }

    modifier onlyAuthorizedGame() {
        require(authorizedGames[msg.sender], "TableVault: not authorized game");
        _;
    }

    modifier cooldownPassed(
        address user
    ) {
        if (withdrawalCooldown > 0) {
            require(
                block.timestamp >= lastDeposit[user] + withdrawalCooldown,
                "TableVault: cooldown not passed"
            );
        }
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor(
        IERC20 _asset,
        string memory _tableName,
        address _creator
    )
        ERC4626(_asset)
        ERC20(string.concat("Table Vault: ", _tableName), string.concat("tv", _tableName))
    {
        require(_creator != address(0), "TableVault: zero creator");
        require(bytes(_tableName).length > 0, "TableVault: empty name");

        creator = _creator;
        tableName = _tableName;

        emit TableCreated(_creator, _tableName, address(_asset));
    }

    // ==================== DEPOSIT/WITHDRAW OVERRIDES ====================

    function deposit(
        uint256 assets,
        address receiver
    ) public override nonReentrant returns (uint256 shares) {
        lastDeposit[receiver] = block.timestamp;
        shares = super.deposit(assets, receiver);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant cooldownPassed(owner) returns (uint256 shares) {
        shares = super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant cooldownPassed(owner) returns (uint256 assets) {
        assets = super.redeem(shares, receiver, owner);
    }

    // ==================== GAME FUNCTIONS ====================

    /**
     * @notice Record profit from winning game (called by authorized game)
     * @param amount Profit amount in underlying asset
     */
    function recordProfit(
        uint256 amount
    ) external onlyAuthorizedGame {
        require(amount > 0, "TableVault: zero profit");

        // Transfer profit to vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate creator fee
        uint256 creatorFee = (amount * performanceFee) / 10_000;
        accumulatedFees += creatorFee;

        // Update high water mark
        uint256 currentAssets = totalAssets();
        if (currentAssets > highWaterMark) {
            highWaterMark = currentAssets;
        }

        emit ProfitDistributed(amount, creatorFee, amount - creatorFee);
    }

    /**
     * @notice Record loss from losing game (called by authorized game)
     * @param amount Loss amount to deduct from bankroll
     */
    function recordLoss(
        uint256 amount
    ) external onlyAuthorizedGame {
        require(amount > 0, "TableVault: zero loss");
        require(amount <= totalAssets(), "TableVault: loss exceeds assets");

        // Transfer loss from vault
        IERC20(asset()).safeTransfer(msg.sender, amount);

        emit LossRecorded(amount);
    }

    /**
     * @notice Get available bankroll for betting
     */
    function availableBankroll() external view returns (uint256) {
        uint256 total = totalAssets();
        return total > accumulatedFees ? total - accumulatedFees : 0;
    }

    // ==================== CREATOR FUNCTIONS ====================

    function authorizeGame(
        address game
    ) external onlyCreator {
        require(game != address(0), "TableVault: zero game");
        authorizedGames[game] = true;
        emit GameAuthorized(game);
    }

    function revokeGame(
        address game
    ) external onlyCreator {
        authorizedGames[game] = false;
        emit GameRevoked(game);
    }

    function claimFees() external onlyCreator nonReentrant {
        uint256 fees = accumulatedFees;
        require(fees > 0, "TableVault: no fees");
        require(fees <= totalAssets(), "TableVault: insufficient assets");

        accumulatedFees = 0;
        IERC20(asset()).safeTransfer(creator, fees);

        emit FeesClaimed(creator, fees);
    }

    function setPerformanceFee(
        uint256 bps
    ) external onlyCreator {
        require(bps <= 3000, "TableVault: max 30%");
        performanceFee = bps;
    }

    function setWithdrawalCooldown(
        uint256 seconds_
    ) external onlyCreator {
        require(seconds_ <= 7 days, "TableVault: max 7 days");
        withdrawalCooldown = seconds_;
    }

    // ==================== VIEW FUNCTIONS ====================

    function getVaultInfo()
        external
        view
        returns (
            address _creator,
            string memory _tableName,
            uint256 _totalAssets,
            uint256 _totalShares,
            uint256 _performanceFee,
            uint256 _accumulatedFees
        )
    {
        _creator = creator;
        _tableName = tableName;
        _totalAssets = totalAssets();
        _totalShares = totalSupply();
        _performanceFee = performanceFee;
        _accumulatedFees = accumulatedFees;
    }
}

/**
 * @title  TableVault
 * @author edsphinx
 * @custom:company BlockethFactory
 * @notice Factory for creating TableVault instances
 */
contract TableVaultFactory {
    using SafeERC20 for IERC20;

    /// @notice XP Registry for level verification
    IXPRegistry public immutable xpRegistry;

    /// @notice CHIP token
    IERC20 public immutable chip;

    /// @notice Owner
    address public owner;

    /// @notice All created vaults
    address[] public allVaults;

    /// @notice Vaults by creator
    mapping(address => address[]) public vaultsBy;

    /// @notice Vault creation fee
    uint256 public creationFee = 500e18; // 500 CHIP

    event VaultCreated(address indexed creator, address indexed vault, string name);

    modifier onlyOwner() {
        require(msg.sender == owner, "TableVaultFactory: only owner");
        _;
    }

    constructor(
        address _xpRegistry,
        address _chip,
        address _owner
    ) {
        require(_xpRegistry != address(0), "TableVaultFactory: zero xpRegistry");
        require(_chip != address(0), "TableVaultFactory: zero chip");
        require(_owner != address(0), "TableVaultFactory: zero owner");

        xpRegistry = IXPRegistry(_xpRegistry);
        chip = IERC20(_chip);
        owner = _owner;
    }

    function createVault(
        string calldata tableName
    ) external returns (address vault) {
        require(xpRegistry.canCreateVault(msg.sender), "TableVaultFactory: must be Level 40+");

        // Collect fee
        if (creationFee > 0) {
            chip.safeTransferFrom(msg.sender, owner, creationFee);
        }

        // Create vault
        TableVault newVault = new TableVault(chip, tableName, msg.sender);
        vault = address(newVault);

        allVaults.push(vault);
        vaultsBy[msg.sender].push(vault);

        emit VaultCreated(msg.sender, vault, tableName);
    }

    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function getVaultsByCreator(
        address _creator
    ) external view returns (address[] memory) {
        return vaultsBy[_creator];
    }

    function setCreationFee(
        uint256 fee
    ) external onlyOwner {
        creationFee = fee;
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "TableVaultFactory: zero owner");
        owner = newOwner;
    }
}
