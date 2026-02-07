/**
 * Centralized ABI exports
 *
 * All contract ABIs for frontend and backend use.
 * Single source of truth for blockchain interactions.
 */

// Legacy standalone Blackjack (uses ETH)
export const BLACKJACK_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    inputs: [{ name: 'commitHash', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'hit',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stand',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'double',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'surrender',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getGameState',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'player', type: 'address' },
          { name: 'bet', type: 'uint256' },
          { name: 'playerCards', type: 'uint8[]' },
          { name: 'dealerCards', type: 'uint8[]' },
          { name: 'state', type: 'uint8' },
          { name: 'commitHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'calculateHandValue',
    inputs: [{ name: 'cards', type: 'uint8[]' }],
    outputs: [
      { name: 'value', type: 'uint8' },
      { name: 'isSoft', type: 'bool' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'minBet',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxBet',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'GameStarted',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'bet', type: 'uint256', indexed: false },
      { name: 'commitHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CardDealt',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'card', type: 'uint8', indexed: false },
      { name: 'isDealer', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PlayerAction',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'action', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GameEnded',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'result', type: 'uint8', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
] as const;

export type BlackjackABI = typeof BLACKJACK_ABI;

// VyreCasino architecture ABIs
export { VYRECASINO_ABI } from './VyreCasino';
export { VYREJACKCORE_ABI } from './VyreJackCore';
export { ERC20_ABI } from './ERC20';
export { CHIP_FAUCET_ABI } from './CHIPFaucet';

// Type exports derived from constants
export type VyreCasinoABI = typeof import('./VyreCasino').VYRECASINO_ABI;
export type VyreJackCoreABI = typeof import('./VyreJackCore').VYREJACKCORE_ABI;
export type ERC20ABI = typeof import('./ERC20').ERC20_ABI;
export type ChipFaucetABI = typeof import('./CHIPFaucet').CHIP_FAUCET_ABI;

// Legacy alias - use VYREJACKCORE_ABI for new code
export { VYREJACKCORE_ABI as VYREJACK_ABI } from './VyreJackCore';
