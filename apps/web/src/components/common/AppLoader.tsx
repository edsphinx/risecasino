/**
 * AppLoader - Casino-themed splash screen
 * Features: Orbiting cards, neon glow effects
 */

import { useState, useEffect } from 'preact/hooks';
import { Logo } from '@/components/brand/Logo';

interface AppLoaderProps {
  onLoadComplete: () => void;
  minimumDisplayTime?: number;
}

export function AppLoader({ onLoadComplete, minimumDisplayTime = 2000 }: AppLoaderProps) {
  const [statusText, setStatusText] = useState('Loading...');

  useEffect(() => {
    const startTime = Date.now();
    let loaded = false;

    const loadStages = async () => {
      setStatusText('Shuffling the deck...');
      await delay(400);

      setStatusText('Connecting to Rise Chain...');
      try {
        await import('rise-wallet');
      } catch {
        // Silent fail
      }

      setStatusText('Dealing cards...');
      try {
        await import('viem');
      } catch {
        // Silent fail
      }

      setStatusText('Ready to play!');
      loaded = true;

      const elapsed = Date.now() - startTime;
      if (elapsed < minimumDisplayTime) {
        await delay(minimumDisplayTime - elapsed);
      }

      await delay(200);
      onLoadComplete();
    };

    loadStages();

    const timeout = setTimeout(() => {
      if (!loaded) onLoadComplete();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [onLoadComplete, minimumDisplayTime]);

  return (
    <div className="app-loader">
      {/* Neon background */}
      <div className="loader-neon-bg" />

      {/* Orbiting cards */}
      <div className="cards-orbit">
        <span className="orbit-card card-spade">♠</span>
        <span className="orbit-card card-heart">♥</span>
        <span className="orbit-card card-diamond">♦</span>
        <span className="orbit-card card-club">♣</span>
      </div>

      <div className="app-loader-content">
        {/* Logo with glow */}
        <div className="loader-logo-wrapper">
          <Logo variant="vyrecasino" size="full" animated={false} />
        </div>

        {/* Status with neon effect */}
        <p className="loader-status">{statusText}</p>
      </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
