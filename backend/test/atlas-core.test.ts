import { describe, expect, it } from 'vitest';
import { normalizeItems } from '../src/repositories/checkout.js';
import { roundRateHalfUp } from '../src/services/duty-atlas.js';

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

  it('rejects unsafe or negative monetary inputs', () => {
    expect(() => roundRateHalfUp(-1, 500)).toThrow();
    expect(() => roundRateHalfUp(Number.MAX_SAFE_INTEGER, 10000)).toThrow();
  });
});
