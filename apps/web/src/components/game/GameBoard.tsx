import { useState, useEffect, useRef } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { useGameState } from '@/hooks/useGameState';
import { useTabFocus } from '@/hooks/useTabFocus';
import { Hand, HandValue } from './Hand';
import { ActionButtons } from './ActionButtons';
import { CardDeck } from './CardDeck';
import { GameHistory } from './GameHistory';
import { MobileHistory } from './MobileHistory';
import { VRFWaitingOverlay } from './VRFWaitingOverlay';
import { XPGainPopup, useXPPopup } from './XPGainPopup';
import { ShareVictory } from './ShareVictory';
import { ContractService } from '@/services';
import { StorageService } from '@/services/storage.service';
import { logger } from '@/lib/logger';
import { GameState, type GameResult } from '@vyrejack/shared';

// Snapshot of hand when game ends for display during result
interface HandSnapshot {
  playerCards: number[];
  dealerCards: number[];
  playerValue?: number;
  dealerValue?: number;
  bet: bigint;
}

export function GameBoard() {
  const [betAmount, setBetAmount] = useState('0.00001');
  const [lastHand, setLastHand] = useState<HandSnapshot | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // XP gain popup state
  const { popup: xpPopup, showXPGain, hidePopup: hideXPPopup } = useXPPopup();

  // Wallet connection
  const wallet = useWallet();

  // Game state (pass wallet to avoid duplicate hook instances)
  // Note: lastGameResult now includes final hand values from CardDealt WebSocket tracking
  const game = useGameState(wallet);

  // Tab focus detection (Scenario M: Multiple tabs)
  const isActiveTab = useTabFocus();

  // Get result from parsed tx event or contract state
  const currentResult = ((): GameResult => {
    if (game.lastGameResult?.result) return game.lastGameResult.result;
    if (!game.gameData) return null;
    switch (game.gameData.state) {
      case GameState.PlayerWin:
        return 'win';
      case GameState.DealerWin:
        return 'lose';
      case GameState.Push:
        return 'push';
      case GameState.PlayerBlackjack:
        return 'blackjack';
      default:
        return null;
    }
  })();

  // Track if we've saved this result to avoid duplicates
  const lastSavedResultRef = useRef<string | null>(null);

  // When game ends, store the final cards for display AND save to history
  useEffect(() => {
    if (game.lastGameResult) {
      // Create stable ID based on game data (not Date.now which changes)
      const resultId = `${game.lastGameResult.playerFinalValue}-${game.lastGameResult.dealerFinalValue}-${game.lastGameResult.result}-${game.lastGameResult.playerCards?.join(',')}`;

      // Get cards: prefer lastGameResult, but fall back to gameData if WebSocket race condition
      const playerCards =
        (game.lastGameResult.playerCards?.length >= 2
          ? game.lastGameResult.playerCards
          : game.gameData?.playerCards) || [];
      const dealerCards =
        (game.lastGameResult.dealerCards?.length >= 2
          ? game.lastGameResult.dealerCards
          : game.gameData?.dealerCards) || [];

      // Debug log removed - runs too frequently
      // logger.log('[GameBoard] Setting lastHand with:', { playerCards, dealerCards });

      setLastHand({
        playerCards: [...playerCards],
        dealerCards: [...dealerCards],
        playerValue: game.lastGameResult.playerFinalValue,
        dealerValue: game.lastGameResult.dealerFinalValue,
        bet: 0n,
      });

      // Save to history (only if not already saved)
      if (lastSavedResultRef.current !== resultId) {
        lastSavedResultRef.current = resultId;
        const result = game.lastGameResult;
        StorageService.addGameToHistory({
          playerCards: [...playerCards],
          dealerCards: [...dealerCards],
          playerValue: result.playerFinalValue ?? 0,
          dealerValue: result.dealerFinalValue ?? 0,
          bet: betAmount,
          result: result.result as 'win' | 'lose' | 'push' | 'blackjack' | 'surrender',
          payout: result.payout ? game.formatBet(result.payout) : '0',
        });
        // Notify history component
        window.dispatchEvent(new CustomEvent('vyrejack:gameEnd'));

        // Trigger XP gain popup based on result
        const xpAmounts: Record<string, number> = {
          blackjack: 50,
          win: 25,
          push: 5,
          lose: 10,
          surrender: 5,
        };
        const xpGained = xpAmounts[result.result || 'lose'] || 10;
        showXPGain(xpGained);

        // Dispatch event for PlayerStats to refresh
        window.dispatchEvent(new CustomEvent('vyrecasino:gameend'));
      }
    }
  }, [game.lastGameResult, game.gameData, betAmount, game.formatBet, showXPGain]);

  // Clear lastHand when starting new game (lastGameResult becomes null)
  useEffect(() => {
    if (!game.lastGameResult) {
      setLastHand(null);
      lastSavedResultRef.current = null;
    }
  }, [game.lastGameResult]);

  // Track cooldown - check when in idle state or after game ends
  useEffect(() => {
    if (!wallet.address) return;

    // Check cooldown initially
    const checkCooldown = async () => {
      try {
        const remaining = await ContractService.getCooldownRemaining(
          wallet.address as `0x${string}`
        );
        setCooldownRemaining(remaining);
      } catch (e) {
        logger.error('[Cooldown] Error:', e);
      }
    };

    // Initial check
    checkCooldown();

    // Poll every second while there's cooldown remaining OR we just finished a game
    const interval = setInterval(() => {
      checkCooldown();
    }, 1000);

    return () => clearInterval(interval);
  }, [wallet.address, game.lastGameResult]);

  // Use lastResult/lastHand for display if contract has reset
  const gameResult = currentResult;

  // Check if player can take actions
  // Disable actions in background tabs (Scenario M)
  const canPlay = isActiveTab && game.gameData?.state === GameState.PlayerTurn;
  // Can bet when game is idle (including after showing result)
  const canBet =
    isActiveTab &&
    (!game.gameData || game.gameData.state === GameState.Idle) &&
    cooldownRemaining === 0;
  const isIdle = canBet && !game.lastGameResult;

  // Check if waiting for VRF (stuck state detection)
  const isWaitingVRF =
    game.gameData?.state === GameState.WaitingForDeal ||
    game.gameData?.state === GameState.WaitingForHit;

  // Can double only on first action (2 cards)
  const canDouble = canPlay && game.gameData?.playerCards.length === 2 && !game.gameData.isDoubled;
  // Can surrender only on first action
  const canSurrender = canPlay && game.gameData?.playerCards.length === 2;

  // DEBUG: Log render decisions
  logger.log('[GameBoard] 🎮 RENDER STATE:', {
    'gameData.state': game.gameData?.state,
    stateLabel: game.gameData
      ? [
          'Idle',
          'WaitingVRF',
          'PlayerTurn',
          'DealerTurn',
          'PlayerWin',
          'DealerWin',
          'Push',
          'Blackjack',
        ][game.gameData.state]
      : 'null',
    isActiveTab: isActiveTab,
    canBet: canBet,
    canPlay: canPlay,
    isIdle: isIdle,
    isWaitingVRF: isWaitingVRF,
    gameResult: gameResult,
    cooldownRemaining: cooldownRemaining,
    lastGameResult: !!game.lastGameResult,
  });

  // Combined error
  const error = wallet.error || game.error;

  // Inline result style - DEGEN UX copy with neon colors
  const getResultStyle = (result: GameResult) => {
    switch (result) {
      case 'win':
      case 'blackjack':
        return {
          bg: 'bg-gradient-to-r from-emerald-400 via-green-400 to-cyan-400',
          text: 'text-black',
          emoji: result === 'blackjack' ? '💎🙌' : '🚀',
          message: result === 'blackjack' ? 'BLACKJACK! WAGMI!' : 'LFG! YOU WIN!',
        };
      case 'lose':
        return {
          bg: 'bg-gradient-to-r from-red-600 to-rose-600',
          text: 'text-white',
          emoji: '💀',
          message: 'NGMI - DEALER WINS',
        };
      case 'push':
        return {
          bg: 'bg-gradient-to-r from-yellow-400 to-amber-400',
          text: 'text-black',
          emoji: '🤝',
          message: 'PUSH - BET RETURNED',
        };
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen game-board-mobile bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <main className="max-w-6xl mx-auto p-2 sm:p-4 py-4 sm:py-8">
        {/* Background Tab Warning (Scenario M: Multiple tabs) */}
        {!isActiveTab && (
          <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-500 rounded-lg text-yellow-200 flex items-center gap-2 text-sm">
            <span>⚠️</span>
            <span>Tab in background - actions disabled. Click here to activate.</span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* Game Area - Always rendered */}
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          {/* Casino Table - Realistic felt with psychological elements */}
          <div
            className={`casino-table ${gameResult === 'blackjack' ? 'blackjack-glow' : ''} ${gameResult === 'lose' ? 'lose-shake' : ''} ${gameResult === 'lose' && game.playerValue?.value && game.playerValue.value > 21 ? 'bust' : ''}`}
          >
            {/* Win celebration overlay - DEGEN confetti effect */}
            {(gameResult === 'win' || gameResult === 'blackjack') && (
              <>
                <div className="win-flash" />
                <div className="win-celebration" />
              </>
            )}

            {/* Loss flash overlay - subtle red */}
            {gameResult === 'lose' && <div className="lose-flash" />}

            {/* Card Deck - LEFT side */}
            <CardDeck
              cardsDealt={
                (game.gameData?.playerCards?.length ?? 0) +
                (game.gameData?.dealerCards?.length ?? 0)
              }
            />

            {/* Play Area - responsive padding */}
            <div className="relative z-10 px-2 sm:px-8 md:px-28 py-4 sm:py-6 md:py-10">
              {/* Dealer Zone */}
              <div className="dealer-zone">
                <div className="zone-label">Dealer</div>
                <div className="zone-row">
                  {/* Spacer to balance the value on right */}
                  <div className="zone-spacer" />
                  <div className="play-zone">
                    {/* Prefer lastHand cards when game ended, otherwise use live gameData */}
                    {lastHand?.dealerCards?.length || game.gameData?.dealerCards?.length ? (
                      <Hand
                        cards={lastHand?.dealerCards || game.gameData?.dealerCards || []}
                        value={lastHand?.dealerValue ?? game.dealerValue ?? undefined}
                        isDealer
                        hideSecond={!gameResult}
                        result={gameResult === 'lose' ? 'win' : null}
                        hideValue
                      />
                    ) : (
                      <span className="play-zone-empty">Deal to start</span>
                    )}
                  </div>
                  {/* Value display */}
                  <HandValue
                    value={
                      lastHand?.dealerCards?.length || game.gameData?.dealerCards?.length
                        ? (lastHand?.dealerValue ?? game.dealerValue ?? undefined)
                        : undefined
                    }
                    cardCount={(lastHand?.dealerCards || game.gameData?.dealerCards || []).length}
                  />
                </div>
              </div>

              {/* Player Zone */}
              <div className="player-zone">
                <div className="zone-row">
                  {/* Spacer to balance the value on right */}
                  <div className="zone-spacer" />
                  <div className="play-zone">
                    {/* Prefer lastHand cards when game ended, otherwise use live gameData */}
                    {lastHand?.playerCards?.length || game.gameData?.playerCards?.length ? (
                      <Hand
                        cards={lastHand?.playerCards || game.gameData?.playerCards || []}
                        value={lastHand?.playerValue ?? game.playerValue?.value}
                        isSoft={game.playerValue?.isSoft}
                        result={gameResult}
                        hideValue
                      />
                    ) : (
                      <span className="play-zone-empty">Your cards</span>
                    )}
                  </div>
                  {/* Value display */}
                  <HandValue
                    value={
                      lastHand?.playerCards?.length || game.gameData?.playerCards?.length
                        ? (lastHand?.playerValue ?? game.playerValue?.value)
                        : undefined
                    }
                    isSoft={game.playerValue?.isSoft}
                    cardCount={(lastHand?.playerCards || game.gameData?.playerCards || []).length}
                  />
                </div>
                <div className="zone-label">Your Hand</div>
              </div>

              {/* Bet display - always visible to prevent layout shift */}
              <div
                className={`bet-display-side ${game.gameData && game.gameData.bet > 0n ? '' : 'bet-placeholder'}`}
              >
                <span className="bet-label">BET</span>
                <span className="bet-value">
                  {game.gameData && game.gameData.bet > 0n
                    ? `${game.formatBet(game.gameData.bet)} ETH${game.gameData.isDoubled ? ' ×2' : ''}`
                    : '-- ETH'}
                </span>
              </div>

              {/* INLINE RESULT BANNER - DEGEN UX with glass effect */}
              {gameResult && getResultStyle(gameResult) && (
                <div
                  className={`result-banner ${getResultStyle(gameResult)?.bg} ${getResultStyle(gameResult)?.text}`}
                >
                  {/* Top row: emoji + message */}
                  <div className="result-top">
                    <span className="result-emoji">{getResultStyle(gameResult)?.emoji}</span>
                    <span className="result-message">{getResultStyle(gameResult)?.message}</span>
                  </div>
                  {/* Score pill */}
                  {lastHand && (
                    <span className="result-values">
                      You: {lastHand.playerValue} • Dealer: {lastHand.dealerValue}
                    </span>
                  )}
                  {/* Share Victory button - only for wins */}
                  {(gameResult === 'win' || gameResult === 'blackjack') && (
                    <div className="mt-3">
                      <ShareVictory
                        outcome={gameResult}
                        winAmount={
                          game.lastGameResult?.payout
                            ? game.formatBet(game.lastGameResult.payout)
                            : undefined
                        }
                        walletAddress={wallet.address ?? undefined}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* XP Gain Popup - shows after game ends */}
              {xpPopup && (
                <XPGainPopup key={xpPopup.key} xpAmount={xpPopup.xp} onComplete={hideXPPopup} />
              )}
            </div>

            {/* Blackjack payout text */}
            <div className="payout-text">Blackjack Pays 3 to 2</div>
          </div>

          {/* Controls Area Layout: Controls + History side by side on desktop */}
          <div className="controls-area-layout">
            {/* Controls - betting or action buttons */}
            <div className="controls-panel">
              {!wallet.isConnected ? (
                /* Not Connected State - Inline */
                <div className="flex flex-col items-center justify-center h-full py-4">
                  <p className="text-gray-400 mb-4 text-center">
                    Connect your wallet to start playing
                  </p>
                  <button
                    onClick={wallet.connect}
                    disabled={wallet.isConnecting}
                    className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/20"
                  >
                    {wallet.isConnecting ? 'Using Wallet...' : 'Connect Wallet'}
                  </button>
                </div>
              ) : isIdle || gameResult ? (
                /* Betting UI */
                <div className="space-y-3 sm:space-y-4">
                  {/* Cooldown indicator */}
                  {cooldownRemaining > 0 && (
                    <div className="text-center py-3 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
                      <span className="text-yellow-400">⏳ Cooldown: </span>
                      <span className="font-mono font-bold text-yellow-300">
                        {cooldownRemaining}s
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount((e.target as HTMLInputElement).value)}
                      min={game.formatBet(game.betLimits.min)}
                      max={game.formatBet(game.betLimits.max)}
                      step="0.00001"
                      className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-mono focus:border-purple-500 focus:outline-none"
                      placeholder="Bet amount"
                    />
                    <span className="text-slate-400">ETH</span>
                  </div>

                  {/* Quick bet buttons - chip style */}
                  <div className="quick-bet-container">
                    {['0.00001', '0.00005', '0.0001', '0.0005'].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setBetAmount(amount)}
                        className={`quick-bet-btn ${betAmount === amount ? 'selected' : ''}`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>

                  {/* Deal Cards - DEGEN FOMO button */}
                  <button
                    onClick={() => {
                      // Clear previous game display before new bet
                      setLastHand(null);
                      game.clearLastResult();
                      game.placeBet(betAmount);
                    }}
                    disabled={game.isLoading || !canBet}
                    className="deal-btn"
                  >
                    <span className="deal-btn-content">
                      <span className="deal-btn-emoji">🚀</span>
                      {game.isLoading
                        ? 'SENDING...'
                        : cooldownRemaining > 0
                          ? `WAIT ${cooldownRemaining}s`
                          : `LET'S GO! ${betAmount} ETH`}
                    </span>
                  </button>

                  <p className="text-xs text-slate-500 text-center">
                    Min: {game.formatBet(game.betLimits.min)} ETH • Max:{' '}
                    {game.formatBet(game.betLimits.max)} ETH
                  </p>
                </div>
              ) : (
                /* Action Buttons with VRF Overlay if stuck */
                <div className="relative">
                  <ActionButtons
                    onHit={game.hit}
                    onStand={game.stand}
                    onDouble={game.double}
                    onSurrender={game.surrender}
                    canDouble={canDouble}
                    canSurrender={canSurrender}
                    isLoading={game.isLoading}
                  />
                  {/* VRF Waiting Overlay - shows when waiting for VRF */}
                  {isWaitingVRF && game.gameData?.timestamp && (
                    <VRFWaitingOverlay
                      gameTimestamp={game.gameData.timestamp}
                      onCancel={game.cancelTimedOutGame}
                      isLoading={game.isLoading}
                    />
                  )}
                </div>
              )}
            </div>

            {/* History Panel - desktop only (hidden on mobile via CSS) */}
            <div className="history-panel">
              <GameHistory />
            </div>

            {/* Mobile History - compact horizontal, visible on mobile only */}
            <div className="mobile-history-wrapper">
              <MobileHistory />
            </div>
          </div>

          {/* Session Key Hint */}
          {!wallet.hasSessionKey && wallet.isConnected && (
            <div className="text-center text-sm text-purple-400 bg-purple-900/20 rounded-lg py-3 border border-purple-500/20">
              💡 Enable <strong>Fast Mode</strong> above for instant, popup-free gameplay!
            </div>
          )}
        </div>
      </main>

      {/* Add CSS animation */}
      <style>
        {' '}
        {`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounce-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-out;
        }
      `}
      </style>
    </div>
  );
}
