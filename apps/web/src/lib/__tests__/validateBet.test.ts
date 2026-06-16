import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import { validateBetAmount } from '../validateBet';
import type { BetLimits } from '@vyrejack/shared';

// USDC-style: 6 decimals. Limits 10–1000 USDC, balance 500 USDC.
const DECIMALS = 6;
const SYMBOL = 'USDC';
const limits: BetLimits = {
  min: parseUnits('10', DECIMALS),
  max: parseUnits('1000', DECIMALS),
};
const balance = parseUnits('500', DECIMALS); // 500 USDC

describe('validateBetAmount', () => {
  it('returns null for a valid bet within limits and balance', () => {
    expect(validateBetAmount('100', limits, balance, DECIMALS, SYMBOL)).toBeNull();
  });

  it('accepts a bet exactly at the min and max bounds', () => {
    expect(validateBetAmount('10', limits, balance, DECIMALS, SYMBOL)).toBeNull();
    // raise balance so the max case is not balance-limited
    const bigBalance = parseUnits('5000', DECIMALS);
    expect(validateBetAmount('1000', limits, bigBalance, DECIMALS, SYMBOL)).toBeNull();
  });

  it('rejects a bet below the minimum', () => {
    const err = validateBetAmount('5', limits, balance, DECIMALS, SYMBOL);
    expect(err).toMatch(/min bet/i);
    expect(err).toContain('10');
  });

  it('rejects a bet above the maximum', () => {
    const bigBalance = parseUnits('5000', DECIMALS);
    const err = validateBetAmount('2000', limits, bigBalance, DECIMALS, SYMBOL);
    expect(err).toMatch(/max bet/i);
    expect(err).toContain('1000');
  });

  it('rejects a bet that exceeds the wallet balance', () => {
    // 600 is within limits (10–1000) but above the 500 balance
    const err = validateBetAmount('600', limits, balance, DECIMALS, SYMBOL);
    expect(err).toMatch(/insufficient balance/i);
  });

  it('rejects an empty or non-numeric amount', () => {
    expect(validateBetAmount('', limits, balance, DECIMALS, SYMBOL)).toMatch(/enter a valid/i);
    expect(validateBetAmount('abc', limits, balance, DECIMALS, SYMBOL)).toMatch(/enter a valid/i);
  });

  it('rejects zero or negative amounts', () => {
    expect(validateBetAmount('0', limits, balance, DECIMALS, SYMBOL)).toMatch(/enter a valid/i);
    expect(validateBetAmount('-5', limits, balance, DECIMALS, SYMBOL)).toMatch(/enter a valid/i);
  });

  it('skips min/max checks when limits are not loaded yet, but still validates balance and format', () => {
    // limits null → no min/max enforcement, but format + balance still apply
    expect(validateBetAmount('100', null, balance, DECIMALS, SYMBOL)).toBeNull();
    expect(validateBetAmount('600', null, balance, DECIMALS, SYMBOL)).toMatch(/insufficient balance/i);
    expect(validateBetAmount('', null, balance, DECIMALS, SYMBOL)).toMatch(/enter a valid/i);
  });
});
