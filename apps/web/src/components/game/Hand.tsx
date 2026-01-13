import type { HandProps } from '@vyrejack/shared';
import { PlayingCard } from './PlayingCard';

// Extend HandProps to allow omitting value display (for external rendering)
interface ExtendedHandProps extends HandProps {
  hideValue?: boolean;
}

export function Hand({
  cards,
  value,
  isSoft,
  isDealer = false,
  hideSecond = false,
  result,
  hideValue = false,
}: ExtendedHandProps) {
  // Determine visual state class for psychological feedback
  const getResultClass = () => {
    if (result === 'win') return 'hand-winner';
    if (result === 'blackjack') return 'hand-blackjack';
    if (result === 'lose') return 'hand-loser';
    if (result === 'push') return 'hand-push';
    return '';
  };

  // Get DEGEN-style value display
  const getValueDisplay = () => {
    if (value === undefined) return null;
    if (value === 21 && cards.length === 2) {
      return { text: '21', badge: 'BLACKJACK! 💎', class: 'value-blackjack' };
    }
    if (value > 21) {
      return { text: value.toString(), badge: 'BUST 💀', class: 'value-bust' };
    }
    if (value >= 19 && value <= 21) {
      return { text: value.toString(), badge: 'STRONG 🔥', class: 'value-strong' };
    }
    return { text: value.toString(), badge: null, class: 'value-normal' };
  };

  const valueInfo = getValueDisplay();

  return (
    <div
      className={`hand-container ${getResultClass()} ${isDealer ? 'hand-dealer' : 'hand-player'}`}
    >
      {/* Cards with staggered entrance animation */}
      <div className="hand-cards">
        {cards.map((card, index) => (
          <div
            key={`${card}-${index}`}
            className="hand-card"
            style={`--card-index: ${index}; z-index: ${index};`}
          >
            <PlayingCard
              cardIndex={card}
              faceUp={!(isDealer && index === 1 && hideSecond)}
              delay={index * 150}
              isNew={true}
            />
          </div>
        ))}
      </div>

      {/* Value display only if not hidden */}
      {!hideValue && valueInfo && (
        <div className={`hand-value ${valueInfo.class}`}>
          <span className="value-number">{valueInfo.text}</span>
          {isSoft && <span className="value-soft">soft</span>}
          {valueInfo.badge && <span className="value-badge">{valueInfo.badge}</span>}
        </div>
      )}
    </div>
  );
}

// Standalone value display component for external use
interface HandValueProps {
  value: number | undefined;
  isSoft?: boolean;
  cardCount?: number;
}

export function HandValue({ value, isSoft, cardCount = 0 }: HandValueProps) {
  // Show placeholder when no cards dealt to prevent layout shift
  if (value === undefined) {
    return (
      <div className="hand-value-standalone value-placeholder">
        <span className="value-number">--</span>
        <span className="value-type">&nbsp;</span>
      </div>
    );
  }

  let valueClass = 'value-normal';
  let badge: string | null = null;

  if (value === 21 && cardCount === 2) {
    valueClass = 'value-blackjack';
    badge = 'BLACKJACK!';
  } else if (value > 21) {
    valueClass = 'value-bust';
    badge = 'BUST';
  } else if (value >= 19 && value <= 21) {
    valueClass = 'value-strong';
    badge = 'STRONG';
  }

  return (
    <div className={`hand-value-standalone ${valueClass}`}>
      <span className="value-number">{value}</span>
      {/* Always show hard/soft for consistent height */}
      <span className="value-type">{isSoft ? 'soft' : 'hard'}</span>
      {badge && <span className="value-badge">{badge}</span>}
    </div>
  );
}
