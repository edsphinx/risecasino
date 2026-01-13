/**
 * PlayerStats Component
 *
 * Displays current XP, level, and progress bar.
 * Visible when wallet is connected.
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { getUserProfile } from '@/lib/api';
import { getLevelProgress } from '@vyrejack/shared';

interface UserStats {
  xp: number;
  level: number;
  displayName?: string;
}

export function PlayerStats() {
  const { address, isConnected } = useWallet();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      const response = (await getUserProfile(address)) as {
        profile: { xp?: number; level?: number; displayName?: string };
      };
      const profile = response.profile || response;
      setStats({
        xp: profile.xp || 0,
        level: profile.level || 0,
        displayName: profile.displayName,
      });
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Fetch on connect
  useEffect(() => {
    if (isConnected && address) {
      fetchStats();
    } else {
      setStats(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Listen for game end events to refresh stats
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleGameEnd = () => {
      // Small delay to allow backend to update
      timeoutId = setTimeout(fetchStats, 1000);
    };

    window.addEventListener('vyrecasino:gameend', handleGameEnd);
    return () => {
      window.removeEventListener('vyrecasino:gameend', handleGameEnd);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]); // Use address instead of fetchStats to prevent re-registration

  if (!isConnected || !stats) {
    return null;
  }

  // Use shared exponential level calculation
  const levelProgress = getLevelProgress(stats.xp);
  const progressPercent = levelProgress.progress;
  const xpToNext = levelProgress.xpToNext;

  return (
    <div className="player-stats">
      {isLoading ? (
        <div className="player-stats-loading">
          <span className="loading-dot" />
        </div>
      ) : (
        <>
          <div className="player-stats-level">
            <span className="level-badge">Lv.{levelProgress.level}</span>
          </div>
          <div className="player-stats-xp">
            <div className="xp-bar-container">
              <div className="xp-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="xp-text">
              {stats.xp.toLocaleString()} XP
              <span className="xp-to-next">({xpToNext} to next)</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default PlayerStats;
