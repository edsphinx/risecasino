/**
 * Live Activity Service
 *
 * Subscribes to ALL GamePlayed events via Shreds WebSocket
 * for real-time activity ticker on homepage.
 *
 * V8: Updated to use VyreJackCore and GamePlayed event
 */

import { createPublicClient, webSocket, type Log } from 'viem';
import { shredActions } from 'shreds/viem';
import { riseTestnet, VYREJACKCORE_ADDRESS } from '@/lib/contract';
import { VYREJACKCORE_ABI } from '@vyrejack/shared';
import { logger } from '@/lib/logger';
import type { GameResult } from '@vyrejack/shared';

const WSS_URL = 'wss://testnet.riselabs.xyz/ws';

export interface LiveWinEvent {
  address: string;
  amount: number;
  game: string;
  result: GameResult;
  timestamp: number;
}

type LiveWinCallback = (win: LiveWinEvent) => void;

// Singleton state
let wsClient: ReturnType<typeof createPublicClient> | null = null;
let unwatch: (() => void) | null = null;
const subscribers = new Set<LiveWinCallback>();
const recentWins: LiveWinEvent[] = [];
const MAX_WINS = 20;

/**
 * Initialize the shreds WebSocket client
 */
function initClient() {
  if (wsClient) return wsClient;

  try {
    wsClient = createPublicClient({
      chain: riseTestnet as any,
      transport: webSocket(WSS_URL, { reconnect: { attempts: 20, delay: 1000 }, retryCount: 5 }),
    }).extend(shredActions) as any;

    logger.log('[LiveActivity] Shreds WebSocket client initialized');
    return wsClient;
  } catch (error) {
    logger.error('[LiveActivity] Failed to initialize:', error);
    return null;
  }
}

/**
 * Start watching for all GamePlayed events (V8)
 */
function startWatching() {
  if (unwatch) return; // Already watching

  const client = initClient();
  if (!client) return;

  try {
    // V8: Watch GamePlayed event (emitted by VyreJackCore)
    unwatch = (client as any).watchContractEvent({
      address: VYREJACKCORE_ADDRESS,
      abi: VYREJACKCORE_ABI,
      eventName: 'GamePlayed',
      onLogs: (logs: Log[]) => {
        for (const log of logs) {
          try {
            // GamePlayed event: (player, token, bet, won, payout)
            const eventLog = log as unknown as {
              args: {
                player: `0x${string}`;
                token: `0x${string}`;
                bet: bigint;
                won: boolean;
                payout: bigint;
              };
            };
            const args = eventLog.args;

            // Determine result from won flag and payout
            let result: GameResult = 'lose';
            if (args.won) {
              // Blackjack pays 3:2, so payout > bet * 2 indicates blackjack
              result = args.payout > args.bet * 2n ? 'blackjack' : 'win';
            } else if (args.payout === args.bet) {
              result = 'push';
            }

            // Only show wins (not losses/pushes)
            if (result === 'win' || result === 'blackjack') {
              // Format amount based on token decimals (USDC = 6, CHIP = 18)
              // For simplicity, assume USDC (6 decimals) for display
              const amount = Number(args.payout) / 1e6;

              const win: LiveWinEvent = {
                address: `${args.player.slice(0, 6)}...${args.player.slice(-4)}`,
                amount,
                game: 'VyreJack',
                result,
                timestamp: Date.now(),
              };

              // Add to recent wins
              recentWins.unshift(win);
              if (recentWins.length > MAX_WINS) {
                recentWins.pop();
              }

              // Notify all subscribers
              for (const callback of subscribers) {
                try {
                  callback(win);
                } catch (err) {
                  logger.error('[LiveActivity] Subscriber error:', err);
                }
              }

              logger.log('[LiveActivity] New win:', win);
            }
          } catch (error) {
            logger.error('[LiveActivity] Error parsing event:', error);
          }
        }
      },
      onError: (error: Error) => {
        logger.error('[LiveActivity] WebSocket error:', error);
      },
    });

    logger.log('[LiveActivity] Started watching GamePlayed events (V8)');
  } catch (error) {
    logger.error('[LiveActivity] Failed to start watching:', error);
  }
}

/**
 * Subscribe to live wins
 */
export function subscribeLiveWins(callback: LiveWinCallback): () => void {
  subscribers.add(callback);

  // Start watching if first subscriber
  if (subscribers.size === 1) {
    startWatching();
  }

  // Return unsubscribe function
  return () => {
    subscribers.delete(callback);

    // Stop watching if no more subscribers
    if (subscribers.size === 0 && unwatch) {
      unwatch();
      unwatch = null;
      logger.log('[LiveActivity] Stopped watching (no subscribers)');
    }
  };
}

/**
 * Get recent wins (for initial render)
 */
export function getRecentWins(): LiveWinEvent[] {
  return [...recentWins];
}

/**
 * Cleanup
 */
export function disconnectLiveActivity() {
  if (unwatch) {
    unwatch();
    unwatch = null;
  }
  wsClient = null;
  subscribers.clear();
  recentWins.length = 0;
  logger.log('[LiveActivity] Disconnected');
}

export const LiveActivityService = {
  subscribe: subscribeLiveWins,
  getRecent: getRecentWins,
  disconnect: disconnectLiveActivity,
};
