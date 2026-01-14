/**
 * ErrorToast - Animated error overlay with GSAP
 *
 * Features:
 * - Slides in from top with bounce
 * - Shakes on entry for attention
 * - Auto-dismisses after delay
 * - Click to dismiss
 * - DEGEN-style messaging
 */

import { useEffect, useRef } from 'preact/hooks';
import gsap from 'gsap';

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms (default: 5000, 0 = no auto) */
  autoDismissMs?: number;
  /** Error type for styling */
  type?: 'error' | 'warning' | 'info';
}

// DEGEN-style error messages
const ERROR_CONFIG = {
  error: {
    emoji: '💀',
    title: 'REKT!',
    bgClass: 'error-toast-error',
  },
  warning: {
    emoji: '⚠️',
    title: 'HOLD UP!',
    bgClass: 'error-toast-warning',
  },
  info: {
    emoji: '💡',
    title: 'FYI',
    bgClass: 'error-toast-info',
  },
} as const;

export function ErrorToast({
  message,
  onDismiss,
  autoDismissMs = 5000,
  type = 'error',
}: ErrorToastProps) {
  const toastRef = useRef<HTMLDivElement>(null);
  const config = ERROR_CONFIG[type];

  // GSAP entrance animation
  useEffect(() => {
    const toast = toastRef.current;
    if (!toast) return;

    // Set initial state
    gsap.set(toast, {
      y: -100,
      opacity: 0,
      scale: 0.9,
    });

    // Entrance timeline
    const tl = gsap.timeline();

    // Slide in with bounce
    tl.to(toast, {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: 'back.out(1.7)',
    });

    // Shake for attention
    tl.to(toast, {
      x: -10,
      duration: 0.05,
    });
    tl.to(toast, {
      x: 10,
      duration: 0.05,
    });
    tl.to(toast, {
      x: -8,
      duration: 0.04,
    });
    tl.to(toast, {
      x: 8,
      duration: 0.04,
    });
    tl.to(toast, {
      x: 0,
      duration: 0.06,
      ease: 'power2.out',
    });

    // Subtle pulse
    tl.to(toast, {
      scale: 1.02,
      duration: 0.15,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut',
    });

    // Auto-dismiss
    let dismissTimeout: number | undefined;
    if (autoDismissMs > 0) {
      dismissTimeout = window.setTimeout(() => {
        animateOut();
      }, autoDismissMs);
    }

    return () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      tl.kill();
    };
  }, [autoDismissMs]);

  // Animate out and dismiss
  const animateOut = () => {
    const toast = toastRef.current;
    if (!toast) {
      onDismiss();
      return;
    }

    gsap.to(toast, {
      y: -50,
      opacity: 0,
      scale: 0.9,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: onDismiss,
    });
  };

  return (
    <div className="error-toast-overlay" onClick={animateOut}>
      <div
        ref={toastRef}
        className={`error-toast ${config.bgClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="error-toast-content">
          <span className="error-toast-emoji">{config.emoji}</span>
          <div className="error-toast-text">
            <h3 className="error-toast-title">{config.title}</h3>
            <p className="error-toast-message">{message}</p>
          </div>
          <button className="error-toast-close" onClick={animateOut}>
            ✕
          </button>
        </div>

        {/* Progress bar for auto-dismiss */}
        {autoDismissMs > 0 && (
          <div
            className="error-toast-progress"
            style={{ animationDuration: `${autoDismissMs}ms` }}
          />
        )}
      </div>
    </div>
  );
}
