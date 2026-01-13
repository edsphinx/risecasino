/**
 * GameTable - Pure UI Component for game table display
 *
 * 🧱 PURE COMPONENT: Receives all state via props, no internal state
 * ⚡ PERFORMANCE: No hooks, memoizable
 *
 * This component handles:
 * - Dealer and player zones display
 * - Card areas (using Hand component)
 * - Bet display
 * - Visual table layout
 */

import { Hand, HandValue } from './Hand';
import { CardDeck } from './CardDeck';

export interface GameTableProps {
  // Dealer state
  dealerCards: readonly number[];
  dealerValue?: number;
  dealerIsSoft?: boolean;
  hideSecond?: boolean;

  // Player state
  playerCards: readonly number[];
  playerValue?: number;
  playerIsSoft?: boolean;

  // Game state
  betAmount?: string;
  tokenSymbol?: string;
  gameResult?: 'win' | 'lose' | 'push' | 'blackjack' | null;

  // Display options
  showPayoutText?: boolean;
}

export function GameTable({
  dealerCards,
  dealerValue,
  dealerIsSoft,
  hideSecond = false,
  playerCards,
  playerValue,
  playerIsSoft,
  betAmount,
  tokenSymbol = '',
  gameResult,
  showPayoutText = true,
}: GameTableProps) {
  const cardsDealt = dealerCards.length + playerCards.length;
  const hasBet = betAmount && parseFloat(betAmount) > 0;

  return (
    <div className="casino-table">
      {/* Card Deck */}
      <CardDeck cardsDealt={cardsDealt} />

      {/* Play Area */}
      <div className="relative z-10 px-2 sm:px-8 md:px-28 py-4 sm:py-6 md:py-10">
        {/* Dealer Zone */}
        <div className="dealer-zone">
          <div className="zone-label">Dealer</div>
          <div className="zone-row">
            <div className="zone-spacer" />
            <div className="play-zone">
              {dealerCards.length > 0 ? (
                <Hand
                  cards={dealerCards}
                  value={hideSecond ? undefined : dealerValue}
                  isSoft={dealerIsSoft}
                  isDealer={true}
                  hideSecond={hideSecond}
                  hideValue={true}
                />
              ) : (
                <span className="play-zone-empty">Waiting for game...</span>
              )}
            </div>
            <HandValue
              value={hideSecond ? undefined : dealerValue}
              isSoft={dealerIsSoft}
              cardCount={dealerCards.length}
            />
          </div>
        </div>

        {/* Player Zone */}
        <div className="player-zone">
          <div className="zone-row">
            <div className="zone-spacer" />
            <div className="play-zone">
              {playerCards.length > 0 ? (
                <Hand
                  cards={playerCards}
                  value={playerValue}
                  isSoft={playerIsSoft}
                  isDealer={false}
                  result={gameResult}
                  hideValue={true}
                />
              ) : (
                <span className="play-zone-empty">Place your bet</span>
              )}
            </div>
            <HandValue value={playerValue} isSoft={playerIsSoft} cardCount={playerCards.length} />
          </div>
          <div className="zone-label">Your Hand</div>
        </div>

        {/* Bet Display */}
        <div className={`bet-display-side ${hasBet ? '' : 'bet-placeholder'}`}>
          <span className="bet-label">BET</span>
          <span className="bet-value">
            {hasBet ? `${betAmount} ${tokenSymbol}` : `-- ${tokenSymbol}`}
          </span>
        </div>
      </div>

      {showPayoutText && <div className="payout-text">Blackjack Pays 3 to 2</div>}
    </div>
  );
}
