/**
 * WebSocket Event Service for VyreJack
 *
 * Provides real-time event monitoring using WebSocket and shreds,
 * similar to Meteoro's implementation.
 */

import { createPublicClient, webSocket, type Log } from 'viem';
import { shredActions } from 'shreds/viem';
import { riseTestnet, VYREJACK_ABI, VYREJACK_ADDRESS } from '@/lib/contract';
import { logger } from '@/lib/logger';
import type { GameResult } from '@vyrejack/shared';

// Rise Chain Testnet WebSocket URL
const WSS_URL = 'wss://testnet.riselabs.xyz/ws';

// Game state enum mapping from contract
const GameStateToResult: Record<number, GameResult> = {
  5: 'win', // PlayerWin
  6: 'lose', // DealerWin
  7: 'push', // Push
  8: 'blackjack', // PlayerBlackjack
};

export interface GameEndEvent {
  player: `0x${string}`;
  result: GameResult;
  payout: bigint;
}

// WebSocket client instance (singleton) - use any to allow extension
let wsClient:
  | (ReturnType<typeof createPublicClient> & {
      watchContractEvent: (...args: unknown[]) => () => void;
    })
  | null = null;
let eventUnwatch: (() => void) | null = null;

/**
 * Initialize WebSocket client for event monitoring
 */
export function initWebSocketClient(): typeof wsClient {
  if (wsClient) return wsClient;

  try {
    wsClient = createPublicClient({
      chain: riseTestnet as any,
      transport: webSocket(WSS_URL, { reconnect: { attempts: 20, delay: 1000 }, retryCount: 5 }),
    }).extend(shredActions) as any;

    logger.log('[WS] WebSocket client initialized');
    return wsClient;
  } catch (error) {
    logger.error('[WS] Failed to initialize WebSocket client:', error);
    return null;
  }
}

/**
 * Get the WebSocket client (initialize if needed)
 */
export function getWebSocketClient() {
  return wsClient || initWebSocketClient();
}

/**
 * Start monitoring GameEnded events for a specific player
 * @param playerAddress The player address to monitor
 * @param onGameEnd Callback when game ends
 * @returns Unwatch function to stop monitoring
 */
export function startGameEventMonitoring(
  playerAddress: `0x${string}`,
  onGameEnd: (event: GameEndEvent) => void
): () => void {
  const client = getWebSocketClient();

  if (!client) {
    logger.error('[WS] Cannot start monitoring - no WebSocket client');
    return () => {};
  }

  logger.log('[WS] Starting GameEnded event monitoring for:', playerAddress);

  try {
    const unwatch = client.watchContractEvent({
      address: VYREJACK_ADDRESS,
      abi: VYREJACK_ABI,
      eventName: 'GameEnded',
      args: {
        player: playerAddress,
      },
      onLogs: (logs: Log[]) => {
        logger.log('[WS] GameEnded events received:', logs.length);

        for (const log of logs) {
          try {
            // Parse the event data - logs from watchContractEvent have decoded args
            const eventLog = log as unknown as {
              args: { player: `0x${string}`; result: number; payout: bigint };
            };
            const args = eventLog.args;
            const result = GameStateToResult[args.result];

            if (result && args.player.toLowerCase() === playerAddress.toLowerCase()) {
              logger.log('[WS] GameEnded for player:', { result, payout: args.payout });
              onGameEnd({
                player: args.player,
                result,
                payout: args.payout,
              });
            }
          } catch (error) {
            logger.error('[WS] Error parsing GameEnded event:', error);
          }
        }
      },
      onError: (error: Error) => {
        logger.error('[WS] Event monitoring error:', error);
      },
    });

    eventUnwatch = unwatch;
    logger.log('[WS] Event monitoring started successfully');
    return unwatch;
  } catch (error) {
    logger.error('[WS] Failed to start event monitoring:', error);
    return () => {};
  }
}

/**
 * Stop all event monitoring
 */
export function stopEventMonitoring(): void {
  if (eventUnwatch) {
    eventUnwatch();
    eventUnwatch = null;
    logger.log('[WS] Event monitoring stopped');
  }
}

/**
 * Clean up WebSocket connection
 */
export function disconnectWebSocket(): void {
  stopEventMonitoring();
  wsClient = null;
  logger.log('[WS] WebSocket disconnected');
}

export const WebSocketService = {
  init: initWebSocketClient,
  getClient: getWebSocketClient,
  startGameMonitoring: startGameEventMonitoring,
  stopMonitoring: stopEventMonitoring,
  disconnect: disconnectWebSocket,
};
