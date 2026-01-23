import type { Address } from 'viem';

/**
 * Game state enum matching VyreJackCore.GameState exactly
 * IMPORTANT: Order must match the Solidity contract
 */
export enum GameState {
  Idle = 0, // No active game
  WaitingForDeal = 1, // Awaiting initial 4 cards from VRF
  PlayerTurn = 2, // Player can hit/stand/double/surrender
  WaitingForHit = 3, // Awaiting hit card from VRF
  WaitingForDouble = 4, // Awaiting double card from VRF
  DealerTurn = 5, // Dealer is drawing
  PlayerWin = 6, // Player won
  DealerWin = 7, // Dealer won
  Push = 8, // Tie - bet returned
  PlayerBlackjack = 9, // Player got natural 21
}

/**
 * Game data from smart contract
 */
export interface GameData {
  player: Address;
  bet: bigint;
  playerCards: readonly number[];
  dealerCards: readonly number[];
  state: GameState;
  timestamp: bigint;
  isDoubled: boolean;
}

/**
 * Hand value with soft indicator and game state
 */
export interface HandValue {
  value: number;
  isSoft: boolean;
  isBust: boolean;
  isBlackjack: boolean;
}

/**
 * Bet limits from contract
 */
export interface BetLimits {
  min: bigint;
  max: bigint;
}

/**
 * Game action types
 */
export type GameAction = 'hit' | 'stand' | 'double' | 'surrender';

/**
 * Game result for UI display
 */
export type GameResult = 'win' | 'lose' | 'push' | 'blackjack' | null;
