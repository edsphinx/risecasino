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

// GameState enum mapping from contract - V6 VALUES!
// Must match VyreJackCore.sol GameState enum exactly:
// Idle=0, WaitingForDeal=1, PlayerTurn=2, WaitingForHit=3, PlayerWin=4,
// DealerWin=5, Push=6, PlayerBlackjack=7, DealerTurn=8
const GAME_STATE_TO_RESULT: Record<number, GameResult> = {
  4: 'win', // PlayerWin
  5: 'lose', // DealerWin
  6: 'push', // Push
  7: 'blackjack', // PlayerBlackjack
};

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

      // Watch for GameResolved events (v4 - now properly emitted!)
      const unwatchGameResolved = client.watchContractEvent({
        address: VYREJACKCORE_ADDRESS,
        abi: VYREJACKCORE_ABI,
        eventName: 'GameResolved',
        args: {
          player: playerAddress,
        },
        onLogs: (logs) => {
          logger.log('[GameEventsCasino] GameResolved events:', logs.length);

          for (const log of logs) {
            // Deduplicate: skip if already processed
            const eventKey = `${log.transactionHash}-${log.logIndex}`;
            if (processedEvents.current.has(eventKey)) {
              logger.log('[GameEventsCasino] Skipping duplicate GameResolved:', eventKey);
              continue;
            }
            processedEvents.current.add(eventKey);

            const args = log.args as {
              player: `0x${string}`;
              result: number;
              payout: bigint;
              playerFinalValue: number;
              dealerFinalValue: number;
            };

            const gameResult = GAME_STATE_TO_RESULT[args.result] || 'lose';

            logger.log('[GameEventsCasino] GameResolved:', {
              result: gameResult,
              payout: args.payout.toString(),
              playerValue: args.playerFinalValue,
              dealerValue: args.dealerFinalValue,
            });

            callbacksRef.current.onGameResolved({
              result: gameResult,
              payout: args.payout,
              playerFinalValue: args.playerFinalValue,
              dealerFinalValue: args.dealerFinalValue,
            });
          }
        },
        onError: (error) => {
          logger.error('[GameEventsCasino] GameResolved error:', error);
        },
      });
      unwatchRefs.current.push(unwatchGameResolved);

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
