import type { OrderState } from '../repositories/contracts.js';

/**
 * The escrow state machine from SRS §26. A held order can be held again,
 * released or refunded. A held-on-review order must return to held before
 * release; no direct on_hold -> released path exists.
 */
export function canTransitionEscrow(from: OrderState, to: OrderState): boolean {
  if (from === 'held') return to === 'on_hold' || to === 'released' || to === 'refunded';
  if (from === 'on_hold') return to === 'held';
  return false;
}
