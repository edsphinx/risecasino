/**
 * GameHistory - DEGEN styled history panel
 * Shows last 50 games with cards and results
 */

import { useState, useEffect } from 'preact/hooks';
import { StorageService, type GameHistoryEntry } from '@/services/storage.service';
import { getCardDisplay } from '@/lib/cards';

interface GameHistoryProps {
  /** Callback when history updates (to sync with parent) */
  onHistoryChange?: () => void;
}

export function GameHistory({ onHistoryChange }: GameHistoryProps) {
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load history on mount
  useEffect(() => {
    setHistory(StorageService.getGameHistory());
  }, []);

  // Refresh when parent signals
  useEffect(() => {
    const refresh = () => setHistory(StorageService.getGameHistory());
    window.addEventListener('vyrejack:gameEnd', refresh);
    return () => window.removeEventListener('vyrejack:gameEnd', refresh);
  }, []);

  const handleClear = () => {
    StorageService.clearGameHistory();
    setHistory([]);
    onHistoryChange?.();
  };

  const getResultEmoji = (result: GameHistoryEntry['result']) => {
    switch (result) {
      case 'blackjack':
        return '💎';
      case 'win':
        return '💰';
      case 'lose':
        return '💀';
      case 'push':
        return '🤝';
      case 'surrender':
        return '🏳️';
    }
  };

  const getResultClass = (result: GameHistoryEntry['result']) => {
    switch (result) {
      case 'blackjack':
        return 'result-blackjack';
      case 'win':
        return 'result-win';
      case 'lose':
        return 'result-lose';
      case 'push':
        return 'result-push';
      case 'surrender':
        return 'result-surrender';
    }
  };

  const formatCards = (cards: number[]) => {
    return cards.map((c, i) => {
      const { rank, suit, color } = getCardDisplay(c);
      return (
        <span key={i} className={`card-${color}`}>
          {rank}
          {suit}{' '}
        </span>
      );
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Stats calculation
  const stats = {
    total: history.length,
    wins: history.filter((g) => g.result === 'win' || g.result === 'blackjack').length,
    losses: history.filter((g) => g.result === 'lose').length,
    pushes: history.filter((g) => g.result === 'push').length,
  };
  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  if (history.length === 0) {
    return (
      <div className="game-history empty">
        <div className="history-header">
          <span className="header-icon">📊</span>
          <span className="header-title">History</span>
        </div>
        <div className="history-empty">
          <span>No games yet</span>
          <span className="empty-hint">Play to see your history!</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`game-history ${isExpanded ? 'expanded' : ''}`}>
      {/* Header with stats */}
      <div className="history-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="header-left">
          <span className="header-icon">📊</span>
          <span className="header-title">History</span>
          <span className="header-count">{stats.total}</span>
        </div>
        <div className="header-stats">
          <span className="stat-win">{winRate}% W</span>
          <span className="expand-icon">{isExpanded ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* History list */}
      <div className="history-list">
        {history.slice(0, isExpanded ? 50 : 5).map((game) => (
          <div key={game.id} className={`history-item ${getResultClass(game.result)}`}>
            <div className="item-result">
              <span className="result-emoji">{getResultEmoji(game.result)}</span>
            </div>
            <div className="item-details">
              <div className="item-values">
                <span className="player-value">{game.playerValue}</span>
                <span className="vs">vs</span>
                <span className="dealer-value">{game.dealerValue}</span>
              </div>
              <div className="item-cards">
                <span className="cards-player">{formatCards(game.playerCards)}</span>
              </div>
            </div>
            <div className="item-meta">
              <span
                className={`payout ${game.result === 'lose' || game.result === 'surrender' ? 'negative' : 'positive'}`}
              >
                {game.result === 'lose' ? '-' : game.result === 'push' ? '' : '+'}
                {game.payout}
              </span>
              <span className="time">{formatTime(game.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Clear button */}
      {isExpanded && (
        <button className="history-clear" onClick={handleClear}>
          Clear History
        </button>
      )}
    </div>
  );
}
