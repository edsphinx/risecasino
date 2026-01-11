/**
 * WalletTrigger - The clickable wallet button (presentation only)
 * Shows connection status, USDC balance (primary for gaming), and address
 *
 * NOTE: Rise Wallet sponsors gas fees, so we prioritize showing USDC
 * (the betting token) rather than ETH balance in the header.
 */

import { shortenAddress } from '@/lib/formatters';
import type { AssetInfo } from '@/hooks/useAssetBalances';

interface WalletTriggerProps {
  assets: AssetInfo[]; // Array of assets with balances
  address: string;
  hasSessionKey: boolean;
  isOpen: boolean;
  onClick: () => void;
}

export function WalletTrigger({
  assets,
  address,
  hasSessionKey,
  isOpen,
  onClick,
}: WalletTriggerProps) {
  // Find USDC asset
  const usdcAsset = assets.find((a) => a.symbol === 'USDC');
  const usdcBalance = usdcAsset?.balance ?? '0';

  return (
    <button className="wallet-trigger" onClick={onClick}>
      <div className="wallet-trigger-left">
        <span className="wallet-trigger-dot" />
        {/* USDC balance - primary display for gaming */}
        <span className="wallet-trigger-balance wallet-trigger-usdc">
          <span className="usdc-amount">${usdcBalance}</span>
          <span className="usdc-symbol">USDC</span>
        </span>
      </div>
      <div className="wallet-trigger-right">
        <span className="wallet-trigger-address">{shortenAddress(address)}</span>
        <span className={`wallet-trigger-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {hasSessionKey && <span className="wallet-trigger-session">🔑</span>}
    </button>
  );
}
