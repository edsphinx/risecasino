/**
 * VyreCasino E2E Real Test Script (V3)
 * 
 * Matches frontend event handling:
 * - WebSocket to wss://testnet.riselabs.xyz/ws
 * - Listens for CardDealt and GamePlayed events
 * - Deduplication by txHash+logIndex
 * 
 * Run: DEPLOYER_PRIVATE_KEY=0x... npx ts-node test/e2e/realtest.ts
 */

import {
    createPublicClient,
    createWalletClient,
    http,
    webSocket,
    parseUnits,
    formatUnits,
    type Hex,
    type Address,
    parseAbi,
    type Log
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// =============================================================================
// CONFIG
// =============================================================================
const RISE_TESTNET = {
    id: 11155931,
    name: 'Rise Testnet',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: {
            http: ['https://testnet.riselabs.xyz'],
            webSocket: ['wss://testnet.riselabs.xyz/ws']
        }
    },
} as const;

const WSS_URL = 'wss://testnet.riselabs.xyz/ws';

const PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY || process.env.SIGNER_2_PRIVATE_KEY) as Hex;
if (!PRIVATE_KEY) throw new Error('Set DEPLOYER_PRIVATE_KEY or SIGNER_2_PRIVATE_KEY in .env');

// Deployed contracts (2026-01-20)
const CONTRACTS = {
    CASINO: '0x31F8598766488529B9294002a5373fC4b2F244b7' as Address,
    GAME: '0x961715D101DaadfE477c7A7C136dCBbca3A9ad10' as Address,
    TREASURY: '0x2be1229CEcF28702A50f68eD9592234a830845ae' as Address,
    USDC: '0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8' as Address,
};

const BET_AMOUNT = parseUnits('1', 6);

const CASINO_ABI = parseAbi([
    'function play(address game, address token, uint256 amount, bytes calldata data) external',
]);

// Full game ABI matching frontend
const GAME_ABI = parseAbi([
    'function hit() external',
    'function stand() external',
    'function double() external',
    'function games(address player) view returns (address player, address token, uint256 bet, uint8 state, uint256 timestamp, uint256 vrfRequestId)',
    // Events matching frontend useGameEvents.ts
    'event CardDealt(address indexed player, uint8 card, bool isDealer, bool faceUp)',
    'event GamePlayed(address indexed player, address indexed token, uint256 bet, bool won, uint256 payout)',
    'event PlayerBusted(address indexed player, uint8 finalValue)',
    'event DealerBusted(address indexed player, uint8 finalValue)',
    'event DealerCardRevealed(address indexed player, uint8 card)',
    'event HandValue(address indexed player, uint8 value, bool isSoft, bool isDealer)',
]);

const ERC20_ABI = parseAbi([
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
]);

// Correct GameState enum from VyreJackCore.sol
const GameState: Record<number, string> = {
    0: 'Idle',
    1: 'WaitingForDeal',
    2: 'PlayerTurn',
    3: 'WaitingForHit',
    4: 'WaitingForDouble',
    5: 'DealerTurn',
    6: 'PlayerWin',
    7: 'DealerWin',
    8: 'Push',
    9: 'PlayerBlackjack',
};

// =============================================================================
// EVENT TRACKING (matching frontend pattern)
// =============================================================================
const processedEvents = new Set<string>();
let cardsDealt: { card: number; isDealer: boolean; faceUp: boolean }[] = [];
let gameResult: { won: boolean; payout: bigint } | null = null;

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    console.log('\n🎰 VyreCasino Real E2E Test (V3 - Frontend Pattern)\n');
    console.log('='.repeat(50));

    const account = privateKeyToAccount(PRIVATE_KEY);

    // HTTP client for reads/writes
    const publicClient = createPublicClient({
        chain: RISE_TESTNET,
        transport: http()
    });

    // WebSocket client for instant events
    const wsClient = createPublicClient({
        chain: RISE_TESTNET,
        transport: webSocket(WSS_URL)
    });

    const walletClient = createWalletClient({
        account,
        chain: RISE_TESTNET,
        transport: http()
    });

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

    // Handle existing game states
    if (currentGame.state >= 1 && currentGame.state <= 5) {
        if (currentGame.state === 2) {
            console.log('\n🃏 Game is in PlayerTurn - executing STAND...');
            await executeStand(walletClient, wsClient, publicClient, account.address);
        } else {
            console.log(`\n⏳ Game in state ${GameState[currentGame.state]}, waiting...`);
            await waitForGameEnd(wsClient, publicClient, account.address, 30);
        }
        return;
    }

    if (currentGame.state !== 0) {
        console.log(`\n✅ Game already completed: ${GameState[currentGame.state]}`);
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

    // Clear state
    cardsDealt = [];
    gameResult = null;
    processedEvents.clear();

    // Subscribe to events BEFORE sending tx
    console.log('\n📡 Setting up WebSocket event listeners...');
    const { unwatches, gameEndPromise } = setupEventListeners(wsClient, account.address);

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

    // Wait for either game end OR player turn
    console.log('\n⏳ Waiting for VRF (CardDealt events)...');

    // Wait a bit for events to arrive
    await sleep(3000);

    // Check state
    const afterPlayState = await getGameState(publicClient, account.address);
    console.log(`\nGame State: ${GameState[afterPlayState.state]} (${afterPlayState.state})`);
    console.log(`Cards received: ${cardsDealt.length}`);

    if (cardsDealt.length > 0) {
        console.log('\n🃏 Cards dealt via WebSocket:');
        cardsDealt.forEach((c, i) => {
            console.log(`  ${i + 1}. ${formatCard(c.card)} (${c.isDealer ? 'Dealer' : 'Player'}${c.faceUp ? '' : ' - HIDDEN'})`);
        });
    }

    // If PlayerTurn, execute stand
    if (afterPlayState.state === 2) {
        console.log('\n🃏 Cards dealt! Executing STAND...');
        await executeStand(walletClient, wsClient, publicClient, account.address);
    } else if (afterPlayState.state >= 6) {
        // Game ended instantly (blackjack)
        console.log(`\n🎉 Game ended instantly: ${GameState[afterPlayState.state]}`);
    } else {
        console.log(`\n📋 Current state: ${GameState[afterPlayState.state]} - waiting...`);
        await waitForGameEnd(wsClient, publicClient, account.address, 30);
    }

    // Cleanup
    unwatches.forEach(unwatch => unwatch());
}

function setupEventListeners(wsClient: any, player: Address): { unwatches: (() => void)[]; gameEndPromise: Promise<void> } {
    const unwatches: (() => void)[] = [];

    let resolveGameEnd: () => void;
    const gameEndPromise = new Promise<void>(resolve => { resolveGameEnd = resolve; });

    // Watch CardDealt - matching frontend pattern
    const unwatchCards = wsClient.watchContractEvent({
        address: CONTRACTS.GAME,
        abi: GAME_ABI,
        eventName: 'CardDealt',
        args: { player },
        onLogs: (logs: any[]) => {
            for (const log of logs) {
                // Deduplicate
                const eventKey = `${log.transactionHash}-${log.logIndex}`;
                if (processedEvents.has(eventKey)) continue;
                processedEvents.add(eventKey);

                const card = typeof log.args.card === 'bigint' ? Number(log.args.card) : log.args.card;
                const isDealer = log.args.isDealer;
                const faceUp = log.args.faceUp;

                cardsDealt.push({ card, isDealer, faceUp });
                console.log(`  🃏 CardDealt: ${formatCard(card)} (${isDealer ? 'Dealer' : 'Player'}${faceUp ? '' : ' HIDDEN'})`);
            }
        }
    });
    unwatches.push(unwatchCards);

    // Watch GamePlayed - matching frontend (this is what contract actually emits)
    const unwatchGamePlayed = wsClient.watchContractEvent({
        address: CONTRACTS.GAME,
        abi: GAME_ABI,
        eventName: 'GamePlayed',
        onLogs: (logs: any[]) => {
            for (const log of logs) {
                // Filter by player
                if (log.args.player?.toLowerCase() !== player.toLowerCase()) continue;

                // Deduplicate
                const eventKey = `${log.transactionHash}-${log.logIndex}`;
                if (processedEvents.has(eventKey)) continue;
                processedEvents.add(eventKey);

                gameResult = {
                    won: log.args.won,
                    payout: log.args.payout
                };

                const resultStr = log.args.won
                    ? (log.args.payout > log.args.bet * 2n ? '🎰 BLACKJACK' : '🎉 WIN')
                    : (log.args.payout === log.args.bet ? '🤝 PUSH' : '😢 LOSE');

                console.log(`  💰 GamePlayed: ${resultStr} | Payout: ${formatUnits(log.args.payout, 6)} USDC`);
                resolveGameEnd();
            }
        }
    });
    unwatches.push(unwatchGamePlayed);

    // Watch DealerCardRevealed
    const unwatchReveal = wsClient.watchContractEvent({
        address: CONTRACTS.GAME,
        abi: GAME_ABI,
        eventName: 'DealerCardRevealed',
        args: { player },
        onLogs: (logs: any[]) => {
            for (const log of logs) {
                const card = typeof log.args.card === 'bigint' ? Number(log.args.card) : log.args.card;
                console.log(`  👁️ Dealer Hole Card Revealed: ${formatCard(card)}`);
            }
        }
    });
    unwatches.push(unwatchReveal);

    return { unwatches, gameEndPromise };
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

async function waitForGameEnd(wsClient: any, publicClient: any, player: Address, timeoutSeconds: number) {
    const startTime = Date.now();

    while ((Date.now() - startTime) < timeoutSeconds * 1000) {
        const state = await getGameState(publicClient, player);

        if (state.state === 0 || state.state >= 6) {
            console.log(`\n✅ Game ended: ${GameState[state.state]}`);
            return state;
        }

        await sleep(2000);
    }

    console.log('⏰ Timeout waiting for game end');
    return await getGameState(publicClient, player);
}

async function executeStand(walletClient: any, wsClient: any, publicClient: any, player: Address) {
    console.log('Executing STAND...');

    const hash = await walletClient.writeContract({
        address: CONTRACTS.GAME,
        abi: GAME_ABI,
        functionName: 'stand',
    });

    console.log(`TX: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);

    // Wait for game end events
    await sleep(3000);

    // Show cards dealt during dealer turn
    if (cardsDealt.filter(c => c.isDealer).length > 2) {
        console.log('\n🃏 Dealer drew additional cards:');
        cardsDealt.filter(c => c.isDealer).slice(2).forEach(c => {
            console.log(`  ${formatCard(c.card)}`);
        });
    }

    // Final state
    const finalState = await getGameState(publicClient, player);
    console.log(`\n📋 Final State: ${GameState[finalState.state]}`);

    if (gameResult) {
        const resultStr = gameResult.won ? '🎉 YOU WIN!' : '😢 You lose';
        console.log(`${resultStr} | Payout: ${formatUnits(gameResult.payout, 6)} USDC`);
    }
}

function formatCard(cardIndex: number): string {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suit = suits[Math.floor(cardIndex / 13)];
    const rank = ranks[cardIndex % 13];
    return `${rank}${suit}`;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
