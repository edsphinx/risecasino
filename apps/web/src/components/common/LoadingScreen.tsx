/**
 * LoadingScreen - Casino-themed loading screen for Vyre Casino
 * Features: Shimmer effect, bouncing chips, dancing card symbols
 */

import { Logo } from '@/components/brand/Logo';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-bg-glow" />
      <div className="loading-content">
        {/* Logo */}
        <div className="loading-logo">
          <Logo className="animated-logo" />
        </div>

        {/* Bouncing Chips */}
        <div className="loading-chips">
          <span className="chip" />
          <span className="chip" />
          <span className="chip" />
        </div>

        {/* Shimmer Progress Bar */}
        <div className="loading-shimmer">
          <div className="shimmer-bar" />
        </div>

        {/* Message */}
        <p className="loading-message">{message}</p>

        {/* Card Symbols */}
        <div className="loading-cards">
          <span className="floating-card">♠</span>
          <span className="floating-card">♥</span>
          <span className="floating-card">♦</span>
          <span className="floating-card">♣</span>
        </div>
      </div>
    </div>
  );
}
