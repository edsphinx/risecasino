/**
 * VyreCasino E2E Real Test Script
 * 
 * Executes REAL transactions on Rise Testnet with REAL funds.
 * Tests full game flow including VRF callbacks.
 * 
 * Run: npx ts-node test/e2e/realtest.ts
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Hex, type Address, parseAbi, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// =============================================================================
// CONFIG
// =============================================================================
const RISE_TESTNET = {
    id: 11155931,
    name: 'Rise Testnet',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://testnet.riselabs.xyz'] } },
} as const;

// Load from .env
const PRIVATE_KEY = process.env.SECOND_SIGNER_PRIVATE_KEY as Hex;
if (!PRIVATE_KEY) throw new Error('Set SECOND_SIGNER_PRIVATE_KEY in .env');

// Deployed contracts
const CONTRACTS = {
    CASINO: '0xdb94B101A3Bba7aA7f6c75d9043fd3663820503C' as Address,
    GAME: '0xcDe1eA8E701b5eb34222edc2E155Fc241ad8154e' as Address,
    TREASURY: '0x2be1229CEcF28702A50f68eD9592234a830845ae' as Address,
    USDC: '0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8' as Address,
};

// Minimal bet (1 USDC)
const BET_AMOUNT = parseUnits('1', 6);

const CASINO_ABI = parseAbi([
    'function play(address game, address token, uint256 amount, bytes calldata data) external',
    'function setReferrer(address referrer) external',
]);

const GAME_ABI = parseAbi([
    'function hit() external',
    'function stand() external',
    'function double() external',
    'function games(address player) view returns (address player, address token, uint256 bet, uint8 state, uint256 timestamp, uint256 vrfRequestId)',
    'event CardDealt(address indexed player, uint8 card, bool isDealer)',
    'event GameStarted(address indexed player, address token, uint256 bet)',
    'event GameEnded(address indexed player, uint8 result, uint256 payout)',
]);

const ERC20_ABI = parseAbi([
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
]);

// Game states
const GameState: Record<number, string> = {
    0: 'None',
    1: 'PlayerTurn',
    2: 'WaitingVRF',
    3: 'DealerTurn',
    4: 'Resolved',
};

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    console.log('\n🎰 VyreCasino Real E2E Test\n');
    console.log('='.repeat(50));

    // Setup clients
    const account = privateKeyToAccount(PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: RISE_TESTNET, transport: http() });
    const walletClient = createWalletClient({ account, chain: RISE_TESTNET, transport: http() });

    console.log(`Wallet: ${account.address}`);

    // Check balances
    const ethBalance = await publicClient.getBalance({ address: account.address });
    const usdcBalance = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
    });

    console.log(`ETH: ${formatUnits(ethBalance, 18)}`);
    console.log(`USDC: ${formatUnits(usdcBalance, 6)}`);

    if (usdcBalance < BET_AMOUNT * 5n) {
        throw new Error('Insufficient USDC for tests');
    }

    // Check current game state
    console.log('\n📋 Checking current game state...');
    const currentGame = await getGameState(publicClient, account.address);
    console.log(`State: ${GameState[currentGame.state]} (${currentGame.state})`);
    console.log(`Bet: ${formatUnits(currentGame.bet, 6)} USDC`);

    if (currentGame.state === 2) {
        console.log('\n⏳ Game is in WaitingVRF state. Waiting for VRF callback...');
        await waitForVRF(publicClient, account.address, 60);
        return;
    }

    if (currentGame.state === 1) {
        console.log('\n🃏 Game is in PlayerTurn - executing HIT...');
        await executeHit(walletClient, publicClient, account.address);
        return;
    }

    if (currentGame.state !== 0) {
        console.log(`\n⚠️ Game in unexpected state: ${GameState[currentGame.state]}`);
        return;
    }

    // Ensure approval
    console.log('\n📝 Checking USDC approval...');
    const allowance = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, CONTRACTS.CASINO],
    });

    if (allowance < BET_AMOUNT * 10n) {
        console.log('Approving USDC...');
        const hash = await walletClient.writeContract({
            address: CONTRACTS.USDC,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [CONTRACTS.CASINO, parseUnits('1000000', 6)],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log('✅ Approved');
    } else {
        console.log('✅ Already approved');
    }

    // Start new game
    console.log('\n🎲 Starting new game with 1 USDC...');
    const playHash = await walletClient.writeContract({
        address: CONTRACTS.CASINO,
        abi: CASINO_ABI,
        functionName: 'play',
        args: [CONTRACTS.GAME, CONTRACTS.USDC, BET_AMOUNT, '0x'],
    });

    console.log(`TX: ${playHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: playHash });
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Gas: ${receipt.gasUsed.toString()}`);

    // Wait for VRF
    console.log('\n⏳ Waiting for VRF callback (up to 60s)...');
    const finalState = await waitForVRF(publicClient, account.address, 60);

    if (finalState.state === 1) {
        console.log('\n🃏 Game ready! Executing HIT...');
        await executeHit(walletClient, publicClient, account.address);
    }
}

async function getGameState(publicClient: any, player: Address) {
    try {
        const result = await publicClient.readContract({
            address: CONTRACTS.GAME,
            abi: GAME_ABI,
            functionName: 'games',
            args: [player],
        }) as any[];

        return {
            player: result[0] as Address,
            token: result[1] as Address,
            bet: result[2] as bigint,
            state: Number(result[3]),
            timestamp: result[4] as bigint,
            vrfRequestId: result[5] as bigint,
        };
    } catch (e) {
        return { player: '0x0' as Address, token: '0x0' as Address, bet: 0n, state: 0, timestamp: 0n, vrfRequestId: 0n };
    }
}

async function waitForVRF(publicClient: any, player: Address, timeoutSeconds: number) {
    const startTime = Date.now();
    let lastState = -1;

    while ((Date.now() - startTime) < timeoutSeconds * 1000) {
        const game = await getGameState(publicClient, player);

        if (game.state !== lastState) {
            console.log(`  State: ${GameState[game.state]} (${game.state})`);
            lastState = game.state;
        }

        // PlayerTurn means VRF completed and cards dealt
        if (game.state === 1) {
            console.log('✅ VRF callback received! Cards dealt.');
            return game;
        }

        // Resolved means instant blackjack or bust
        if (game.state === 4 || game.state === 0) {
            console.log('✅ Game resolved!');
            return game;
        }

        await sleep(2000);
    }

    console.log('⏰ VRF timeout - check manually');
    return await getGameState(publicClient, player);
}

async function executeHit(walletClient: any, publicClient: any, player: Address) {
    console.log('Executing HIT...');

    const hash = await walletClient.writeContract({
        address: CONTRACTS.GAME,
        abi: GAME_ABI,
        functionName: 'hit',
    });

    console.log(`TX: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);

    // Check new state
    const newState = await getGameState(publicClient, player);
    console.log(`New State: ${GameState[newState.state]}`);

    if (newState.state === 2) {
        console.log('Waiting for VRF after HIT...');
        await waitForVRF(publicClient, player, 30);
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
