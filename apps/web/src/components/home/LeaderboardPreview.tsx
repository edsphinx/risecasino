/**
 * LeaderboardPreview - Top 5 players preview for homepage
 * Provides social proof and gamification visibility
 * Uses Shreds WebSocket for auto-refresh when wins happen
 *
 * Features:
 * - Smooth transitions on data updates (no flicker)
 * - Change detection to avoid unnecessary re-renders
 * - CSS animations for rank changes
 */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { getLiveLeaderboard, type LeaderboardEntry } from '@/lib/api';
import { useLeaderboardSubscription } from '@/hooks/useLeaderboardSubscription';

export function LeaderboardPreview() {
  const [, setLocation] = useLocation();
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const prevLeadersRef = useRef<string>('');

  const fetchLeaders = useCallback(async () => {
    try {
      const data = await getLiveLeaderboard('xp', 5);
      const newEntries = data.entries || [];

      // Create a stable comparison string
      const newDataHash = JSON.stringify(
        newEntries.map((e) => ({
          w: e.walletAddress,
          v: e.value,
          r: e.rank,
        }))
      );

      // Only update state if data actually changed
      if (newDataHash !== prevLeadersRef.current) {
        prevLeadersRef.current = newDataHash;
        setLeaders(newEntries);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [isInitialLoad]);

  // Initial fetch
  useEffect(() => {
    fetchLeaders();
  }, [fetchLeaders]);

  // Auto-refresh when wins happen via Shreds WebSocket
  useLeaderboardSubscription({ onUpdate: fetchLeaders });

  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const formatXP = (value: string | undefined | null) => {
    const xp = Number(value) || 0;
    if (xp >= 1000000) return `${(xp / 1000000).toFixed(1)}M`;
    return xp.toLocaleString();
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="leaderboard-preview">
      <div className="leaderboard-preview-header">
        <h3>🏆 Top Players</h3>
        <button className="view-all-btn" onClick={() => setLocation('/leaderboard')}>
          View All →
        </button>
      </div>

      {isInitialLoad ? (
        <div className="leaderboard-loading">Loading...</div>
      ) : leaders.length === 0 ? (
        <div className="leaderboard-empty">No players yet. Be the first!</div>
      ) : (
        <div className="leaderboard-list">
          {leaders.map((leader, idx) => {
            const xp = Number(leader.value) || 0;
            const level = Math.floor(Math.sqrt(xp / 100)) + 1; // Simple level calc
            return (
              <div key={leader.walletAddress} className={`leaderboard-row rank-${idx + 1}`}>
                <span className="rank">{getMedal(idx + 1)}</span>
                <span className="player-info">
                  <span className="display-name">
                    {leader.displayName || truncateAddress(leader.walletAddress)}
                  </span>
                </span>
                <span className="lvl">Lvl {level}</span>
                <span className="xp">{formatXP(leader.value)} XP</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
