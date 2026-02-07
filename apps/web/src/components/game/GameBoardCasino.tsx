/**
 * GameBoardCasino - Container for VyreCasino game
 *
 * ARCHITECTURE: This is a CONTAINER component that:
 * - Uses hooks for state management (all business logic in hooks)
 * - Passes state down to PURE UI components
 * - gamePhase from store is the single source of truth for game flow
 *
 * PERFORMANCE:
 * - NO POLLING for game state (WebSocket events)
 * - SSOT card display via gameCards + revealedCount
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { useVyreCasinoActions } from '@/hooks/useVyreCasinoActions';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useGameState } from '@/hooks/useGameState';
import { useTabFocus } from '@/hooks/useTabFocus';
import { useAnimationOrchestrator } from '@/hooks/useAnimationOrchestrator';
import { useGameStore, selectGamePhase } from '@/stores/gameStore';
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

interface XPPopupState {
  xp: number;
  key: number;
}

export function GameBoardCasino({ token, tokenSymbol, tokenContext }: GameBoardCasinoProps) {
  const [betAmount, setBetAmount] = useState('10');
  const [xpPopup, setXpPopup] = useState<XPPopupState | null>(null);

  // Overlay timing: delay between result arriving and overlay showing (for dealer animation)
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  // Derive context if not provided
  const context =
    tokenContext || (tokenSymbol === 'USDC' ? 'USDC' : tokenSymbol === 'CHIP' ? 'CHIP' : 'ETH');

  const wallet = useWallet();
  const isActiveTab = useTabFocus();

  // Animation orchestrator - manages staggered card reveals
  useAnimationOrchestrator();

  // Game phase from store (single source of truth)
  const gamePhase = useGameStore(selectGamePhase);
  const { resetAnimationState, clearGameCards, setGamePhase } = useGameStore();

  // SSOT: Get raw state for card display
  const gameCards = useGameStore((s) => s.gameCards);
  const revealedCount = useGameStore((s) => s.revealedCount);
  const isHiddenCardFlipped = useGameStore((s) => s.isHiddenCardFlipped);

  // Token balance hook
  const {
    formattedBalance,
    isApproved,
    refresh: refreshBalance,
  } = useTokenBalance(token, wallet.address as `0x${string}` | null);

  // Game state hook - WebSocket events + SSOT management
  const {
    game,
    isPlayerTurn,
    hasActiveGame,
    showingResult,
    lastGameResult,
    clearLastResult,
    refetch: refetchGame,
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

  // Determine if can bet (idle phase, not loading, no active game)
  const canBet =
    isActiveTab &&
    wallet.isConnected &&
    !actions.isLoading &&
    !hasActiveGame &&
    !showingResult &&
    gamePhase === 'idle';

  // Game actions
  const handlePlaceBet = useCallback(() => {
    // Double-click guard: only allow from idle phase
    const currentPhase = useGameStore.getState().gamePhase;
    if (currentPhase !== 'idle') {
      logger.log('[GameBoardCasino] Ignoring bet - phase is:', currentPhase);
      return;
    }
    clearLastResult();
    resetAnimationState();
    clearGameCards();
    setGamePhase('waiting_vrf');
    actions.placeBet(betAmount, token);
  }, [
    actions,
    betAmount,
    token,
    clearLastResult,
    resetAnimationState,
    clearGameCards,
    setGamePhase,
  ]);

  const handleHit = useCallback(() => {
    actions.hit();
  }, [actions]);

  const handleStand = useCallback(() => {
    actions.stand();
  }, [actions]);

  const handleDouble = useCallback(() => {
    actions.double();
  }, [actions]);

  const handleSurrender = useCallback(() => {
    actions.surrender();
  }, [actions]);

  const handleNewGame = useCallback(() => {
    clearLastResult();
    resetAnimationState();
    clearGameCards();
    refreshBalance();
    refetchGame();
  }, [clearLastResult, resetAnimationState, clearGameCards, refreshBalance, refetchGame]);

  // SSOT: Compute display cards from raw state
  const displayPlayerCards = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.playerCards;
    }
    return gameCards.playerCards.slice(0, revealedCount.player);
  }, [showingResult, lastGameResult, gameCards.playerCards, revealedCount.player]);

  const displayDealerCards = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.dealerCards;
    }
    const cards = gameCards.dealerCards.slice(0, revealedCount.dealer);
    if (cards.length >= 2 && !isHiddenCardFlipped) {
      return [cards[0], -1, ...cards.slice(2)];
    }
    return cards;
  }, [
    showingResult,
    lastGameResult,
    gameCards.dealerCards,
    revealedCount.dealer,
    isHiddenCardFlipped,
  ]);

  // SSOT: Derive flipped indices
  const ssotFlippedPlayerIndices = useMemo(() => {
    return Array.from({ length: revealedCount.player }, (_, i) => i);
  }, [revealedCount.player]);

  const ssotFlippedDealerIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < revealedCount.dealer; i++) {
      if (i !== 1 || isHiddenCardFlipped) {
        indices.push(i);
      }
    }
    return indices;
  }, [revealedCount.dealer, isHiddenCardFlipped]);

  // Calculate player value from display cards
  const displayPlayerValue = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.playerValue;
    }
    if (displayPlayerCards.length === 0) return undefined;

    let value = 0;
    let aces = 0;
    for (const card of displayPlayerCards) {
      const rank = card % 13;
      if (rank === 0) {
        aces++;
        value += 11;
      } else if (rank >= 10) {
        value += 10;
      } else {
        value += rank + 1;
      }
    }
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return value;
  }, [showingResult, lastGameResult, displayPlayerCards]);

  // Calculate dealer value only from VISIBLE cards (not -1 placeholder)
  const displayDealerValue = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.dealerValue;
    }
    const visibleCards = displayDealerCards.filter((c) => c !== -1);
    if (visibleCards.length === 0) return undefined;

    let value = 0;
    let aces = 0;
    for (const card of visibleCards) {
      const rank = card % 13;
      if (rank === 0) {
        aces++;
        value += 11;
      } else if (rank >= 10) {
        value += 10;
      } else {
        value += rank + 1;
      }
    }
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return value;
  }, [showingResult, lastGameResult, displayDealerCards]);

  const displayBet = showingResult && lastGameResult ? lastGameResult.bet : game?.bet;
  const displayResult = showingResult && lastGameResult ? lastGameResult.result : null;

  // Hide dealer's second card ALWAYS except when showing final result
  const hideSecondCard = !showingResult;

  // Result overlay timing: delay showing overlay to let dealer animation play
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (showingResult && !showResultOverlay) {
      // Use SSOT dealer cards count for accurate animation timing
      const ssotDealerCount = useGameStore.getState().gameCards.dealerCards.length;
      const dealerCardCount = ssotDealerCount || lastGameResult?.dealerCards.length || 2;
      const animationTime = 300 + Math.max(0, dealerCardCount - 2) * 300 + 800;

      overlayTimerRef.current = setTimeout(() => {
        overlayTimerRef.current = null;
        setGamePhase('showing_result');
        setShowResultOverlay(true);
      }, animationTime);

      return () => {
        if (overlayTimerRef.current) {
          clearTimeout(overlayTimerRef.current);
          overlayTimerRef.current = null;
        }
      };
    }

    // Reset overlay when result is cleared
    if (!showingResult && showResultOverlay) {
      setShowResultOverlay(false);
    }
  }, [showingResult, showResultOverlay, lastGameResult, setGamePhase]);

  // Format bet for display
  const formatBetDisplay = (bet: bigint | undefined) => {
    if (!bet) return '--';
    const decimals = tokenSymbol === 'USDC' ? 6 : 18;
    return (Number(bet) / 10 ** decimals).toFixed(decimals === 6 ? 2 : 0);
  };

  // Is waiting for dealer (not player's turn, game active but not showing result yet)
  const isWaitingDealer =
    gamePhase === 'dealer_reveal' ||
    gamePhase === 'dealer_hitting' ||
    (hasActiveGame && !isPlayerTurn && !showingResult);

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
                        flippedIndices={ssotFlippedDealerIndices}
                      />
                    ) : actions.isLoading ? (
                      <SkeletonHand cardCount={2} isDealer />
                    ) : (
                      <span className="play-zone-empty">Deal to start</span>
                    )}
                  </div>
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
                        flippedIndices={ssotFlippedPlayerIndices}
                      />
                    ) : actions.isLoading ? (
                      <SkeletonHand cardCount={2} />
                    ) : (
                      <span className="play-zone-empty">Your cards</span>
                    )}
                  </div>
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

              {/* XP Gain Popup */}
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
                ) : isWaitingDealer ? (
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

            {/* Desktop History */}
            <div className="hidden md:block">{wallet.isConnected && <GameHistory />}</div>
          </div>

          {/* Session Key Hint */}
          {!wallet.hasSessionKey && wallet.isConnected && !showingResult && (
            <div className="text-center text-sm text-purple-400 bg-purple-900/20 rounded-lg py-3 border border-purple-500/20">
              💡 Enable <strong>Fast Mode</strong> above for instant, popup-free gameplay!
            </div>
          )}

          {/* Mobile History */}
          <div className="md:hidden">{wallet.isConnected && <MobileHistory />}</div>
        </div>
      </main>

      {/* Full-screen result overlay - shows after dealer animation */}
      {showResultOverlay && lastGameResult && displayResult && (
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
            // Double-click guard: only allow from showing_result phase
            const currentPhase = useGameStore.getState().gamePhase;
            if (currentPhase !== 'showing_result') {
              logger.log('[GameBoardCasino] Ignoring play-again - phase is:', currentPhase);
              return;
            }
            clearLastResult();
            resetAnimationState();
            clearGameCards();
            setGamePhase('waiting_vrf');
            setBetAmount(newBet);
            actions.placeBet(newBet, token);
          }}
          onChangeBet={handleNewGame}
        />
      )}
    </div>
  );
}
