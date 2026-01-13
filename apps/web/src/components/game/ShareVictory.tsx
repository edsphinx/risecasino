/**
 * ShareVictory Component
 *
 * Button to share victories on Twitter/X for viral growth.
 * Appears after winning a game.
 */

import { useCallback } from 'preact/hooks';
import { logEvent } from '@/lib/api';

interface ShareVictoryProps {
  winAmount?: string; // ETH amount won
  outcome: 'win' | 'blackjack';
  walletAddress?: string;
}

export function ShareVictory({ winAmount, outcome, walletAddress }: ShareVictoryProps) {
  const handleShare = useCallback(async () => {
    // Log the share event
    if (walletAddress) {
      try {
        await logEvent('share_victory', walletAddress, {
          outcome,
          winAmount,
        });
      } catch (err) {
        console.error('Failed to log share event:', err);
      }
    }

    // Create tweet text
    const emoji = outcome === 'blackjack' ? '🃏💰' : '🎰🔥';
    const outcomeText = outcome === 'blackjack' ? 'BLACKJACK' : 'just won';
    const amountText = winAmount ? ` ${winAmount} ETH` : '';

    const tweetText = encodeURIComponent(
      `${emoji} ${outcomeText}${amountText} playing VyreJack!\n\nOn-chain Blackjack with provably fair VRF 🎲\n\nPlay now 👇\n${window.location.origin}`
    );

    // Open Twitter intent with popup blocker fallback
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
    const popup = window.open(twitterUrl, '_blank', 'width=550,height=420');

    // Fallback if popup was blocked - use new tab instead of hijacking current page
    if (!popup) {
      window.open(twitterUrl, '_blank');
    }
  }, [outcome, winAmount, walletAddress]);

  return (
    <button type="button" onClick={handleShare} className="share-victory-btn">
      <svg className="share-icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share Victory
    </button>
  );
}

export default ShareVictory;
