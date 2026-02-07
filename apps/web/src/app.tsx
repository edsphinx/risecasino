import { Route, Switch } from 'wouter-preact';
import { useState } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { WalletProvider, useWallet } from './context/WalletContext';
import { FastModeOnboarding, SessionExpiryModal } from './components/wallet/SessionModals';
import { WalletRecoveryModal } from './components/wallet/WalletRecoveryModal';
import { ModalErrorBoundary } from './components/common/ErrorBoundary';
import { PageLoader } from './components/common/PageLoader';
import { AppLoader } from './components/common/AppLoader';
import { Header } from './components/layout/Header';

// Lazy-loaded pages - each becomes a separate chunk
const Home = lazy(() => import('./pages/Home'));
const VyreJackUsdc = lazy(() => import('./pages/games/VyreJackUsdc'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const Admin = lazy(() => import('./pages/Admin'));

// =============================================================================
// SESSION MODAL MANAGER
// =============================================================================

/**
 * SessionModalManager - Handles onboarding and session expiry modals.
 * Wraps children and shows modals based on wallet state.
 */
function SessionModalManager({ children }: { children: ComponentChildren }) {
  const wallet = useWallet();

  return (
    <>
      {children}

      {/* Onboarding Modal - first time users */}
      {wallet.showOnboarding && (
        <ModalErrorBoundary onDismiss={() => wallet.dismissOnboarding(false)}>
          <FastModeOnboarding
            onEnable={async () => await wallet.dismissOnboarding(true)}
            onSkip={() => wallet.dismissOnboarding(false)}
            isLoading={wallet.isCreatingSession}
          />
        </ModalErrorBoundary>
      )}

      {/* Session Expiry Modal - when session expires */}
      {wallet.showExpiryModal && (
        <ModalErrorBoundary onDismiss={() => wallet.dismissExpiryModal(false)}>
          <SessionExpiryModal
            onExtend={async () => await wallet.dismissExpiryModal(true)}
            onSkip={() => wallet.dismissExpiryModal(false)}
            isLoading={wallet.isCreatingSession}
          />
        </ModalErrorBoundary>
      )}

      {/* Wallet Recovery Modal - when connection fails repeatedly */}
      {wallet.showRecoveryModal && (
        <WalletRecoveryModal
          isOpen={wallet.showRecoveryModal}
          onClose={wallet.closeRecoveryModal}
          onRecoveryComplete={wallet.handleRecoveryComplete}
        />
      )}
    </>
  );
}

// =============================================================================
// APP ROOT
// =============================================================================

export function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Show splash screen while preloading heavy deps
  if (isLoading) {
    return <AppLoader onLoadComplete={() => setIsLoading(false)} />;
  }

  return (
    <WalletProvider>
      <SessionModalManager>
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 font-sans selection:bg-purple-500/30 text-white">
          <Header />

          <main>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/vyrejack" component={VyreJackUsdc} />
                <Route path="/games/vyrejack" component={VyreJackUsdc} />
                <Route path="/games/vyrejack/usdc" component={VyreJackUsdc} />
                {/* Legacy routes - redirect to USDC */}
                <Route path="/games/vyrejack-usdc" component={VyreJackUsdc} />
                <Route path="/games/vyrejack-eth" component={VyreJackUsdc} />
                <Route path="/games/vyrejack/eth" component={VyreJackUsdc} />
                <Route path="/leaderboard" component={LeaderboardPage} />
                <Route path="/admin" component={Admin} />

                {/* Fallback to Home */}
                <Route component={Home} />
              </Switch>
            </Suspense>
          </main>
        </div>
      </SessionModalManager>
    </WalletProvider>
  );
}
