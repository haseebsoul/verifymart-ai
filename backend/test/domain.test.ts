import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { seedDatabase } from '../src/seed.js';
import { calculateDuty } from '../src/services/duty.js';
import { findVerification } from '../src/services/verification.js';
import { createCheckout } from '../src/services/checkout.js';

process.env.NODE_ENV = 'test';

describe('VerifyMart domain services', () => {
  beforeEach(async () => { await seedDatabase(); });
  it('calculates deterministic landed costs with a disclosed tariff source', () => {
    const item = db.prepare("SELECT id FROM products WHERE sku='AUD-001'").get() as {id:string};
    const first = calculateDuty('PK',[{productId:item.id,quantity:1}]);
    const second = calculateDuty('PK',[{productId:item.id,quantity:1}]);
    expect(first.source).toBe('seed-tariff-v1');
    expect(first.total).toBe(second.total);
    expect(first.lines[0]?.carrierFee).toBe(28);
  });
  it('resolves SKU, batch hash and timeline with four events', () => {
    const row = db.prepare("SELECT sku,batch_hash FROM products WHERE sku='AUD-001'").get() as {sku:string;batch_hash:string};
    expect(findVerification(row.sku)?.timeline).toHaveLength(4);
    expect(findVerification(row.batch_hash)?.authenticityScore).toBeGreaterThanOrEqual(0);
  });
  it('makes checkout idempotent and does not deduct stock twice', () => {
    const shopper = db.prepare("SELECT id FROM users WHERE role='user' LIMIT 1").get() as {id:string};
    const product = db.prepare("SELECT id,stock FROM products WHERE sku='AUD-001'").get() as {id:string;stock:number};
    const body = {destinationCountry:'PK',items:[{productId:product.id,quantity:1}]};
    const first = createCheckout(shopper.id,'test-key-123456',body);
    const replay = createCheckout(shopper.id,'test-key-123456',body);
    const current = db.prepare('SELECT stock FROM products WHERE id=?').get(product.id) as {stock:number};
    expect(first.orderId).toBe(replay.orderId);
    expect(current.stock).toBe(product.stock-1);
  });
});
