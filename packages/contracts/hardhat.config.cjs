require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

/**
 * Hardhat Configuration for Rise Casino
 * 
 * PURPOSE: 
 * - Contract verification on Blockscout
 * - E2E tests against Rise Testnet (real transactions)
 * 
 * E2E Tests: npx hardhat test test/e2e/*.ts --network rise
 */

// Load private keys from .env (optional for verification-only)
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const SECOND_SIGNER_PRIVATE_KEY = process.env.SECOND_SIGNER_PRIVATE_KEY || "";

// Only add accounts if keys are provided
const accounts = [SECOND_SIGNER_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY].filter(k => k && k.length > 0);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            // viaIR enabled to match Foundry CI profile for verification consistency
            viaIR: true,
            evmVersion: "prague",
        },
    },
    networks: {
        rise: {
            url: "https://testnet.riselabs.xyz",
            chainId: 11155931,
            accounts: accounts.length > 0 ? accounts : undefined,
            timeout: 120000, // 2 minutes for VRF callbacks
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
    },
    sourcify: {
        enabled: false,
    },
    etherscan: {
        apiKey: {
            rise: "no-api-key-needed",
        },
        customChains: [
            {
                network: "rise",
                chainId: 11155931,
                urls: {
                    apiURL: "https://explorer.testnet.riselabs.xyz/api",
                    browserURL: "https://explorer.testnet.riselabs.xyz",
                },
            },
        ],
    },
    paths: {
        sources: "./src",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    mocha: {
        timeout: 180000, // 3 minutes for E2E tests with VRF
    },
};

