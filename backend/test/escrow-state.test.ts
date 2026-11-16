import { describe, expect, it } from 'vitest';
import { canTransitionEscrow } from '../src/services/escrow-state.js';

describe('SRS §26 escrow state machine', () => {
  it('allows an ordinary held order to be released by the authorized route', () => {
    expect(canTransitionEscrow('held', 'released')).toBe(true);
  });

  it('allows a held order to enter review with on_hold', () => {
    expect(canTransitionEscrow('held', 'on_hold')).toBe(true);
  });

  it('requires an on_hold order to return to held before release', () => {
    expect(canTransitionEscrow('on_hold', 'held')).toBe(true);
    expect(canTransitionEscrow('on_hold', 'released')).toBe(false);
  });

  it('does not permit terminal states to transition again', () => {
    expect(canTransitionEscrow('released', 'held')).toBe(false);
    expect(canTransitionEscrow('released', 'refunded')).toBe(false);
    expect(canTransitionEscrow('refunded', 'held')).toBe(false);
  });

  it('allows refund only from held, never directly from on_hold', () => {
    expect(canTransitionEscrow('held', 'refunded')).toBe(true);
    expect(canTransitionEscrow('on_hold', 'refunded')).toBe(false);
  });
});
