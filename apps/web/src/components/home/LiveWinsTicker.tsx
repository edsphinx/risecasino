/**
 * LiveWinsTicker - Real-time scrolling wins via Shreds
 *
 * Uses shreds WebSocket subscription for live GameEnded events.
 * Falls back to mock data if no wins yet.
 */

import { useLiveWins } from '@/hooks/useLiveWins';
import type { LiveWinEvent } from '@/services/live-activity.service';

// Mock data for initial render before first real win
const MOCK_WINS: LiveWinEvent[] = [
  {
    address: '0x7a2f...3f4d',
    amount: 0.52,
    game: 'VyreJack',
    result: 'win',
    timestamp: Date.now(),
  },
  {
    address: '0xb91c...2c1a',
    amount: 0.31,
    game: 'VyreJack',
    result: 'blackjack',
    timestamp: Date.now(),
  },
  {
    address: '0x3e8d...9b2c',
    amount: 1.24,
    game: 'VyreJack',
    result: 'win',
    timestamp: Date.now(),
  },
  {
    address: '0x5f1a...7e3b',
    amount: 0.18,
    game: 'VyreJack',
    result: 'win',
    timestamp: Date.now(),
  },
];

export function LiveWinsTicker() {
  const { wins, isConnected, latestWin } = useLiveWins({ maxWins: 10 });

  // Use real wins if available, otherwise mock
  const displayWins = wins.length > 0 ? wins : MOCK_WINS;

  return (
    <section className="wins-ticker">
      <div className="ticker-label">
        🎉 LIVE WINS
        {isConnected && <span className="live-indicator" title="Connected to Rise Chain" />}
      </div>
      <div className="ticker-track">
        <div className={`ticker-content ${latestWin ? 'has-new' : ''}`}>
          {/* Duplicate array for seamless loop */}
          {displayWins.map((win, i) => (
            <WinItem
              key={`win-a-${win.timestamp}-${i}`}
              {...win}
              isNew={i === 0 && latestWin?.timestamp === win.timestamp}
            />
          ))}
          {displayWins.map((win, i) => (
            <WinItem key={`win-b-${win.timestamp}-${i}`} {...win} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Internal sub-component
function WinItem({ address, amount, result, isNew = false }: LiveWinEvent & { isNew?: boolean }) {
  const emoji = result === 'blackjack' ? '🃏' : '💰';

  return (
    <span className={`ticker-item ${isNew ? 'ticker-item-new' : ''}`}>
      <span className="ticker-emoji">{emoji}</span>
      <span className="ticker-address">{address}</span>
      <span className="ticker-won">won</span>
      <span className="ticker-amount">{amount.toFixed(3)} ETH</span>
      <span className="ticker-separator">•</span>
    </span>
  );
}

// Export original WinsTicker for backwards compatibility
export { WinsTicker } from './WinsTicker';
