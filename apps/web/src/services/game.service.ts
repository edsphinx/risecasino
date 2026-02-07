/**
 * Game Service - VyreJackCore Game State Operations
 *
 * Pure functions for reading game state from VyreJackCore.
 * Handles game data, hand values, bet limits.
 */

import { createPublicClient, http } from 'viem';
import { VYREJACKCORE_ABI, VyreJackGameState, type VyreJackGame } from '@vyrejack/shared';
import type { HandValue, BetLimits } from '@vyrejack/shared';
import { riseTestnet, VYREJACKCORE_ADDRESS } from '@/lib/contract';

// Shared public client
const publicClient = createPublicClient({
  chain: riseTestnet,
  transport: http(),
});

/**
 * Get game state for a player
 */
async function getGame(player: `0x${string}`): Promise<VyreJackGame | null> {
  try {
    const result = await publicClient.readContract({
      address: VYREJACKCORE_ADDRESS,
      abi: VYREJACKCORE_ABI,
      functionName: 'getGame',
      args: [player],
    });

    // Result is tuple: [token, bet, playerCards, dealerCards, state]
    const [token, bet, playerCards, dealerCards, state] = result;

    // If no active game, state will be Idle with zero values
    if (state === VyreJackGameState.Idle && bet === 0n) {
      return null;
    }

    return {
      player,
      token,
      bet,
      playerCards: [...playerCards],
      dealerCards: [...dealerCards],
      state: state as VyreJackGameState,
      timestamp: 0n, // Not returned by getGame
      isDoubled: false, // Not returned by getGame
    };
  } catch {
    return null;
  }
}

/**
 * Calculate hand value (pure function on contract)
 */
async function calculateHandValue(cards: number[]): Promise<HandValue> {
  const [value, isSoft] = await publicClient.readContract({
    address: VYREJACKCORE_ADDRESS,
    abi: VYREJACKCORE_ABI,
    functionName: 'calculateHandValue',
    args: [cards.map((c) => c as number)],
  });

  return {
    value,
    isSoft,
    isBust: value > 21,
    isBlackjack: value === 21 && cards.length === 2,
  };
}

/**
 * Get bet limits for a token
 */
async function getBetLimits(token: `0x${string}`): Promise<BetLimits> {
  const [min, max] = await Promise.all([
    publicClient.readContract({
      address: VYREJACKCORE_ADDRESS,
      abi: VYREJACKCORE_ABI,
      functionName: 'minBet',
      args: [token],
    }),
    publicClient.readContract({
      address: VYREJACKCORE_ADDRESS,
      abi: VYREJACKCORE_ABI,
      functionName: 'maxBet',
      args: [token],
    }),
  ]);

  return { min, max };
}

/**
 * Check if game is active
 */
async function isActive(): Promise<boolean> {
  return publicClient.readContract({
    address: VYREJACKCORE_ADDRESS,
    abi: VYREJACKCORE_ABI,
    functionName: 'isActive',
  });
}

/**
 * Get full game data with hand values calculated
 */
async function getFullGameData(player: `0x${string}`) {
  const game = await getGame(player);
  if (!game) {
    return null;
  }

  const [playerValue, dealerValue] = await Promise.all([
    calculateHandValue([...game.playerCards]),
    game.dealerCards.length > 0
      ? calculateHandValue([game.dealerCards[0]]) // Only visible card
      : Promise.resolve({ value: 0, isSoft: false, isBust: false, isBlackjack: false }),
  ]);

  return {
    game,
    playerValue,
    dealerValue: dealerValue.value,
  };
}

export const GameService = {
  getGame,
  calculateHandValue,
  getBetLimits,
  isActive,
  getFullGameData,
  publicClient,
  address: VYREJACKCORE_ADDRESS,
} as const;
