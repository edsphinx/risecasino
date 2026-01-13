import { useState } from 'preact/hooks';
import type { ActionButtonsProps } from '@vyrejack/shared';

type ActionType = 'hit' | 'stand' | 'double' | 'surrender' | null;

/**
 * DEGEN UX Action Buttons
 *
 * Psychological optimization for house advantage:
 * - HIT: Most attractive (green, energetic copy) - more hits = more bust risk
 * - DOUBLE: Urgent/exciting (gold, FOMO copy) - doubles the bet
 * - STAND: Neutral (amber, calm copy) - ends play
 * - SURRENDER: Least attractive (muted, subdued) - returns half bet
 */
export function ActionButtons({
  onHit,
  onStand,
  onDouble,
  onSurrender,
  canDouble,
  canSurrender,
  isLoading,
}: ActionButtonsProps) {
  const [pendingAction, setPendingAction] = useState<ActionType>(null);

  // Wrapper to track which action is pending
  const handleAction = async (action: ActionType, handler: () => void | Promise<unknown>) => {
    setPendingAction(action);
    try {
      await handler();
    } finally {
      setPendingAction(null);
    }
  };

  // Show spinner overlay only on the clicked button
  const ButtonContent = ({
    label,
    emoji,
    action,
  }: {
    label: string;
    emoji: string;
    action: ActionType;
  }) => {
    const isPending = pendingAction === action && isLoading;
    return (
      <>
        {/* Text - stays visible but dimmed when loading */}
        <span className={`btn-content ${isPending ? 'opacity-0' : ''}`}>
          <span className="btn-emoji">{emoji}</span>
          <span className="btn-label">{label}</span>
        </span>
        {/* Spinner overlay */}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </>
    );
  };

  // Any action pending means disable all buttons
  const anyPending = isLoading || pendingAction !== null;

  return (
    <div className="action-buttons-container">
      {/* Row 1: Risky actions - HIT + DOUBLE */}
      {/* HIT - Most attractive (house benefits from busts) */}
      <button
        onClick={() => handleAction('hit', onHit)}
        disabled={anyPending}
        className="action-btn action-btn-hit"
      >
        <ButtonContent label="HIT ME" emoji="🎯" action="hit" />
      </button>

      {/* DOUBLE - Exciting/FOMO (doubles the bet) */}
      <button
        onClick={() => handleAction('double', onDouble)}
        disabled={anyPending || !canDouble}
        className={`action-btn action-btn-double ${!canDouble ? 'disabled-muted' : ''}`}
      >
        <ButtonContent label="2X" emoji="💰" action="double" />
      </button>

      {/* Row 2: Conservative actions - STAND + SURRENDER */}
      {/* STAND - Neutral option */}
      <button
        onClick={() => handleAction('stand', onStand)}
        disabled={anyPending}
        className="action-btn action-btn-stand"
      >
        <ButtonContent label="HODL" emoji="✋" action="stand" />
      </button>

      {/* SURRENDER - Least attractive (player recovers money) */}
      <button
        onClick={() => handleAction('surrender', onSurrender)}
        disabled={anyPending || !canSurrender}
        className={`action-btn action-btn-surrender ${!canSurrender ? 'disabled-muted' : ''}`}
      >
        <ButtonContent label="SURRENDER" emoji="🏳️" action="surrender" />
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}
