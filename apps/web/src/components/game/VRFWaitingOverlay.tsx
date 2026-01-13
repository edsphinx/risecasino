/**
 * VRFWaitingOverlay - Overlay shown when game is stuck waiting for VRF
 *
 * Shows different UI based on time elapsed:
 * - 0-60s: "Dealing cards..." spinner
 * - 60s-5min: "VRF delayed" + Retry button
 * - >5min: "Game stuck" + Cancel & Refund button
 */

import { useState, useEffect } from 'preact/hooks';

// Contract timeouts (matching VyreJack.sol)
const VRF_TIMEOUT_SECONDS = 60; // Can retry after 60s
const GAME_TIMEOUT_SECONDS = 300; // Can cancel after 5 minutes

interface VRFWaitingOverlayProps {
  gameTimestamp: bigint; // Unix timestamp when game started
  onCancel: () => Promise<boolean>;
  isLoading: boolean;
}

export function VRFWaitingOverlay({ gameTimestamp, onCancel, isLoading }: VRFWaitingOverlayProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  // Update elapsed time every second
  useEffect(() => {
    const updateElapsed = () => {
      const now = Math.floor(Date.now() / 1000);

      // Safe BigInt to Number conversion with comprehensive bounds checking
      // Note: BigInt comparison operators (>, <) work correctly between BigInts
      let gameStart: number;

      // Handle edge cases: invalid timestamps (0, negative, or impossibly large)
      if (gameTimestamp <= 0n) {
        // Invalid timestamp - treat as just started
        gameStart = now;
      } else {
        // JavaScript's MAX_SAFE_INTEGER is 2^53-1 (9007199254740991)
        // This is ~285 million years from Unix epoch, so safe for any real timestamp
        const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
        // Clamp to safe range before converting to Number
        const safeTimestamp = gameTimestamp > MAX_SAFE ? MAX_SAFE : gameTimestamp;
        gameStart = Number(safeTimestamp);
      }

      // Ensure elapsed is never negative (handles clock skew or future timestamps)
      setElapsedSeconds(Math.max(0, now - gameStart));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [gameTimestamp]);

  // Determine which state we're in
  const canRetry = elapsedSeconds >= VRF_TIMEOUT_SECONDS;
  const canCancel = elapsedSeconds >= GAME_TIMEOUT_SECONDS;

  // Format elapsed time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle cancel click
  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  // Early phase - just dealing cards, normal wait
  if (!canRetry) {
    return (
      <div className="vrf-overlay vrf-overlay-dealing">
        <div className="vrf-spinner" />
        <p className="vrf-message">Dealing cards...</p>
        <p className="vrf-submessage">Waiting for randomness</p>
      </div>
    );
  }

  // VRF delayed - show retry/cancel options
  return (
    <div className="vrf-overlay vrf-overlay-delayed">
      <div className="vrf-icon">⚠️</div>
      <h3 className="vrf-title">VRF Delayed</h3>
      <p className="vrf-message">
        The random number service is slow.
        <br />
        <strong>Your bet is safe.</strong>
      </p>

      <div className="vrf-timer">
        <span className="vrf-timer-label">Waiting:</span>
        <span className="vrf-timer-value">{formatTime(elapsedSeconds)}</span>
      </div>

      {/* Cancel button - only available after 5 minutes */}
      {canCancel ? (
        <button
          onClick={handleCancel}
          disabled={isLoading || isCancelling}
          className="vrf-btn vrf-btn-cancel"
        >
          {isCancelling ? (
            <>
              <span className="vrf-btn-spinner" />
              Cancelling...
            </>
          ) : (
            <>🚪 Cancel & Get Full Refund</>
          )}
        </button>
      ) : (
        <div className="vrf-wait-info">
          <p className="vrf-wait-text">
            Cancel available in {formatTime(GAME_TIMEOUT_SECONDS - elapsedSeconds)}
          </p>
        </div>
      )}

      <p className="vrf-hint">This can happen when the Rise VRF service is congested.</p>
    </div>
  );
}
