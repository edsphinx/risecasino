// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { VyreJackCore } from "../src/games/casino/VyreJackCore.sol";
import { VyreCasino } from "../src/core/VyreCasino.sol";
import { VyreTreasury } from "../src/core/VyreTreasury.sol";
import { IVyreGame } from "../src/interfaces/IVyreGame.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title VyreCasinoForkTest
 * @notice Fork tests using actual Rise Testnet contracts
 * @dev Run with: forge test --match-contract VyreCasinoForkTest --fork-url $RISE_TESTNET_RPC -vvv
 */
contract VyreCasinoForkTest is Test {
    // Rise Testnet addresses
    address constant RISE_VRF = 0x9d57aB4517ba97349551C876a01a7580B1338909;
    address constant USDC = 0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8;

    VyreCasino public casino;
    VyreJackCore public game;
    VyreTreasury public treasury;

    address public deployer;
    address public player;

    function setUp() public {
        // Only run on fork
        if (block.chainid != 11_155_931) {
            vm.skip(true);
            return;
        }

        deployer = makeAddr("deployer");
        player = makeAddr("player");

        vm.startPrank(deployer);

        // Deploy Treasury
        treasury = new VyreTreasury(deployer);

        // Deploy Casino
        casino = new VyreCasino(
            address(treasury),
            USDC,
            deployer,
            deployer // buyback wallet
        );

        // Set casino as treasury operator
        treasury.setOperator(address(casino));

        // Deploy Game with real Rise VRF (UUPS pattern)
        VyreJackCore gameImpl = new VyreJackCore();
        bytes memory initData =
            abi.encodeWithSelector(VyreJackCore.initialize.selector, RISE_VRF, address(casino));
        ERC1967Proxy gameProxy = new ERC1967Proxy(address(gameImpl), initData);
        game = VyreJackCore(address(gameProxy));

        // Register game
        casino.registerGame(address(game));

        vm.stopPrank();

        // Fund player with CHIP (if CHIP exists on fork)
        deal(USDC, player, 1000e18);

        // Player approves casino
        vm.prank(player);
        IERC20(USDC).approve(address(casino), type(uint256).max);
    }

    function test_ForkDeployment() public view {
        if (block.chainid != 11_155_931) return;

        assertEq(address(casino.treasury()), address(treasury));
        assertTrue(casino.registeredGames(address(game)));
        assertEq(address(game.coordinator()), RISE_VRF);
    }

    function test_ForkVRFCoordinatorExists() public view {
        if (block.chainid != 11_155_931) return;

        // Verify VRF coordinator has code
        assertTrue(RISE_VRF.code.length > 0, "VRF coordinator should exist");
    }

    // Note: Actual gameplay tests with VRF require waiting for VRF callback
    // These are better tested manually or with longer timeout
}
