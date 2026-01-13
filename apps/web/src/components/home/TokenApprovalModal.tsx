/**
 * TokenApprovalModal - Modal for approving tokens before playing
 *
 * Shows when user tries to play CHIP/USDC version without approval
 */

import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { encodeFunctionData } from 'viem';
import { useWallet } from '@/context/WalletContext';
import { TokenService } from '@/services/token.service';
import { getProvider } from '@/lib/riseWallet';
import { ChipIcon } from '@/components/icons/ChipIcon';
import { CHIP_TOKEN_ADDRESS, USDC_TOKEN_ADDRESS, VYRECASINO_ADDRESS } from '@/lib/contract';
import { ERC20_ABI } from '@vyrejack/shared';
import { logger } from '@/lib/logger';
import type { TokenType } from '@/hooks/useGameNavigation';

interface TokenApprovalModalProps {
  tokenType: TokenType;
  onClose: () => void;
  onApproved: () => void;
}

interface TokenMeta {
  name: string;
  address: `0x${string}`;
  color: string;
}

const TOKEN_INFO: Record<Exclude<TokenType, 'eth'>, TokenMeta> = {
  chip: { name: 'CHIP', address: CHIP_TOKEN_ADDRESS, color: '#a78bfa' },
  usdc: { name: 'USDC', address: USDC_TOKEN_ADDRESS, color: '#38bdf8' },
};

// All routes now go to the unified /vyrejack (USDC)
const GAME_ROUTE = '/vyrejack';

export function TokenApprovalModal({ tokenType, onClose, onApproved }: TokenApprovalModalProps) {
  const [, setLocation] = useLocation();
  const wallet = useWallet();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tokenType === 'eth') return null;

  const tokenInfo = TOKEN_INFO[tokenType];

  // DEBUG: Log wallet state
  logger.log('[TokenApprovalModal] wallet state:', {
    address: wallet.address,
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
  });

  const handleApprove = async () => {
    if (!wallet.address) return;

    setIsApproving(true);
    setError(null);

    try {
      // Get Rise Wallet provider
      const provider = getProvider();

      // Max approval amount
      const maxApproval = BigInt(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );

      // Encode the approve function call
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [VYRECASINO_ADDRESS, maxApproval],
      });

      logger.log('[TokenApprovalModal] Requesting approval for:', tokenInfo.name);

      // Use eth_sendTransaction (works with Rise Wallet Porto)
      const txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: wallet.address,
            to: tokenInfo.address,
            data,
            value: '0x0',
          },
        ],
      })) as `0x${string}`;

      logger.log('[TokenApprovalModal] Approval tx sent:', txHash);

      // Wait for confirmation
      await TokenService.publicClient.waitForTransactionReceipt({ hash: txHash });

      logger.log('[TokenApprovalModal] Approval confirmed!');

      // Navigate to game
      onApproved();
      setLocation(GAME_ROUTE);
    } catch (err) {
      logger.error('[TokenApprovalModal] Approval failed:', err);
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setIsApproving(false);
    }
  };

  const renderIcon = () => {
    if (tokenType === 'chip') {
      return <ChipIcon size={64} />;
    }
    return <span className="approval-icon-emoji">💵</span>;
  };

  return (
    <div className="approval-modal-overlay" onClick={onClose}>
      <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="approval-icon">{renderIcon()}</div>

        <h2 className="approval-title">Approve {tokenInfo.name}</h2>

        <p className="approval-description">
          To play VyreJack with {tokenInfo.name}, you need to approve VyreCasino to spend your
          tokens. This is a one-time approval.
        </p>

        {error && (
          <div className="approval-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="approval-actions">
          <button className="approval-btn-cancel" onClick={onClose} disabled={isApproving}>
            Cancel
          </button>
          <button className="approval-btn-approve" onClick={handleApprove} disabled={isApproving}>
            {isApproving ? 'Approving...' : `Approve ${tokenInfo.name}`}
          </button>
        </div>

        <p className="approval-note">
          💡 This allows VyreCasino to deduct bets from your {tokenInfo.name} balance.
        </p>
      </div>
    </div>
  );
}
