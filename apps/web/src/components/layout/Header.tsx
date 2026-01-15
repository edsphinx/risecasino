/**
 * Header Component
 *
 * Main navigation header with mobile and desktop variants.
 * Extracted from app.tsx for better organization.
 */

import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { useWallet } from '@/context/WalletContext';
import { useAssetBalances } from '@/hooks/useAssetBalances';
import { Logo } from '@/components/brand/Logo';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { PlayerStats } from '@/components/game/PlayerStats';
import { safeParseNumber, formatSessionTime } from '@/lib/formatters';

export function Header() {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isGame = location === '/vyrejack' || location.startsWith('/games/vyrejack');

  // Use global wallet context
  const wallet = useWallet();

  // Get USDC balance for mobile header display
  const { assets } = useAssetBalances(wallet.address as `0x${string}` | null);
  const usdcAsset = assets.find((a) => a.symbol === 'USDC');
  const usdcBalance = usdcAsset?.balance ?? '0';

  return (
    <>
      {/* Ultra-compact mobile header */}
      <header className="mobile-header-compact sm:hidden">
        <div className="mobile-header-inner">
          <div className="cursor-pointer" onClick={() => setLocation('/')}>
            <Logo size="compact" variant={isGame ? 'vyrejack' : 'vyrecasino'} />
          </div>

          {/* Right side: balance preview + hamburger */}
          <div className="mobile-header-right">
            {wallet.isConnected && (
              <div className="mobile-balance">
                <img
                  src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
                  alt="USDC"
                  className="mobile-balance-icon"
                  width="16"
                  height="16"
                />
                <span>${usdcBalance}</span>
              </div>
            )}
            {wallet.isConnected && !wallet.balance && (
              <span className="mobile-connected-dot" title="Connected" />
            )}
            <button
              className="hamburger-btn"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`hamburger-icon ${menuOpen ? 'open' : ''}`} />
            </button>
          </div>
        </div>

        {/* Overlay menu - opens OVER content */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)} />

            {/* Menu panel */}
            <div className="mobile-menu-panel">
              {!wallet.isConnected ? (
                /* Not connected - show connect button */
                <button
                  className="mobile-connect-btn"
                  onClick={() => {
                    wallet.connect();
                    setMenuOpen(false);
                  }}
                  disabled={wallet.isConnecting}
                >
                  {wallet.isConnecting ? <>⏳ Connecting...</> : <>⚡ Connect Wallet</>}
                </button>
              ) : (
                /* Connected - show wallet info */
                <>
                  {/* Wallet Info Card */}
                  <div className="wallet-info-card">
                    <div className="wallet-info-header">
                      <div className="wallet-status">
                        <span className="wallet-status-dot" />
                        <span className="wallet-status-text">Connected</span>
                      </div>
                      <button
                        className="wallet-disconnect-btn"
                        onClick={() => {
                          wallet.disconnect();
                          setMenuOpen(false);
                        }}
                      >
                        Disconnect
                      </button>
                    </div>

                    <div className="wallet-address-row">
                      <span className="wallet-address">
                        {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
                      </span>
                      <button
                        className="wallet-copy-btn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(wallet.address || '');
                          } catch {
                            // Clipboard API not available
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>

                    <div className="wallet-balance-row">
                      <span className="wallet-balance-label">Balance</span>
                      <span className="wallet-balance-value">
                        {wallet.balance !== null
                          ? `${safeParseNumber(wallet.formatBalance()).toFixed(5)} ETH`
                          : '-- ETH'}
                      </span>
                    </div>
                  </div>

                  {/* Session Key Card */}
                  <div className="session-key-card">
                    <div className="session-key-header">
                      <div className="session-key-info">
                        <span className="session-key-icon">🔑</span>
                        <div>
                          <div className="session-key-label">Fast Mode</div>
                          <div className="session-key-status">
                            {wallet.hasSessionKey ? 'Active' : 'Enable for instant gameplay'}
                          </div>
                        </div>
                      </div>
                      {wallet.hasSessionKey ? (
                        <div className="session-key-actions">
                          {wallet.sessionExpiry && !wallet.sessionExpiry.expired && (
                            <span className="session-key-time">
                              {formatSessionTime(wallet.sessionExpiry)}
                            </span>
                          )}
                          <button
                            className="session-key-btn revoke"
                            onClick={wallet.revokeSessionKey}
                          >
                            Revoke
                          </button>
                        </div>
                      ) : (
                        <button className="session-key-btn" onClick={wallet.createSessionKey}>
                          Enable
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Navigation */}
              <nav className="mobile-nav-links">
                <button
                  onClick={() => {
                    setLocation('/');
                    setMenuOpen(false);
                  }}
                  className={location === '/' ? 'active' : ''}
                >
                  🎲 LOBBY
                </button>
                <button
                  onClick={() => {
                    setLocation('/games/vyrejack/eth');
                    setMenuOpen(false);
                  }}
                  className={location.includes('/games/') ? 'active' : ''}
                >
                  🎮 PLAY NOW
                </button>
                <button
                  onClick={() => {
                    setLocation('/leaderboard');
                    setMenuOpen(false);
                  }}
                  className={location === '/leaderboard' ? 'active' : ''}
                >
                  🏆 RANKS
                </button>
              </nav>
            </div>
          </>
        )}
      </header>

      {/* Desktop header */}
      <header className="hidden sm:block p-4 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-6">
            <div className="cursor-pointer" onClick={() => setLocation('/')}>
              <Logo size="full" variant={isGame ? 'vyrejack' : 'vyrecasino'} />
            </div>
            <nav className="hidden md:flex gap-4 text-xs font-bold text-gray-400 tracking-wider">
              <button
                type="button"
                onClick={() => setLocation('/')}
                className={`cursor-pointer hover:text-purple-400 transition-colors bg-transparent border-none ${location === '/' ? 'text-purple-400' : ''}`}
              >
                🎲 LOBBY
              </button>
              <button
                type="button"
                onClick={() => setLocation('/games/vyrejack/eth')}
                className={`cursor-pointer hover:text-purple-400 transition-colors bg-transparent border-none ${location.includes('/games/') ? 'text-purple-400' : ''}`}
              >
                🎮 PLAY NOW
              </button>
              <button
                type="button"
                onClick={() => setLocation('/leaderboard')}
                className={`cursor-pointer hover:text-yellow-400 transition-colors bg-transparent border-none ${location === '/leaderboard' ? 'text-yellow-400' : ''}`}
              >
                🏆 RANKS
              </button>
            </nav>
          </div>

          {/* Player Stats - XP/Level display */}
          <PlayerStats />

          <WalletConnect
            account={wallet.address}
            isConnected={wallet.isConnected}
            isConnecting={wallet.isConnecting}
            error={wallet.error}
            balance={wallet.balance}
            formatBalance={wallet.formatBalance}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
            hasSessionKey={wallet.hasSessionKey}
            sessionExpiry={wallet.sessionExpiry}
            onCreateSession={wallet.createSessionKey}
            onRevokeSession={wallet.revokeSessionKey}
          />
        </div>
      </header>
    </>
  );
}
