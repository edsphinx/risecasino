import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import { GAME_CALLS, getSpendLimits, isCallPermitted, getFunctionSelector } from '../gamePermissions';
import { VYREJACKCORE_ADDRESS } from '../contract';

describe('gamePermissions', () => {
  it('permits claimTimeoutRefund on the game contract so a stuck game can be refunded via the session key', () => {
    const selector = getFunctionSelector('claimTimeoutRefund()');
    expect(isCallPermitted(VYREJACKCORE_ADDRESS, selector)).toBe(true);
    expect(
      GAME_CALLS.some(
        (c) =>
          c.to?.toLowerCase() === VYREJACKCORE_ADDRESS.toLowerCase() &&
          c.signature === selector,
      ),
    ).toBe(true);
  });

  it('daily USDC spend limit is well above a single max bet (was 100, too low for a day of play)', () => {
    const limits = getSpendLimits('USDC');
    expect(limits.length).toBe(1);
    expect(BigInt(limits[0].limit)).toBeGreaterThan(parseUnits('1000', 6));
  });

  it('daily CHIP spend limit is well above a single max bet', () => {
    const limits = getSpendLimits('CHIP');
    expect(BigInt(limits[0].limit)).toBeGreaterThan(parseUnits('1000', 18));
  });
});
