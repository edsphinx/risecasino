import type { HandProps } from '@vyrejack/shared';
import { useRef, useEffect } from 'preact/hooks';
import gsap from 'gsap';
import { PlayingCard } from './PlayingCard';
import { HiddenCard } from './HiddenCard';

// Extend HandProps to allow omitting value display and sequential flip control
interface ExtendedHandProps extends HandProps {
  hideValue?: boolean;
  /** Indices of cards that have been flipped (for sequential reveal) */
  flippedIndices?: number[];
}

export function Hand({
  cards,
  value,
  isSoft,
  isDealer = false,
  result,
  hideValue = false,
  flippedIndices,
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
      <div
        className={`hand-cards ${cards.length >= 5 ? 'hand-cards-compact' : ''}`}
        style={`--card-total: ${cards.length};`}
      >
        {cards.map((card, index) => {
          // ⚠️ SECURITY: card === -1 means placeholder (hidden card, no real value in DOM)
          const isHiddenCard = card === -1;

          // ⚡ SEQUENTIAL FLIP: Card is face-up if included in flippedIndices,
          // or if flippedIndices is not provided (backwards compat)
          const isFaceUp = flippedIndices ? flippedIndices.includes(index) : true;

          return (
            <div
              key={`${isHiddenCard ? 'hidden' : card}-${index}`}
              className="hand-card"
              style={`--card-index: ${index}; z-index: ${index};`}
            >
              {isHiddenCard ? (
                <HiddenCard dealIndex={index} delay={index * 150} isNew={true} />
              ) : (
                <PlayingCard cardIndex={card} faceUp={isFaceUp} delay={index * 150} isNew={true} />
              )}
            </div>
          );
        })}
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
  const valueRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef<number | undefined>(undefined);

  // ⚡ GSAP: Animate value changes with countUp + scale pulse
  useEffect(() => {
    if (valueRef.current && value !== undefined && prevValueRef.current !== value) {
      const el = valueRef.current;

      // CountUp animation
      gsap.fromTo(
        el,
        { textContent: prevValueRef.current || 0 },
        {
          textContent: value,
          duration: 0.3,
          snap: { textContent: 1 },
          ease: 'power1.out',
        }
      );

      // Scale pulse for emphasis
      gsap.fromTo(el, { scale: 1.3 }, { scale: 1, duration: 0.25, ease: 'back.out(1.7)' });

      prevValueRef.current = value;
    }
  }, [value]);

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
      <span ref={valueRef} className="value-number">
        {value}
      </span>
      {/* Always show hard/soft for consistent height */}
      <span className="value-type">{isSoft ? 'soft' : 'hard'}</span>
      {badge && <span className="value-badge">{badge}</span>}
    </div>
  );
}
