/**
 * useGameEventsCasino - WebSocket-based event listener for VyreJackCore games
 *
 * Listens for:
 * - GameResolved: When game finishes with final values (v4 contracts)
 * - CardDealt: When a card is dealt (real-time card tracking)
 * - PlayerBusted: When player busts (for animations)
 * - DealerBusted: When dealer busts (for animations)
 * - DealerCardRevealed: When hole card is revealed
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { createPublicClient, webSocket } from 'viem';
import { riseTestnet, VYREJACKCORE_ADDRESS, VYRECASINO_ADDRESS } from '@/lib/contract';
import { VYREJACKCORE_ABI, VYRECASINO_ABI } from '@vyrejack/shared';
import { logger } from '@/lib/logger';
import type { GameResult } from '@vyrejack/shared';

// Rise Chain Testnet WebSocket URL
const WSS_URL = 'wss://testnet.riselabs.xyz/ws';

export interface GameResolvedEvent {
  result: GameResult;
  payout: bigint;
  playerFinalValue: number;
  dealerFinalValue: number;
}

export interface CardDealtEvent {
  card: number;
  isDealer: boolean;
  faceUp: boolean;
}

export interface BustedEvent {
  finalValue: number;
}

export interface CardRevealedEvent {
  card: number;
}

export interface XPAwardedEvent {
  amount: bigint;
}

interface GameEventsCasinoCallbacks {
  onGameResolved: (event: GameResolvedEvent) => void;
  onCardDealt?: (event: CardDealtEvent) => void;
  onPlayerBusted?: (event: BustedEvent) => void;
  onDealerBusted?: (event: BustedEvent) => void;
  onDealerCardRevealed?: (event: CardRevealedEvent) => void;
  onXPAwarded?: (event: XPAwardedEvent) => void;
}

/**
 * Hook for WebSocket-based VyreJackCore event listening (v4 contracts)
 */
export function useGameEventsCasino(
  playerAddress: `0x${string}` | null,
  callbacks: GameEventsCasinoCallbacks
) {
  const [isConnected, setIsConnected] = useState(false);
  const unwatchRefs = useRef<(() => void)[]>([]);
  const clientRef = useRef<ReturnType<typeof createPublicClient> | null>(null);

  // Deduplication: track processed events by txHash+logIndex
  const processedEvents = useRef<Set<string>>(new Set());

  // Stable callback refs
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!playerAddress) {
      setIsConnected(false);
      return;
    }

    // Clear processed events on new connection
    processedEvents.current.clear();

    logger.log('[GameEventsCasino] Starting WebSocket for:', playerAddress);

    try {
      // Create WebSocket client
      const client = createPublicClient({
        chain: riseTestnet as Parameters<typeof createPublicClient>[0]['chain'],
        transport: webSocket(WSS_URL),
      });
      clientRef.current = client;

      // Watch for GamePlayed events (V6 - actual event emitted by contract)
      // Note: Contract emits IVyreGame.GamePlayed, NOT GameResolved
      const unwatchGamePlayed = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'GamePlayed',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          logger.log('[GameEventsCasino] GamePlayed events:', logs.length);

          for (const log of logs) {
            // Deduplicate: skip if already processed
            const eventKey = `${log.transactionHash}-${log.logIndex}`;
            if (processedEvents.current.has(eventKey)) {
              logger.log('[GameEventsCasino] Skipping duplicate GamePlayed:', eventKey);
              continue;
            }
            processedEvents.current.add(eventKey);

            // GamePlayed signature: (player, token, bet, won, payout)
            const args = log.args as {
              player: `0x${string}`;
              token: `0x${string}`;
              bet: bigint;
              won: boolean;
              payout: bigint;
            };

            // Map 'won' boolean to GameResult
            // Note: GamePlayed doesn't distinguish blackjack from regular win
            const gameResult: GameResult = args.won
              ? (args.payout > args.bet * 2n ? 'blackjack' : 'win')
              : (args.payout === args.bet ? 'push' : 'lose');

            logger.log('[GameEventsCasino] GamePlayed:', {
              result: gameResult,
              won: args.won,
              bet: args.bet.toString(),
              payout: args.payout.toString(),
            });

            // Note: playerFinalValue and dealerFinalValue are not in GamePlayed event
            // They will be calculated from accumulated CardDealt events in useGameStateCasino
            callbacksRef.current.onGameResolved({
              result: gameResult,
              payout: args.payout,
              playerFinalValue: 0, // Will be filled from card accumulation
              dealerFinalValue: 0, // Will be filled from card accumulation
            });
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] GamePlayed error:', error);
        },
      });
      unwatchRefs.current.push(unwatchGamePlayed);

      // Watch for CardDealt events
      const unwatchCardDealt = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'CardDealt',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          logger.log('[GameEventsCasino] CardDealt events:', logs.length);

          for (const log of logs) {
            // Deduplicate: skip if already processed
            const eventKey = `${log.transactionHash}-${log.logIndex}`;
            if (processedEvents.current.has(eventKey)) {
              logger.log('[GameEventsCasino] Skipping duplicate CardDealt:', eventKey);
              continue;
            }
            processedEvents.current.add(eventKey);

            const args = log.args as {
              player: `0x${string}`;
              card: number | bigint;
              isDealer: boolean;
              faceUp: boolean;
            };

            const card = typeof args.card === 'bigint' ? Number(args.card) : args.card;

            logger.log('[GameEventsCasino] CardDealt:', {
              card,
              isDealer: args.isDealer,
              faceUp: args.faceUp,
            });

            if (callbacksRef.current.onCardDealt) {
              callbacksRef.current.onCardDealt({
                card,
                isDealer: args.isDealer,
                faceUp: args.faceUp,
              });
            }
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] CardDealt error:', error);
        },
      });
      unwatchRefs.current.push(unwatchCardDealt);

      // Watch for PlayerBusted events (v4 - for bust animations)
      const unwatchPlayerBusted = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'PlayerBusted',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as { finalValue: number };
            logger.log('[GameEventsCasino] PlayerBusted:', args.finalValue);
            if (callbacksRef.current.onPlayerBusted) {
              callbacksRef.current.onPlayerBusted({ finalValue: args.finalValue });
            }
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] PlayerBusted error:', error);
        },
      });
      unwatchRefs.current.push(unwatchPlayerBusted);

      // Watch for DealerBusted events (v4 - for bust animations)
      const unwatchDealerBusted = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'DealerBusted',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as { finalValue: number };
            logger.log('[GameEventsCasino] DealerBusted:', args.finalValue);
            if (callbacksRef.current.onDealerBusted) {
              callbacksRef.current.onDealerBusted({ finalValue: args.finalValue });
            }
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] DealerBusted error:', error);
        },
      });
      unwatchRefs.current.push(unwatchDealerBusted);

      // Watch for DealerCardRevealed events (v4 - for hole card reveal animation)
      const unwatchDealerRevealed = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'DealerCardRevealed',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as { card: number };
            logger.log('[GameEventsCasino] DealerCardRevealed:', args.card);
            if (callbacksRef.current.onDealerCardRevealed) {
              callbacksRef.current.onDealerCardRevealed({ card: args.card });
            }
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] DealerCardRevealed error:', error);
        },
      });
      unwatchRefs.current.push(unwatchDealerRevealed);

      // Watch for XPAwarded events from VyreCasino (v4 - for XP popup)
      const unwatchXPAwarded = client.watchContractEvent({
        address: VYRECASINO_ADDRESS,
        abi: VYRECASINO_ABI,
        eventName: 'XPAwarded',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          for (const log of logs) {
            const args = (log as any).args as { player: `0x${string}`; amount: bigint };
            logger.log('[GameEventsCasino] XPAwarded:', args.amount.toString());
            if (callbacksRef.current.onXPAwarded) {
              callbacksRef.current.onXPAwarded({ amount: args.amount });
            }
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] XPAwarded error:', error);
        },
      });
      unwatchRefs.current.push(unwatchXPAwarded);

      setIsConnected(true);
      logger.log('[GameEventsCasino] WebSocket connected - listening to 6 event types');
    } catch (error) {
      logger.error('[GameEventsCasino] Failed to start WebSocket:', error);
      setIsConnected(false);
    }

    // Cleanup
    return () => {
      logger.log('[GameEventsCasino] Stopping WebSocket');
      for (const unwatch of unwatchRefs.current) {
        unwatch();
      }
      unwatchRefs.current = [];
      clientRef.current = null;
      setIsConnected(false);
    };
  }, [playerAddress]);

  return { isConnected };
}
