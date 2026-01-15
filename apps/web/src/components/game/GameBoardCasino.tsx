/**
 * GameBoardCasino - Container for VyreCasino game
 *
 * 🏗️ ARCHITECTURE: This is a CONTAINER component that:
 * - Uses hooks for state management (all business logic in hooks)
 * - Passes state down to PURE UI components
 *
 * ⚡ PERFORMANCE:
 * - NO POLLING for game state (WebSocket events)
 * - Card accumulation from real-time events
 * - Snapshot mechanism preserves cards at game end
 *
 * 🎨 UX FEATURES (v4 - restored from ETH version):
 * - DEGEN result banner with neon colors
 * - Win celebration overlay
 * - Lose shake/flash effects
 * - XP popup on game end
 * - ShareVictory button
 */

import { useState, useMemo, useCallback, useRef } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { useVyreCasinoActions } from '@/hooks/useVyreCasinoActions';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useGameState } from '@/hooks/useGameState';
import { useTabFocus } from '@/hooks/useTabFocus';
import { emitBalanceChange } from '@/lib/balanceEvents';
import { BettingPanel } from './BettingPanel';
import { ActionButtons } from './ActionButtons';
import { XPGainPopup } from './XPGainPopup';
import { GameResultOverlay } from './GameResultOverlay';
import { CardDeck } from './CardDeck';
import { Hand, HandValue } from './Hand';
import { SkeletonHand } from './SkeletonHand';
import { MobileHistory } from './MobileHistory';
import { GameHistory } from './GameHistory';
import { ErrorToast } from './ErrorToast';
import { StorageService } from '@/services/storage.service';
import { logger } from '@/lib/logger';

interface GameBoardCasinoProps {
  token: `0x${string}`;
  tokenSymbol: string;
  tokenContext?: 'ETH' | 'CHIP' | 'USDC';
}

// XP popup state
interface XPPopupState {
  xp: number;
  key: number;
}

export function GameBoardCasino({ token, tokenSymbol, tokenContext }: GameBoardCasinoProps) {
  const [betAmount, setBetAmount] = useState('10');
  const [xpPopup, setXpPopup] = useState<XPPopupState | null>(null);

  // Derive context if not provided
  const context =
    tokenContext || (tokenSymbol === 'USDC' ? 'USDC' : tokenSymbol === 'CHIP' ? 'CHIP' : 'ETH');

  const wallet = useWallet();
  const isActiveTab = useTabFocus();

  // ⚡ Token balance hook - cached reads with polling
  const {
    formattedBalance,
    isApproved,
    refresh: refreshBalance,
  } = useTokenBalance(token, wallet.address as `0x${string}` | null);

  // ⚡ Game state hook - WebSocket events + card accumulation + snapshots
  const {
    game,
    playerValue,
    dealerValue,
    isPlayerTurn,
    hasActiveGame,
    showingResult,
    lastGameResult,
    clearLastResult,
    refetch: refetchGame,
    snapshotCards,
    accumulatedCards,
  } = useGameState(wallet.address as `0x${string}` | null);

  // XP popup when game ends
  const showXPPopup = useCallback((xp: number) => {
    setXpPopup({ xp, key: Date.now() });
  }, []);

  const hideXPPopup = useCallback(() => {
    setXpPopup(null);
  }, []);

  // Game WRITE actions hook
  const actions = useVyreCasinoActions({
    address: wallet.address as `0x${string}` | null,
    tokenContext: context,
    onSuccess: () => {
      logger.log('[GameBoardCasino] Action success, refreshing state');
      refreshBalance();
      refetchGame();
      emitBalanceChange();
    },
  });

  // Trigger XP popup when game result shows (win/blackjack = more XP)
  // Also save to game history
  const prevShowingResultRef = useRef(showingResult);
  if (showingResult && !prevShowingResultRef.current && lastGameResult) {
    const xpAmount =
      lastGameResult.result === 'blackjack' ? 100 : lastGameResult.result === 'win' ? 50 : 25;
    setTimeout(() => showXPPopup(xpAmount), 500);

    // Save to game history (only if result is defined)
    if (lastGameResult.result) {
      StorageService.addGameToHistory({
        result: lastGameResult.result,
        bet: betAmount,
        payout: lastGameResult.payout
          ? (Number(lastGameResult.payout) / (tokenSymbol === 'USDC' ? 1e6 : 1e18)).toString()
          : '0',
        playerCards: lastGameResult.playerCards,
        dealerCards: lastGameResult.dealerCards,
        playerValue: lastGameResult.playerValue,
        dealerValue: lastGameResult.dealerValue,
      });
    }
  }
  prevShowingResultRef.current = showingResult;

  // Quick bet amounts based on token
  const quickBets = useMemo(() => {
    if (tokenSymbol === 'USDC') {
      return ['1', '5', '10', '25', '50'];
    }
    return ['10', '50', '100', '500', '1000'];
  }, [tokenSymbol]);

  // Determine if can bet (not showing result, no active game)
  const canBet =
    isActiveTab && wallet.isConnected && !actions.isLoading && !hasActiveGame && !showingResult;

  // Wrapped actions that take snapshot before executing
  const handlePlaceBet = useCallback(() => {
    clearLastResult();
    actions.placeBet(betAmount, token);
  }, [actions, betAmount, token, clearLastResult]);

  const handleHit = useCallback(() => {
    snapshotCards();
    actions.hit();
  }, [actions, snapshotCards]);

  const handleStand = useCallback(() => {
    snapshotCards();
    actions.stand();
  }, [actions, snapshotCards]);

  const handleDouble = useCallback(() => {
    snapshotCards();
    actions.double();
  }, [actions, snapshotCards]);

  const handleSurrender = useCallback(() => {
    snapshotCards();
    actions.surrender();
  }, [actions, snapshotCards]);

  const handleNewGame = useCallback(() => {
    clearLastResult();
    refreshBalance();
    refetchGame();
  }, [clearLastResult, refreshBalance, refetchGame]);

  // Determine which cards/values to display
  const displayPlayerCards = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.playerCards;
    }
    if (accumulatedCards.playerCards.length >= 2) {
      return accumulatedCards.playerCards;
    }
    return game?.playerCards ?? [];
  }, [showingResult, lastGameResult, accumulatedCards, game]);

  const displayDealerCards = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.dealerCards;
    }
    if (accumulatedCards.dealerCards.length >= 1) {
      return accumulatedCards.dealerCards;
    }
    return game?.dealerCards ?? [];
  }, [showingResult, lastGameResult, accumulatedCards, game]);

  const displayPlayerValue =
    showingResult && lastGameResult ? lastGameResult.playerValue : playerValue;
  const displayDealerValue =
    showingResult && lastGameResult ? lastGameResult.dealerValue : dealerValue;
  const displayBet = showingResult && lastGameResult ? lastGameResult.bet : game?.bet;
  const displayResult = showingResult && lastGameResult ? lastGameResult.result : null;

  // Hide dealer's second card during player turn (not during result)
  const hideSecondCard = isPlayerTurn && !showingResult;

  // Format bet for display
  const formatBetDisplay = (bet: bigint | undefined) => {
    if (!bet) return '--';
    const decimals = tokenSymbol === 'USDC' ? 6 : 18;
    return (Number(bet) / 10 ** decimals).toFixed(decimals === 6 ? 2 : 0);
  };

  return (
    <div className="game-board-mobile bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Animated Error Toast */}
      {actions.error && (
        <ErrorToast
          message={actions.error}
          onDismiss={actions.clearError}
          type="error"
          autoDismissMs={6000}
        />
      )}

      <main className="max-w-6xl mx-auto p-2 sm:p-4 py-4 sm:py-8">
        {/* Game Area */}
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          {/* Casino Table with effects */}
          <div
            className={`casino-table ${actions.isLoading && displayPlayerCards.length === 0 ? 'dealing-anticipation' : ''} ${displayPlayerCards.length > 0 && !actions.isLoading ? 'dealing-complete' : ''} ${displayResult === 'blackjack' ? 'blackjack-glow' : ''} ${displayResult === 'lose' ? 'lose-shake' : ''} ${displayResult === 'lose' && displayPlayerValue && displayPlayerValue > 21 ? 'bust' : ''}`}
          >
            {/* Win celebration overlay */}
            {(displayResult === 'win' || displayResult === 'blackjack') && (
              <>
                <div className="win-flash" />
                <div className="win-celebration" />
              </>
            )}

            {/* Loss flash overlay */}
            {displayResult === 'lose' && <div className="lose-flash" />}

            {/* Card Deck - LEFT side - animates when waiting */}
            <CardDeck
              isDealing={actions.isLoading}
              cardsDealt={displayPlayerCards.length + displayDealerCards.length}
            />

            {/* Play Area */}
            <div className="relative z-10 px-2 sm:px-8 md:px-28 py-4 sm:py-6 md:py-10">
              {/* Dealer Zone */}
              <div className="dealer-zone">
                <div className="zone-label">Dealer</div>
                <div className="zone-row">
                  <div className="zone-spacer" />
                  <div className="play-zone">
                    {displayDealerCards.length > 0 ? (
                      <Hand
                        cards={displayDealerCards}
                        value={displayDealerValue ?? undefined}
                        isDealer
                        hideSecond={hideSecondCard}
                        result={displayResult === 'lose' ? 'win' : null}
                        hideValue
                      />
                    ) : actions.isLoading ? (
                      <SkeletonHand cardCount={2} isDealer />
                    ) : (
                      <span className="play-zone-empty">Deal to start</span>
                    )}
                  </div>
                  {/* Animated value display with colors */}
                  <HandValue
                    value={displayDealerCards.length > 0 ? displayDealerValue : undefined}
                    cardCount={displayDealerCards.length}
                  />
                </div>
              </div>

              {/* Player Zone */}
              <div className="player-zone">
                <div className="zone-row">
                  <div className="zone-spacer" />
                  <div className="play-zone">
                    {displayPlayerCards.length > 0 ? (
                      <Hand
                        cards={displayPlayerCards}
                        value={displayPlayerValue ?? undefined}
                        result={displayResult}
                        hideValue
                      />
                    ) : actions.isLoading ? (
                      <SkeletonHand cardCount={2} />
                    ) : (
                      <span className="play-zone-empty">Your cards</span>
                    )}
                  </div>
                  {/* Animated value display with colors */}
                  <HandValue
                    value={displayPlayerCards.length > 0 ? displayPlayerValue : undefined}
                    cardCount={displayPlayerCards.length}
                  />
                </div>
                <div className="zone-label">Your Hand</div>
              </div>

              {/* Bet display */}
              <div
                className={`bet-display-side ${displayBet && displayBet > 0n ? '' : 'bet-placeholder'}`}
              >
                <span className="bet-label">BET</span>
                <span className="bet-value">
                  {displayBet && displayBet > 0n
                    ? `${formatBetDisplay(displayBet)} ${tokenSymbol}`
                    : `-- ${tokenSymbol}`}
                </span>
              </div>

              {/* XP Gain Popup - stays on table */}
              {xpPopup && (
                <XPGainPopup key={xpPopup.key} xpAmount={xpPopup.xp} onComplete={hideXPPopup} />
              )}
            </div>

            {/* Blackjack payout text */}
            <div className="payout-text">Blackjack Pays 3 to 2</div>
          </div>

          {/* Controls */}
          <div className="controls-area-layout">
            <div className="controls-panel">
              {wallet.isConnected ? (
                showingResult ? (
                  // Show "New Game" button after result
                  <div className="space-y-4">
                    <button onClick={handleNewGame} className="deal-btn w-full">
                      <span className="deal-btn-content">
                        <span className="deal-btn-emoji">🎰</span>
                        PLAY AGAIN
                      </span>
                    </button>
                  </div>
                ) : hasActiveGame && isPlayerTurn ? (
                  <ActionButtons
                    onHit={handleHit}
                    onStand={handleStand}
                    onDouble={handleDouble}
                    onSurrender={handleSurrender}
                    canDouble={game?.playerCards.length === 2}
                    canSurrender={game?.playerCards.length === 2}
                    isLoading={actions.isLoading}
                  />
                ) : hasActiveGame ? (
                  <div className="text-center py-4">
                    <p className="text-yellow-400 animate-pulse">⏳ Waiting for dealer...</p>
                  </div>
                ) : (
                  <BettingPanel
                    betAmount={betAmount}
                    balance={formattedBalance}
                    tokenSymbol={tokenSymbol}
                    isApproved={isApproved}
                    isLoading={actions.isLoading}
                    canBet={canBet}
                    onBetAmountChange={setBetAmount}
                    onPlaceBet={handlePlaceBet}
                    quickBets={quickBets}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-4">
                  <p className="text-gray-400 mb-4 text-center">
                    Connect your wallet to start playing
                  </p>
                </div>
              )}
            </div>

            {/* Desktop History - full details panel */}
            <div className="hidden md:block">{wallet.isConnected && <GameHistory />}</div>
          </div>

          {/* Session Key Hint */}
          {!wallet.hasSessionKey && wallet.isConnected && !showingResult && (
            <div className="text-center text-sm text-purple-400 bg-purple-900/20 rounded-lg py-3 border border-purple-500/20">
              💡 Enable <strong>Fast Mode</strong> above for instant, popup-free gameplay!
            </div>
          )}

          {/* Mobile History - shows last 3 game results (hidden on desktop) */}
          <div className="md:hidden">{wallet.isConnected && <MobileHistory />}</div>
        </div>
      </main>

      {/* Full-screen result overlay */}
      {showingResult && lastGameResult && displayResult && (
        <GameResultOverlay
          result={displayResult}
          playerCards={[...displayPlayerCards]}
          dealerCards={[...displayDealerCards]}
          playerValue={displayPlayerValue ?? 0}
          dealerValue={displayDealerValue ?? 0}
          bet={betAmount}
          payout={lastGameResult.payout ? formatBetDisplay(lastGameResult.payout) : undefined}
          tokenSymbol={tokenSymbol}
          xpEarned={xpPopup?.xp}
          onPlayAgain={(newBet) => {
            // Clear previous result and start new game with selected bet
            clearLastResult();
            setBetAmount(newBet);
            actions.placeBet(newBet, token);
          }}
          onChangeBet={handleNewGame}
        />
      )}
    </div>
  );
}
