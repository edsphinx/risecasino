/**
 * GameResultOverlay - Full-screen addictive result display
 *
 * Psychological elements included:
 * - Celebration amplification for wins
 * - Near-miss messaging for losses
 * - Streak counter for engagement
 * - Quick replay with same bet
 */

import { useState, useEffect } from 'preact/hooks';
import { Hand } from './Hand';
import type { GameResult } from '@vyrejack/shared';
import './styles/result-overlay.css';

interface GameResultOverlayProps {
  result: GameResult;
  playerCards: number[];
  dealerCards: number[];
  playerValue: number;
  dealerValue: number;
  bet: string;
  payout?: string;
  tokenSymbol: string;
  streak?: number;
  xpEarned?: number;
  onPlayAgain: (bet: string) => void;
  onChangeBet: () => void;
}

// Result configurations with DEGEN crypto messaging
const RESULT_CONFIG = {
  blackjack: {
    title: 'BLACKJACK!',
    subtitle: 'WAGMI! 💎🙌',
    emoji: '💎',
    class: 'result-blackjack',
    confetti: true,
  },
  win: {
    title: 'LFG! YOU WIN!',
    subtitle: '🚀 TO THE MOON',
    emoji: '🚀',
    class: 'result-win',
    confetti: true,
  },
  lose: {
    title: 'NGMI',
    subtitle: 'Dealer Wins',
    emoji: '💀',
    class: 'result-lose',
    confetti: false,
  },
  push: {
    title: 'PUSH',
    subtitle: 'Bet Returned 🤝',
    emoji: '🤝',
    class: 'result-push',
    confetti: false,
  },
} as const;

export function GameResultOverlay({
  result,
  playerCards,
  dealerCards,
  playerValue,
  dealerValue,
  bet,
  payout,
  tokenSymbol,
  streak = 0,
  xpEarned = 0,
  onPlayAgain,
  onChangeBet,
}: GameResultOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const config =
    result && result in RESULT_CONFIG
      ? RESULT_CONFIG[result as keyof typeof RESULT_CONFIG]
      : RESULT_CONFIG.lose;
  const isWin = result === 'win' || result === 'blackjack';
  const isClose = Math.abs(playerValue - dealerValue) <= 2;

  // Entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    if (config.confetti) {
      setTimeout(() => setShowConfetti(true), 600);
    }
  }, []);

  // Near-miss messaging for psychological engagement
  const getNearMissMessage = () => {
    if (result === 'lose' && playerValue > 21) {
      return `Busted at ${playerValue}! So close...`;
    }
    if (result === 'lose' && isClose) {
      return `Just ${dealerValue - playerValue} point${dealerValue - playerValue > 1 ? 's' : ''} away!`;
    }
    if (result === 'win' && isClose) {
      return 'Clutch win! 🔥';
    }
    return null;
  };

  const nearMissMessage = getNearMissMessage();

  // Quick bet options - minimum is 1 USDC per contract
  const quickBets = ['1', '2', '5', '10'];

  return (
    <div className={`result-overlay ${isVisible ? 'visible' : ''}`}>
      {/* Backdrop */}
      <div className="result-backdrop" />

      {/* Confetti layer */}
      {showConfetti && <div className="confetti-container" />}

      {/* Main content - WIDE for cards */}
      <div className={`result-content ${config.class}`}>
        {/* Header - INLINE: emoji + title + payout */}
        <div className="result-header-inline">
          <span className="result-header-emoji">{config.emoji}</span>
          <h1 className="result-title">{config.title}</h1>
          {isWin && payout && (
            <span className="payout-inline">+${payout} {tokenSymbol}</span>
          )}
        </div>

        {config.subtitle && <p className="result-subtitle">{config.subtitle}</p>}

        {/* Actions container - CENTERED, MAX WIDTH for proper button sizing */}
        <div className="result-actions-container">
          {/* Primary CTA */}
          <button className="btn-play-again primary" onClick={() => onPlayAgain(bet)}>
            <span className="btn-emoji">🎰</span>
            <span>PLAY AGAIN ${bet}</span>
          </button>

          {/* Quick bets */}
          <div className="quick-bets">
            <span className="quick-bets-label">or change bet:</span>
            <div className="quick-bets-row">
              {quickBets.map((amount) => (
                <button
                  key={amount}
                  className={`quick-bet-btn ${amount === bet ? 'active' : ''}`}
                  onClick={() => onPlayAgain(amount)}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cards display - FULL WIDTH for many cards */}
        <div className="result-cards">
          <div className="result-hand dealer">
            <span className="hand-label">Dealer</span>
            <Hand
              cards={dealerCards}
              value={dealerValue}
              isDealer
              result={result === 'lose' ? 'win' : null}
            />
          </div>

          <div className="result-vs">VS</div>

          <div className="result-hand player">
            <span className="hand-label">You</span>
            <Hand cards={playerCards} value={playerValue} result={result} />
          </div>
        </div>

        {/* Near miss message */}
        {nearMissMessage && <p className="result-near-miss">{nearMissMessage}</p>}

        {/* Stats row */}
        <div className="result-stats">
          {streak > 1 && (
            <div className="stat-item streak">
              <span className="stat-icon">🔥</span>
              <span>{streak} win streak!</span>
            </div>
          )}
          {xpEarned > 0 && (
            <div className="stat-item xp">
              <span className="stat-icon">⭐</span>
              <span>+{xpEarned} XP</span>
            </div>
          )}
        </div>

        {/* Back to table - centered */}
        <div className="result-actions-container">
          <button className="btn-change-bet" onClick={onChangeBet}>
            ← Back to table
          </button>
        </div>
      </div>
    </div>
  );
}
