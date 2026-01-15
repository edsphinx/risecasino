/**
 * VyreJack CHIP Version
 *
 * Uses VyreCasino architecture with CHIP betting token.
 * Auto-approves via session key if available, falls back to modal.
 * Preloads resources on mount for fast first game.
 */
import { useState, useEffect } from 'preact/hooks';
import { encodeFunctionData } from 'viem';
import { GameBoardCasino } from '@/components/game/GameBoardCasino';
import { TokenApprovalModal } from '@/components/home/TokenApprovalModal';
import { useWallet } from '@/context/WalletContext';
import { useGameWarmup } from '@/hooks/useGameWarmup';
import { TokenService } from '@/services/token.service';
import { getProvider } from '@/lib/riseWallet';
import { CHIP_TOKEN_ADDRESS, VYRECASINO_ADDRESS } from '@/lib/contract';
import { ERC20_ABI } from '@vyrejack/shared';
import { logger } from '@/lib/logger';

const MAX_APPROVAL = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

export function VyreJackChip() {
  const wallet = useWallet();
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isAutoApproving, setIsAutoApproving] = useState(false);
  const [needsManualApproval, setNeedsManualApproval] = useState(false);

  // ⚡ Preload resources on mount for fast first game
  useGameWarmup(wallet.address as `0x${string}` | null);

  // Check approval status and auto-approve if needed
  useEffect(() => {
    const checkAndApprove = async () => {
      if (!wallet.address) {
        setIsApproved(null);
        return;
      }

      setIsChecking(true);
      setNeedsManualApproval(false);

      try {
        // Check current allowance
        const allowance = await TokenService.getAllowance(
          CHIP_TOKEN_ADDRESS,
          wallet.address as `0x${string}`
        );
        logger.log('[VyreJackChip] Current allowance:', allowance.amount.toString());

        if (allowance.isApproved) {
          setIsApproved(true);
          setIsChecking(false);
          return;
        }

        // No allowance - try to auto-approve via session key
        const { getActiveSessionKey, signWithSessionKey } =
          await import('@/services/sessionKey.service');
        const sessionKey = getActiveSessionKey();
        if (!sessionKey) {
          logger.log('[VyreJackChip] No session key, showing approval modal');
          setNeedsManualApproval(true);
          setIsApproved(false);
          setIsChecking(false);
          return;
        }

        // Try auto-approve via session key
        logger.log('[VyreJackChip] Auto-approving via session key...');
        setIsAutoApproving(true);

        try {
          const provider = getProvider();
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [VYRECASINO_ADDRESS, MAX_APPROVAL],
          });

          // Prepare call with session key
          const prepared = (await provider.request({
            method: 'wallet_prepareCalls',
            params: [
              {
                calls: [
                  {
                    to: CHIP_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
                    value: '0x0',
                    data,
                  },
                ],
                key: {
                  type: 'p256',
                  publicKey: sessionKey.publicKey as `0x${string}`,
                },
              },
            ],
          })) as any;

          // Sign with session key
          const signature = signWithSessionKey(prepared.digest, sessionKey);

          // Send prepared call
          await provider.request({
            method: 'wallet_sendPreparedCalls',
            params: [{ ...prepared, signature }],
          });

          logger.log('[VyreJackChip] Auto-approval successful!');

          // Wait a bit for tx to confirm, then re-check
          await new Promise((r) => setTimeout(r, 2000));

          const newAllowance = await TokenService.getAllowance(
            CHIP_TOKEN_ADDRESS,
            wallet.address as `0x${string}`
          );

          setIsApproved(newAllowance.isApproved);
        } catch (sessionError: any) {
          logger.warn('[VyreJackChip] Session key approval failed:', sessionError.message);
          // Session key failed (maybe not authorized for this call)
          // Fall back to manual approval
          setNeedsManualApproval(true);
          setIsApproved(false);
        } finally {
          setIsAutoApproving(false);
        }
      } catch (error) {
        logger.error('[VyreJackChip] Error checking approval:', error);
        setIsApproved(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAndApprove();
  }, [wallet.address]);

  const handleManualApproved = async () => {
    if (wallet.address) {
      const allowance = await TokenService.getAllowance(
        CHIP_TOKEN_ADDRESS,
        wallet.address as `0x${string}`
      );
      setIsApproved(allowance.isApproved);
      setNeedsManualApproval(false);
    }
  };

  return (
    <div className="vyrejack-page relative">
      {/* Game Board - only visible when approved */}
      {wallet.isConnected && isApproved && (
        <GameBoardCasino token={CHIP_TOKEN_ADDRESS} tokenSymbol="CHIP" />
      )}

      {/* Connection Overlay - shown when wallet not connected */}
      {!wallet.isConnected && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="text-6xl mb-6">🎰</div>
            <h2 className="text-3xl font-black mb-4 text-white">VyreJack CHIP</h2>
            <p className="text-amber-400 mb-2 font-semibold">Play with Casino Chips</p>
            <p className="text-gray-400 mb-8">The premium casino experience with CHIP tokens.</p>
            <button
              onClick={wallet.connect}
              disabled={wallet.isConnecting}
              className="px-10 py-4 rounded-2xl font-bold text-xl text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 transition-all disabled:opacity-50 shadow-2xl shadow-amber-500/30"
            >
              {wallet.isConnecting ? '⏳ Connecting...' : '⚡ Connect Wallet'}
            </button>
          </div>
        </div>
      )}

      {/* Checking/Auto-Approving Overlay */}
      {wallet.isConnected && (isChecking || isAutoApproving) && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-5xl mb-4 animate-pulse">{isAutoApproving ? '✨' : '🔍'}</div>
            <p className="text-white text-lg">
              {isAutoApproving ? 'Auto-approving CHIP...' : 'Checking permissions...'}
            </p>
          </div>
        </div>
      )}

      {/* Manual Approval Modal - only if session key failed */}
      {wallet.isConnected && needsManualApproval && !isChecking && !isAutoApproving && (
        <TokenApprovalModal
          tokenType="chip"
          onClose={() => window.history.back()}
          onApproved={handleManualApproved}
        />
      )}
    </div>
  );
}

export default VyreJackChip;
