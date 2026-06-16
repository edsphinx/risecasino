/**
 * Pure client-side bet validation.
 *
 * Mirrors the on-chain guards in VyreJackCore (minBet/maxBet per token) plus a
 * wallet-balance check, so an out-of-range bet is caught BEFORE a transaction is
 * signed — no wasted gas on a guaranteed revert.
 *
 * Returns a human-readable error string, or `null` when the bet is valid.
 * `limits` may be `null` while the on-chain limits are still loading; in that
 * case only the format and balance checks apply (we never block the user on a
 * pending read).
 */

import { parseUnits, formatUnits } from 'viem';
import type { BetLimits } from '@vyrejack/shared';

export function validateBetAmount(
  betAmount: string,
  limits: BetLimits | null,
  balanceRaw: bigint,
  decimals: number,
  symbol: string
): string | null {
  let amount: bigint;
  try {
    amount = parseUnits(betAmount.trim(), decimals);
  } catch {
    return 'Enter a valid amount';
  }

  if (amount <= 0n) {
    return 'Enter a valid amount';
  }

  if (limits) {
    if (amount < limits.min) {
      return `Min bet: ${formatUnits(limits.min, decimals)} ${symbol}`;
    }
    if (amount > limits.max) {
      return `Max bet: ${formatUnits(limits.max, decimals)} ${symbol}`;
    }
  }

  if (amount > balanceRaw) {
    return 'Insufficient balance';
  }

  return null;
}
