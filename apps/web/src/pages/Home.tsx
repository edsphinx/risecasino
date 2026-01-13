/**
 * Home - Casino lobby page
 * Composes subcomponents, minimal logic in this file
 */

import { Logo } from '@/components/brand/Logo';
import { useWallet } from '@/context/WalletContext';
import { useGameNavigation } from '@/hooks/useGameNavigation';
import { GameVersionSelector } from '@/components/home/GameVersionSelector';
import { LiveStats } from '@/components/home/LiveStats';
import { LiveWinsTicker } from '@/components/home/LiveWinsTicker';
import { ComingSoonCard } from '@/components/home/ComingSoonCard';
import { LeaderboardPreview } from '@/components/home/LeaderboardPreview';
import { PoweredByRise } from '@/components/home/PoweredByRise';
import { Footer } from '@/components/common/Footer';

// Mock data - in production, fetch from backend/contract
const LIVE_STATS = {
  playersOnline: 147,
  totalPot: 4.28,
  biggestWin: 0.89,
};

const COMING_SOON_GAMES = [
  { icon: '🎡', title: 'Roulette', description: 'European single-zero' },
  { icon: '🍒', title: 'Rise Slots', description: 'High volatility custom slots' },
  { icon: '🃏', title: 'Video Poker', description: 'Jacks or Better' },
];

export function Home() {
  const wallet = useWallet();

  // Simple game navigation - just connect and go
  const { navigate } = useGameNavigation();

  // Hero CTA → Navigate to VyreJack
  const navigateToGame = () => navigate();

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-bg-glow" />
        <div className="hero-bg-grid" />

        <div className="hero-content">
          {/* Left - Branding & CTA */}
          <div className="hero-left">
            <Logo className="hero-logo" />

            <h1 className="hero-title">
              <span className="gradient-text">REAL CASINO</span> EXPERIENCE
              <span className="hero-title-sub">ON-CHAIN</span>
            </h1>

            <p className="hero-subtitle">
              Play VyreJack with USDC • Web2-like UX, trustless under the hood
              <br />
              <span className="hero-subtitle-tech">
                3-10ms Shreds • Enshrined VRF • Provably fair smart contracts
              </span>
            </p>

            <HeroCTA
              isConnected={wallet.isConnected}
              isConnecting={wallet.isConnecting}
              onConnect={wallet.connect}
              onPlay={navigateToGame}
            />
          </div>

          {/* Right - Leaderboard (expanded) */}
          <div className="hero-right">
            <LeaderboardPreview />
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <LiveStats {...LIVE_STATS} />

      {/* Live Wins - Real-time via Shreds WebSocket */}
      <LiveWinsTicker />

      {/* Powered by Rise - Showcasing Rise Chain tech */}
      <PoweredByRise />

      {/* Game Version Selector - Choose CHIP, USDC, or ETH */}
      <GameVersionSelector />

      {/* Coming Soon Games */}
      <section className="games-section">
        <h2 className="section-title">🎰 All Games</h2>
        <div className="games-grid">
          {COMING_SOON_GAMES.map((game) => (
            <ComingSoonCard key={game.title} {...game} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// Internal sub-component for Hero CTA
interface HeroCTAProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onPlay: () => void;
}

function HeroCTA({ isConnected, isConnecting, onConnect, onPlay }: HeroCTAProps) {
  if (!isConnected) {
    return (
      <button className="hero-cta-primary" onClick={onConnect} disabled={isConnecting}>
        {isConnecting ? <>⏳ Connecting...</> : <>⚡ Connect Wallet to Play</>}
      </button>
    );
  }

  return (
    <button className="hero-cta-primary" onClick={onPlay}>
      <img src="/assets/suits/spade.svg" alt="" className="cta-spade-icon" />
      Play VyreJack Now
    </button>
  );
}

export default Home;
