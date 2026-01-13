/**
 * XPGainPopup Component
 *
 * Animated popup that shows XP gained after a game.
 * Provides dopamine feedback for user progression.
 */

import { useState, useEffect } from 'preact/hooks';

interface XPGainPopupProps {
  xpAmount: number;
  onComplete?: () => void;
}

export function XPGainPopup({ xpAmount, onComplete }: XPGainPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Start animation
    const showTimer = setTimeout(() => {
      if (isMounted) setIsVisible(true);
    }, 50);

    // Start exit animation
    const exitTimer = setTimeout(() => {
      if (isMounted) setIsExiting(true);
    }, 1500);

    // Remove component
    const removeTimer = setTimeout(() => {
      if (isMounted) onComplete?.();
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(showTimer);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove onComplete from dependencies to prevent re-running effect

  const getXPStyle = () => {
    if (xpAmount >= 50) return 'xp-epic'; // Blackjack
    if (xpAmount >= 25) return 'xp-win'; // Win
    if (xpAmount >= 10) return 'xp-play'; // Loss (participation)
    return 'xp-push'; // Push
  };

  const getEmoji = () => {
    if (xpAmount >= 50) return '🔥';
    if (xpAmount >= 25) return '⭐';
    if (xpAmount >= 10) return '🎮';
    return '🤝';
  };

  return (
    <div
      className={`xp-gain-popup ${isVisible ? 'visible' : ''} ${isExiting ? 'exiting' : ''} ${getXPStyle()}`}
    >
      <span className="xp-emoji">{getEmoji()}</span>
      <span className="xp-amount">+{xpAmount} XP</span>
    </div>
  );
}

// Hook to manage XP popup state
export function useXPPopup() {
  const [popup, setPopup] = useState<{ xp: number; key: number } | null>(null);

  const showXPGain = (xpAmount: number) => {
    setPopup({ xp: xpAmount, key: Date.now() });
  };

  const hidePopup = () => {
    setPopup(null);
  };

  return { popup, showXPGain, hidePopup };
}

export default XPGainPopup;
