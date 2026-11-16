import { describe, expect, it } from 'vitest';
import { normalizeItems } from '../src/repositories/checkout.js';
import { roundRateHalfUp } from '../src/services/duty-atlas.js';
import { canTransitionEscrow } from '../src/services/escrow-state.js';

describe('Atlas core domain calculations', () => {
  it('aggregates duplicate product lines before transactional stock deduction', () => {
    expect(normalizeItems([
      { productId: 'prd-b', quantity: 1 },
      { productId: 'prd-a', quantity: 2 },
      { productId: 'prd-a', quantity: 3 }
    ])).toEqual([
      { productId: 'prd-a', quantity: 5 },
      { productId: 'prd-b', quantity: 1 }
    ]);
  });

  it('uses half-up rounding to integer cents for basis-point duty rates', () => {
    expect(roundRateHalfUp(150, 500)).toBe(8);
    expect(roundRateHalfUp(149, 500)).toBe(7);
    expect(roundRateHalfUp(34900, 900)).toBe(3141);
    expect(roundRateHalfUp(40841, 1800)).toBe(7351);
  });

  it('uses the explicitly marked Pakistan demo basis-point placeholders with integer rounding', () => {
    expect(roundRateHalfUp(10_000, 200)).toBe(200);
    expect(roundRateHalfUp(10_000, 100)).toBe(100);
    expect(roundRateHalfUp(10_000, 50)).toBe(50);
    expect(roundRateHalfUp(10_000, 150)).toBe(150);
  });

  it('enforces the escrow state machine including on-hold reinstatement', () => {
    expect(canTransitionEscrow('held','on_hold')).toBe(true);
    expect(canTransitionEscrow('held','released')).toBe(true);
    expect(canTransitionEscrow('held','refunded')).toBe(true);
    expect(canTransitionEscrow('on_hold','held')).toBe(true);
    expect(canTransitionEscrow('on_hold','released')).toBe(false);
    expect(canTransitionEscrow('released','held')).toBe(false);
    expect(canTransitionEscrow('refunded','released')).toBe(false);
  });

  it('rejects unsafe or negative monetary inputs', () => {
    expect(() => roundRateHalfUp(-1, 500)).toThrow();
    expect(() => roundRateHalfUp(Number.MAX_SAFE_INTEGER, 50000)).toThrow();
  });
});
