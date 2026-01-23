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

import { useState, useMemo, useCallback, useRef, useEffect } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { useVyreCasinoActions } from '@/hooks/useVyreCasinoActions';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useGameState } from '@/hooks/useGameState';
import { useTabFocus } from '@/hooks/useTabFocus';
import { useAnimationProcessor } from '@/hooks/useAnimationProcessor';
import { useGameStore } from '@/stores/gameStore';
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
// 🧪 TEST: Animation system test panel (DELETE AFTER TESTING)
import { AnimationSystemTest } from './AnimationSystemTest';

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

  // ⚡ DEAL PHASE: Controls sequential card dealing and flip animations
  // idle → waiting_vrf (shuffle) → dealing (cards arriving) → player_turn → dealer_turn → result
  type DealPhase = 'idle' | 'waiting_vrf' | 'dealing' | 'player_turn' | 'dealer_turn' | 'result';
  const [dealPhase, setDealPhase] = useState<DealPhase>('idle');

  // ⚡ DEALER TURN: Control when to show result overlay (after dealer animation completes)
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  // Derive context if not provided
  const context =
    tokenContext || (tokenSymbol === 'USDC' ? 'USDC' : tokenSymbol === 'CHIP' ? 'CHIP' : 'ETH');

  const wallet = useWallet();
  const isActiveTab = useTabFocus();

  // ⚡ Animation processor - runs queue processing (hook called for side effects)
  useAnimationProcessor();

  const { resetAnimationState, clearGameCards } = useGameStore();

  // 🎯 SSOT: Get raw state for card display
  // Using primitive/stable selectors to prevent infinite re-renders
  const gameCards = useGameStore((s) => s.gameCards);
  const revealedCount = useGameStore((s) => s.revealedCount);
  const isHiddenCardFlipped = useGameStore((s) => s.isHiddenCardFlipped);

  // ⚡ Token balance hook - cached reads with polling
  const {
    formattedBalance,
    isApproved,
    refresh: refreshBalance,
  } = useTokenBalance(token, wallet.address as `0x${string}` | null);

  // ⚡ Game state hook - WebSocket events + card accumulation + snapshots
  const {
    game,
    isPlayerTurn,
    hasActiveGame,
    showingResult,
    lastGameResult,
    clearLastResult,
    refetch: refetchGame,
    snapshotCards,
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
    resetAnimationState(); // ⚡ Clear animation queue for new game
    clearGameCards(); // 🎯 SSOT: Clear IMMEDIATELY to prevent hydration race
    setDealPhase('waiting_vrf'); // ⚡ Show shuffle animation while VRF pending
    // 🎯 SSOT: flipping now handled by ssotFlippedIndices
    actions.placeBet(betAmount, token);
  }, [actions, betAmount, token, clearLastResult, resetAnimationState, clearGameCards]);

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
    resetAnimationState(); // ⚡ Clear animation queue for new game
    clearGameCards(); // 🎯 SSOT: Clear game cards for new game
    refreshBalance();
    refetchGame();
  }, [clearLastResult, resetAnimationState, clearGameCards, refreshBalance, refetchGame]);

  // Determine which cards/values to display
  // 🎯 SSOT: Compute display cards from raw state (avoids infinite re-renders from .slice())
  const displayPlayerCards = useMemo(() => {
    // Result phase: use snapshot
    if (showingResult && lastGameResult) {
      return lastGameResult.playerCards;
    }
    // Active game: slice gameCards by revealedCount
    return gameCards.playerCards.slice(0, revealedCount.player);
  }, [showingResult, lastGameResult, gameCards.playerCards, revealedCount.player]);

  // 🎯 SSOT: Dealer cards with hidden card logic
  const displayDealerCards = useMemo(() => {
    // Result phase: use snapshot (all cards visible)
    if (showingResult && lastGameResult) {
      return lastGameResult.dealerCards;
    }
    // Active game: slice and apply hidden card logic
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

  // 🎯 SSOT: Derive flipped indices from SSOT state
  // All revealed cards should be face-up (flipped) except dealer's hidden card
  const ssotFlippedPlayerIndices = useMemo(() => {
    // All player cards are face-up
    return Array.from({ length: revealedCount.player }, (_, i) => i);
  }, [revealedCount.player]);

  const ssotFlippedDealerIndices = useMemo(() => {
    // Dealer cards: all flipped except index 1 (hidden card) unless revealed
    const indices: number[] = [];
    for (let i = 0; i < revealedCount.dealer; i++) {
      // Skip index 1 (hidden card) unless it's been flipped for reveal
      if (i !== 1 || isHiddenCardFlipped) {
        indices.push(i);
      }
    }
    return indices;
  }, [revealedCount.dealer, isHiddenCardFlipped]);

  // 🎯 SSOT: Calculate player value from displayPlayerCards (not legacy playerValue)
  const displayPlayerValue = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.playerValue;
    }
    // Calculate from SSOT displayPlayerCards
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
    // Adjust aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return value;
  }, [showingResult, lastGameResult, displayPlayerCards]);

  // ⚠️ SECURITY: Calculate dealer value only from VISIBLE cards (not -1 placeholder)
  const displayDealerValue = useMemo(() => {
    if (showingResult && lastGameResult) {
      return lastGameResult.dealerValue;
    }
    // Filter out -1 (hidden card placeholder) and calculate from visible only
    const visibleCards = displayDealerCards.filter((c) => c !== -1);
    if (visibleCards.length === 0) return undefined;

    // Calculate Blackjack hand value
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

  // ⚠️ SECURITY: Hide dealer's second card ALWAYS except when showing final result
  // Old logic `isPlayerTurn && !showingResult` was exposing during VRF wait
  const hideSecondCard = !showingResult;

  // ⚡ DEAL PHASE TRANSITIONS
  // Orchestrate: placeBet → waiting_vrf (shuffle) → dealing (cards arrive) → player_turn
  useEffect(() => {
    // 🔄 PHASE SYNC: After page reload/HMR, sync phase from game state
    // This ensures UI shows correct controls when reconnecting to active game
    if (dealPhase === 'idle' && hasActiveGame && displayPlayerCards.length >= 2) {
      if (isPlayerTurn) {
        setDealPhase('player_turn');
      } else if (!showingResult) {
        setDealPhase('dealer_turn');
      }
    }

    // waiting_vrf → dealing: When first card arrives (displayPlayerCards populated)
    if (dealPhase === 'waiting_vrf' && displayPlayerCards.length > 0) {
      setDealPhase('dealing');
    }

    // dealing → player_turn: When loading completes and cards are dealt
    if (dealPhase === 'dealing' && !actions.isLoading && displayPlayerCards.length >= 2) {
      setDealPhase('player_turn');
    }

    // When isPlayerTurn changes and we're in player_turn phase
    if (dealPhase === 'player_turn' && !isPlayerTurn && !showingResult) {
      // Player finished, transition to dealer turn
      setDealPhase('dealer_turn');
    }

    // ⚡ DEALER TURN ANIMATION: When result arrives, animate dealer cards first
    if (showingResult && dealPhase !== 'result' && !showResultOverlay) {
      setDealPhase('dealer_turn');

      // 🎯 SSOT: Dealer card reveal now handled by isHiddenCardFlipped in SSOT
      // Just wait for animation time then show result
      const dealerCardCount = lastGameResult?.dealerCards.length ?? 2;
      const animationTime = 300 + Math.max(0, dealerCardCount - 2) * 300 + 800;

      setTimeout(() => {
        setDealPhase('result');
        setShowResultOverlay(true);
      }, animationTime);
    }

    // Reset to idle when no active game
    if (!hasActiveGame && !showingResult && dealPhase !== 'idle') {
      setShowResultOverlay(false);
      setDealPhase('idle');
    }
  }, [
    dealPhase,
    actions.isLoading,
    isPlayerTurn,
    showingResult,
    hasActiveGame,
    showResultOverlay,
    lastGameResult,
    displayPlayerCards.length,
  ]);

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
                        flippedIndices={ssotFlippedDealerIndices}
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
                        flippedIndices={ssotFlippedPlayerIndices}
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
                ) : hasActiveGame || dealPhase === 'dealer_turn' || dealPhase === 'result' ? (
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

      {/* Full-screen result overlay - only show after dealer animation completes */}
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
            // 🎯 SSOT: Clear ALL state for new game (same as handlePlaceBet)
            clearLastResult();
            resetAnimationState();
            clearGameCards();
            setDealPhase('waiting_vrf');
            setBetAmount(newBet);
            actions.placeBet(newBet, token);
          }}
          onChangeBet={handleNewGame}
        />
      )}

      {/* 🧪 TEST: Animation System Test Panel - DELETE AFTER TESTING */}
      <AnimationSystemTest />
    </div>
  );
}
