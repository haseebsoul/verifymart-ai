import { describe, expect, it } from 'vitest';
import { isEscrowTransitionAllowed } from '../src/routes-atlas-commerce.js';

describe('SRS §26 escrow state machine', () => {
  it('allows an ordinary held order to be released by the authorized route', () => {
    expect(isEscrowTransitionAllowed('held', 'released')).toBe(true);
  });

  it('allows a held order to enter review with on_hold', () => {
    expect(isEscrowTransitionAllowed('held', 'on_hold')).toBe(true);
  });

  it('requires an on_hold order to return to held before release', () => {
    expect(isEscrowTransitionAllowed('on_hold', 'held')).toBe(true);
    expect(isEscrowTransitionAllowed('on_hold', 'released')).toBe(false);
  });

  it('does not permit terminal states to transition again', () => {
    expect(isEscrowTransitionAllowed('released', 'held')).toBe(false);
    expect(isEscrowTransitionAllowed('released', 'refunded')).toBe(false);
    expect(isEscrowTransitionAllowed('refunded', 'held')).toBe(false);
  });

  it('allows refund only from held, never directly from on_hold', () => {
    expect(isEscrowTransitionAllowed('held', 'refunded')).toBe(true);
    expect(isEscrowTransitionAllowed('on_hold', 'refunded')).toBe(false);
  });
});
