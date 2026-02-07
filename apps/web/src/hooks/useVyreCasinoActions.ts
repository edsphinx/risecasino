/**
 * useVyreCasinoActions - Game WRITE actions for VyreCasino architecture
 *
 * REFACTORED: Uses simplified Meteoro pattern for session keys
 * - No complex retries
 * - Trusts localStorage
 * - Linear transaction flow: Check -> (Create) -> Prepare -> Sign -> Send
 */

import { useState, useCallback } from 'preact/hooks';
import { encodeFunctionData, parseUnits, formatUnits, maxUint256 } from 'viem';
import { P256, Signature } from 'ox';
import { getProvider } from '@/lib/riseWallet';
import { useSessionStore } from '@/stores/sessionStore';
import { useGameStore } from '@/stores/gameStore';
import { ErrorService, TokenService } from '@/services';
import {
  VYRECASINO_ABI,
  VYREJACKCORE_ABI,
  ERC20_ABI,
  VYRECASINO_ADDRESS,
  VYREJACKCORE_ADDRESS,
  CHIP_TOKEN_ADDRESS,
  USDC_TOKEN_ADDRESS,
} from '@/lib/contract';
import { logger } from '@/lib/logger';
import { logEvent } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

type GameActionName = 'hit' | 'stand' | 'double' | 'surrender' | 'retryVRF';

export interface UseVyreCasinoActionsReturn {
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  // Token write actions
  approveToken: (token: `0x${string}`, amount?: bigint) => Promise<boolean>;
  // Game actions
  placeBet: (betAmount: string, token?: `0x${string}`) => Promise<boolean>;
  hit: () => Promise<boolean>;
  stand: () => Promise<boolean>;
  double: () => Promise<boolean>;
  surrender: () => Promise<boolean>;
  retryVRF: () => Promise<boolean>;
  // Utils
  formatChip: (value: bigint) => string;
}

interface VyreCasinoActionsConfig {
  address: `0x${string}` | null;
  tokenContext?: 'ETH' | 'CHIP' | 'USDC';
  onSuccess?: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useVyreCasinoActions(config: VyreCasinoActionsConfig): UseVyreCasinoActionsReturn {
  const { address, tokenContext, onSuccess } = config;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Wait for transaction status with polling
   * ⚡ OPTIMIZED: Reduced from 30 to 10 attempts (2s vs 6s max)
   *    WebSocket events now handle real-time confirmation
   */
  const waitForTransactionStatus = async (provider: any, callId: string, maxAttempts = 10) => {
    logger.log(`[VyreCasino] Polling transaction status for: ${callId}`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await provider.request({
          method: 'wallet_getCallsStatus',
          params: [callId],
        });

        // Log every status update for debugging
        if (i % 5 === 0 || i < 3) {
          logger.log(
            `[VyreCasino] Poll ${i + 1}/${maxAttempts} - Status:`,
            JSON.stringify(status, null, 2)
          );
        }

        if (status) {
          // PRIORITY 1: Check for successful receipt (relay often returns status 500 but tx succeeded)
          // A receipt with blockNumber and logs indicates on-chain success
          const receipt = status.receipts?.[0];
          if (receipt && receipt.blockNumber && receipt.logs && receipt.logs.length > 0) {
            logger.log('[VyreCasino] ✅ Transaction confirmed via receipt!', {
              blockNumber: receipt.blockNumber,
              logsCount: receipt.logs.length,
              gasUsed: receipt.gasUsed,
            });
            // Return the call ID since we don't have transactionHash in this format
            return callId;
          }

          if (status.status === 'CONFIRMED' || status.status === 'confirmed') {
            logger.log('[VyreCasino] ✅ Transaction CONFIRMED!', {
              txHash: status.receipts?.[0]?.transactionHash,
              receipts: status.receipts,
            });
            if (status.receipts?.[0]?.transactionHash) {
              return status.receipts[0].transactionHash;
            }
            return callId; // Fallback
          }

          if (status.status === 'FAILED' || status.status === 'failed') {
            logger.error('[VyreCasino] ❌ Transaction FAILED!', {
              error: status.error,
              status: status.status,
              full: JSON.stringify(status, null, 2),
            });
            throw new Error(`Transaction failed: ${status.error || JSON.stringify(status)}`);
          }

          // Log other statuses (PENDING, etc) - but not 500 with receipts (handled above)
          if (
            status.status &&
            status.status !== 'PENDING' &&
            status.status !== 'pending' &&
            status.status !== 500
          ) {
            logger.log(`[VyreCasino] Unexpected status: ${status.status}`, status);
          }
        }
      } catch (err) {
        // Log polling errors
        logger.warn(`[VyreCasino] Poll error at attempt ${i + 1}:`, err);
        // Ignore polling errors unless it's a definitive failure
        if (String(err).includes('Transaction failed')) throw err;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    logger.warn(
      '[VyreCasino] ⚠️ Transaction status polling timed out after',
      maxAttempts,
      'attempts'
    );
    return callId;
  };

  /**
   * Send transaction using session key pattern (Prepare -> Sign -> Send)
   * Includes retry logic for nonce/duplicate call errors
   */
  const sendSessionTransaction = useCallback(
    async (
      to: `0x${string}`,
      value: bigint,
      data: `0x${string}`,
      maxRetries = 3
    ): Promise<string | null> => {
      if (!address) return null;

      const provider = getProvider();

      // 1. Get or Create Session Key from unified Zustand store
      // Uses USDC context by default
      const store = useSessionStore.getState();
      let sessionKey = store.sessionKey;

      // If no valid session key, create one
      if (!sessionKey || !store.isValid()) {
        try {
          sessionKey = await store.createSessionKey(address);
          if (!sessionKey) {
            throw new Error('Failed to create session key');
          }
        } catch (err) {
          logger.error('Failed to create session key:', err);
          throw new Error('Failed to get permissions for game');
        }
      }

      const hexValue = value ? `0x${value.toString(16)}` : '0x0';

      // Retry loop for handling nonce/duplicate call errors
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 2. Prepare Call - Meteoro pattern (no chainId/from/atomicRequired)
          const prepareParams = [
            {
              calls: [
                {
                  to,
                  value: hexValue,
                  data,
                },
              ],
              key: {
                type: 'p256',
                publicKey: sessionKey.publicKey,
              },
            },
          ];

          logger.log(`[VyreCasino] Preparing call (attempt ${attempt}/${maxRetries})...`);

          const prepared = await (provider as any).request({
            method: 'wallet_prepareCalls',
            params: prepareParams,
          });

          // 3. Sign Call using P256 directly
          const { digest, ...request } = prepared;
          const signature = Signature.toHex(
            P256.sign({
              payload: digest,
              privateKey: sessionKey.privateKey as `0x${string}`,
            })
          );

          logger.log('[VyreCasino] Signed with session key');

          // 4. Send Call
          const sendParams = {
            ...request,
            signature,
          };

          const response = await (provider as any).request({
            method: 'wallet_sendPreparedCalls',
            params: [sendParams],
          });

          // 5. Handle Response & Poll
          let callId: string;
          if (Array.isArray(response) && response.length > 0) {
            callId = response[0].id;
          } else if (typeof response === 'string') {
            callId = response;
          } else if (response && typeof response === 'object' && 'id' in response) {
            callId = (response as any).id;
          } else {
            throw new Error('Invalid response from wallet_sendPreparedCalls');
          }

          logger.log(`[VyreCasino] Transaction sent, ID: ${callId}`);

          const txHash = await waitForTransactionStatus(provider, callId);

          // Add small delay after success to let relay update nonce
          await new Promise((r) => setTimeout(r, 1000));

          return txHash;
        } catch (err) {
          const errMsg = String(err);

          // Check for duplicate call / nonce errors
          if (errMsg.includes('duplicate call') || errMsg.includes('nonce')) {
            if (attempt < maxRetries) {
              logger.warn(
                `[VyreCasino] Nonce/duplicate error, retrying in 3s... (${attempt}/${maxRetries})`
              );
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
          }

          // Propagate other errors
          throw err;
        }
      }

      throw new Error('Max retries exceeded for session transaction');
    },
    [address, tokenContext]
  );

  const sendPasskeyTransaction = useCallback(
    async (to: `0x${string}`, value: bigint, data: `0x${string}`): Promise<string | null> => {
      if (!address) return null;
      const provider = getProvider();
      const hexValue = value
        ? (`0x${value.toString(16)}` as `0x${string}`)
        : ('0x0' as `0x${string}`);

      return (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to, value: hexValue, data }],
      })) as string;
    },
    [address]
  );

  const sendTransaction = useCallback(
    async (to: `0x${string}`, value: bigint, data: `0x${string}`): Promise<string | null> => {
      // Always try session key flow first
      // Our ensureSessionKey logic handles checking if we need a new one
      try {
        return await sendSessionTransaction(to, value, data);
      } catch (err) {
        // Only fallback to passkey if it's a non-recoverable session error
        // Or if user rejected permissions
        logger.warn('[VyreCasino] Session transaction failed:', err);

        // ⚡ DETECT CORRUPTED SESSION KEY: If the relay says "not authorized",
        // it means the local session key is out of sync with the relay.
        // Clear it so the user can create a fresh one.
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (
          errorMessage.includes('not been authorized') ||
          errorMessage.includes('not authorized')
        ) {
          logger.error('[VyreCasino] Session key rejected by relay - clearing corrupted local key');
          // Clear the corrupted session key from Zustand store
          const { clearSession } = await import('@/stores/sessionStore').then((m) =>
            m.useSessionStore.getState()
          );
          clearSession();
          setError('Session expired — please sign again');
        }

        // Use a simple heuristic: if it's "User rejected" don't retry with passkey immediately
        // But for safety/robustness we can try passkey as fallback
        return await sendPasskeyTransaction(to, value, data);
      }
    },
    [sendSessionTransaction, sendPasskeyTransaction]
  );

  // ---------------------------------------------------------------------------
  // TOKEN MANAGEMENT
  // ---------------------------------------------------------------------------

  const approveToken = useCallback(
    async (token: `0x${string}`, amount: bigint = maxUint256): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = encodeFunctionData({
          abi: ERC20_ABI as any,
          functionName: 'approve',
          args: [VYRECASINO_ADDRESS, amount],
        });

        // IMPORTANT: Use passkey (eth_sendTransaction) directly for approve.
        // Session key approve does NOT work with V6 contracts due to Porto/Relay limitations.
        // The approve call gets "confirmed" but doesn't execute the actual ERC20.approve().
        // Passkey-based approve works correctly and the allowance is stored on-chain permanently.
        logger.log('[VyreCasino] Approving token via passkey (required for V6)...');
        const txHash = await sendPasskeyTransaction(token, 0n, data);

        if (!txHash) {
          setError('Approval failed');
          return false;
        }

        logger.log('[VyreCasino] Token approved:', txHash);

        // Wait for tx to be confirmed on-chain
        await new Promise((r) => setTimeout(r, 2000));

        return true;
      } catch (err) {
        setError(ErrorService.getSafeMessage(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [address, sendPasskeyTransaction]
  );

  // ---------------------------------------------------------------------------
  // GAME ACTIONS
  // ---------------------------------------------------------------------------

  const placeBet = useCallback(
    async (betAmount: string, token: `0x${string}` = CHIP_TOKEN_ADDRESS): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      if (!betAmount?.trim()) {
        setError('Please enter a bet amount');
        return false;
      }

      const amount = parseFloat(betAmount);
      if (isNaN(amount) || amount <= 0) {
        setError('Bet amount must be positive');
        return false;
      }

      // Determine decimals based on token
      // USDC uses 6 decimals, CHIP uses 18
      const isUSDC = token.toLowerCase() === USDC_TOKEN_ADDRESS.toLowerCase();

      const decimals = isUSDC ? 6 : 18;
      const betWei = parseUnits(betAmount, decimals);

      setIsLoading(true);
      setError(null);

      try {
        // Step 0: Check if user has enough balance
        const balanceState = await TokenService.getBalance(token, address);
        if (balanceState.raw < betWei) {
          const formattedBalance = formatUnits(balanceState.raw, decimals);
          useGameStore.getState().setGamePhase('idle');
          setError(
            `Insufficient balance. You have ${parseFloat(formattedBalance).toFixed(2)} ${isUSDC ? 'USDC' : 'CHIP'} but tried to bet ${betAmount}`
          );
          return false;
        }

        // Step 1: Check allowance via TokenService (cached)
        const allowanceState = await TokenService.getAllowance(token, address);

        // Step 2: Approve if needed
        if (allowanceState.amount < betWei) {
          logger.log('[VyreCasino] Insufficient allowance, requesting passkey approval...');
          // Approval uses PASSKEY (eth_sendTransaction) - session key approve doesn't work with V6
          const approved = await approveToken(token, maxUint256);
          if (!approved) {
            useGameStore.getState().setGamePhase('idle');
            return false;
          }
        }

        // Step 3: Call VyreCasino.play()
        const data = encodeFunctionData({
          abi: VYRECASINO_ABI as any,
          functionName: 'play',
          args: [
            VYREJACKCORE_ADDRESS, // game address
            token, // token address
            betWei, // amount
            '0x' as `0x${string}`, // empty gameData for blackjack
          ],
        });

        // ⚡ PHASE TRACKING: Set waiting_vrf BEFORE send so CardDealt events
        // (which arrive during the await) see the correct starting phase
        useGameStore.getState().setGamePhase('waiting_vrf');

        const txHash = await sendTransaction(VYRECASINO_ADDRESS, 0n, data);
        if (!txHash) {
          useGameStore.getState().setGamePhase('idle');
          setError('Transaction failed');
          return false;
        }

        logger.log('[VyreCasino] Play TX:', txHash);
        logEvent('game_start', address, { betAmount, token, game: 'VyreJack' }).catch(() => {});

        await new Promise((r) => setTimeout(r, 100));
        onSuccess?.();
        return true;
      } catch (err) {
        logger.error('[VyreCasino] placeBet error:', err);
        useGameStore.getState().setGamePhase('idle');
        setError(ErrorService.getSafeMessage(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [address, approveToken, sendTransaction, onSuccess]
  );

  const executeGameAction = useCallback(
    async (action: GameActionName): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = encodeFunctionData({
          abi: VYREJACKCORE_ABI as any,
          functionName: action,
        });

        // ⚡ PHASE TRACKING: Set phase BEFORE send so events arriving during
        // the await see the correct starting phase, and buttons hide immediately
        if (action === 'hit' || action === 'double') {
          useGameStore.getState().setGamePhase('waiting_vrf');
        } else if (action === 'stand' || action === 'surrender') {
          useGameStore.getState().setGamePhase('dealer_reveal');
        }

        const txHash = await sendTransaction(VYREJACKCORE_ADDRESS, 0n, data);
        if (!txHash) {
          // Revert phase on failure
          useGameStore.getState().setGamePhase('player_turn');
          setError('Action failed');
          return false;
        }

        logger.log(`[VyreCasino] ${action} TX:`, txHash);
        logEvent('game_action', address, { action }).catch(() => {});

        await new Promise((r) => setTimeout(r, 100));
        onSuccess?.();
        return true;
      } catch (err) {
        logger.error(`[VyreCasino] ${action} error:`, err);
        // Revert phase on error so UI doesn't get stuck
        useGameStore.getState().setGamePhase('player_turn');
        setError(ErrorService.getSafeMessage(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [address, sendTransaction, onSuccess]
  );

  const hit = useCallback(() => executeGameAction('hit'), [executeGameAction]);
  const stand = useCallback(() => executeGameAction('stand'), [executeGameAction]);
  const double = useCallback(() => executeGameAction('double'), [executeGameAction]);
  const surrender = useCallback(() => executeGameAction('surrender'), [executeGameAction]);
  const retryVRF = useCallback(() => executeGameAction('retryVRF'), [executeGameAction]);

  const formatChip = useCallback((value: bigint): string => formatUnits(value, 18), []);

  return {
    isLoading,
    error,
    clearError,
    approveToken,
    placeBet,
    hit,
    stand,
    double,
    surrender,
    retryVRF,
    formatChip,
  };
}
