// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/games/casino/VyreJackCore.sol";

/**
 * @title UpgradeVyreJackCore
 * @notice Deploys new VyreJackCore implementation and upgrades proxy
 * @dev Run: forge script script/UpgradeVyreJackCore.s.sol --rpc-url $RISE_RPC --broadcast --verify
 */
contract UpgradeVyreJackCore is Script {
    address constant PROXY = 0x961715D101DaadfE477c7A7C136dCBbca3A9ad10;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console.log("=== VyreJackCore UUPS Upgrade ===");
        console.log("Proxy address:", PROXY);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        VyreJackCore newImpl = new VyreJackCore();
        console.log("New implementation deployed:", address(newImpl));

        // Upgrade proxy
        VyreJackCore proxy = VyreJackCore(PROXY);
        console.log("Current owner:", proxy.owner());

        proxy.upgradeToAndCall(address(newImpl), "");
        console.log("Upgrade successful!");

        vm.stopBroadcast();

        console.log("\n=== Upgrade Complete ===");
        console.log("Proxy (unchanged):", PROXY);
        console.log("New implementation:", address(newImpl));
    }
}
