import { describe, expect, it } from 'vitest';
import { isEscrowTransitionAllowed } from '../src/routes-atlas-commerce.js';

describe('escrow lifecycle state machine', () => {
  it('allows held orders to be released, held or refunded', () => {
    expect(isEscrowTransitionAllowed('held','released')).toBe(true);
    expect(isEscrowTransitionAllowed('held','on_hold')).toBe(true);
    expect(isEscrowTransitionAllowed('held','refunded')).toBe(true);
  });
  it('requires an on-hold order to return to held before release', () => {
    expect(isEscrowTransitionAllowed('on_hold','held')).toBe(true);
    expect(isEscrowTransitionAllowed('on_hold','released')).toBe(false);
    expect(isEscrowTransitionAllowed('on_hold','refunded')).toBe(true);
  });
  it('treats released and refunded as terminal states', () => {
    for (const target of ['held','released','on_hold','refunded'] as const) {
      expect(isEscrowTransitionAllowed('released',target)).toBe(false);
      expect(isEscrowTransitionAllowed('refunded',target)).toBe(false);
    }
  });
});
