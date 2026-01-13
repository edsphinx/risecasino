/**
 * WalletConnect - Main wallet connection component
 * Composes WalletTrigger and WalletDropdown subcomponents
 * Contains only state management and event handlers
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import type { WalletConnectProps } from '@vyrejack/shared';
import { WalletTrigger } from './WalletTrigger';
import { WalletDropdown } from './WalletDropdown';
import { clearRiseWalletData } from '@/lib/walletRecovery';
import { useAssetBalances } from '@/hooks/useAssetBalances';
import './styles/header.css';
import './styles/desktop-dropdown.css';

export function WalletConnect({
  account,
  isConnected,
  isConnecting,
  hasSessionKey,
  sessionExpiry,
  error,
  balance,
  formatBalance,
  onConnect,
  onDisconnect,
  onCreateSession,
  onRevokeSession,
}: WalletConnectProps) {
  // Local UI state
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get all asset balances with approval status
  const { assets, refresh: refreshAssets } = useAssetBalances(account as `0x${string}` | null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refresh balance when dropdown opens (so user sees latest)
  useEffect(() => {
    if (dropdownOpen) {
      refreshAssets();
    }
  }, [dropdownOpen, refreshAssets]);

  // Event handlers
  const handleCopyAddress = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    try {
      await onCreateSession();
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setDropdownOpen(false);
  };

  const handleResetWallet = async () => {
    if (confirm('This will clear all wallet data and reload the page. Continue?')) {
      await clearRiseWalletData();
      window.location.reload();
    }
  };

  // Get formatted ETH balance string
  const balanceString = balance !== null ? formatBalance() : null;

  // Not connected state
  if (!isConnected) {
    return (
      <div className="wallet-section">
        <button onClick={onConnect} disabled={isConnecting} className="header-cta">
          {isConnecting ? (
            <>
              <span className="animate-spin">⏳</span>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Connect Wallet</span>
            </>
          )}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  // Connected state
  return (
    <div className="wallet-section" ref={dropdownRef}>
      <WalletTrigger
        assets={assets}
        address={account || ''}
        hasSessionKey={hasSessionKey}
        isOpen={dropdownOpen}
        onClick={() => setDropdownOpen(!dropdownOpen)}
      />

      {dropdownOpen && (
        <WalletDropdown
          address={account || ''}
          balance={balanceString || ''}
          assets={assets}
          hasSessionKey={hasSessionKey}
          sessionExpiry={sessionExpiry}
          copied={copied}
          isCreatingSession={isCreatingSession}
          onCopyAddress={handleCopyAddress}
          onCreateSession={handleCreateSession}
          onRevokeSession={onRevokeSession}
          onDisconnect={handleDisconnect}
          onResetWallet={handleResetWallet}
          onRefreshAssets={refreshAssets}
        />
      )}
    </div>
  );
}
