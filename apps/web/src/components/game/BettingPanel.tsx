/**
 * BettingPanel - Pure UI Component for bet placement
 *
 * 🧱 PURE COMPONENT: Receives all state via props, no internal state
 * ⚡ PERFORMANCE: No hooks, memoizable
 *
 * This component handles:
 * - Bet amount input
 * - Quick bet buttons
 * - Deal/Place bet button
 * - Balance display
 */


export interface BettingPanelProps {
  // State
  betAmount: string;
  balance: string;
  tokenSymbol: string;
  isApproved: boolean;
  isLoading: boolean;
  canBet: boolean;

  // Callbacks
  onBetAmountChange: (amount: string) => void;
  onPlaceBet: () => void;

  // Quick bet options
  quickBets?: string[];
}

export function BettingPanel({
  betAmount,
  balance,
  tokenSymbol,
  isApproved,
  isLoading,
  canBet,
  onBetAmountChange,
  onPlaceBet,
  quickBets = ['10', '50', '100', '500', '1000'],
}: BettingPanelProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Bet Input */}
      <div className="flex items-center gap-4">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => onBetAmountChange((e.target as HTMLInputElement).value)}
          min="1"
          step="1"
          className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-mono focus:border-purple-500 focus:outline-none"
          placeholder="Bet amount"
          disabled={isLoading}
        />
        <span className="text-slate-400">{tokenSymbol}</span>
      </div>

      {/* Quick Bet Buttons */}
      <div className="quick-bet-container">
        {quickBets.map((amount) => (
          <button
            key={amount}
            onClick={() => onBetAmountChange(amount)}
            disabled={isLoading}
            className={`quick-bet-btn ${betAmount === amount ? 'selected' : ''}`}
          >
            {amount}
          </button>
        ))}
      </div>

      {/* Deal Button */}
      <button onClick={onPlaceBet} disabled={!canBet || isLoading} className="deal-btn">
        <span className="deal-btn-content">
          <span className="deal-btn-emoji">🚀</span>
          {isLoading ? 'SENDING...' : `LET'S GO! ${betAmount} ${tokenSymbol}`}
        </span>
      </button>

      {/* Balance Display */}
      <p className="text-xs text-slate-500 text-center">
        Balance: {balance} {tokenSymbol}
        {!isApproved && <span className="text-yellow-400 ml-2">(Needs approval)</span>}
      </p>
    </div>
  );
}
