import { createHash } from 'node:crypto';
import { checkoutSchema, type Destination } from '@verifymart/shared';
import { db, cryptoId, nowIso, audit } from '../db.js';
import { calculateDuty, quoteToCents } from './duty.js';

export function createCheckout(userId: string, idempotencyKey: string, input: unknown): Record<string, unknown> {
  const body = checkoutSchema.parse(input);
  const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const existing = db.prepare('SELECT user_id,request_hash,response_json FROM idempotency_keys WHERE key = ?').get(idempotencyKey) as {user_id:string;request_hash:string;response_json:string} | undefined;
  if (existing && Date.now() - Date.parse((db.prepare('SELECT created_at FROM idempotency_keys WHERE key=?').get(idempotencyKey) as {created_at:string}).created_at) <= 24*60*60*1000) {
    if (existing.user_id !== userId || existing.request_hash !== requestHash) throw Object.assign(new Error('This idempotency key was already used for a different request.'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    return { ...(JSON.parse(existing.response_json) as Record<string, unknown>), idempotencyReplayed: true };
  }
  if (existing) db.prepare('DELETE FROM idempotency_keys WHERE key=?').run(idempotencyKey);
  const quote = calculateDuty(body.destinationCountry as Destination, body.items);
  const amounts = quoteToCents(quote);
  const orderId = cryptoId('ord'); const receiptId = cryptoId('esc'); const at = nowIso();
  const transaction = db.transaction(() => {
    const getStock = db.prepare('SELECT stock,sku,price_cents FROM products WHERE id = ?');
    for (const item of body.items) {
      const product = getStock.get(item.productId) as {stock:number;sku:string;price_cents:number} | undefined;
      if (!product) throw Object.assign(new Error(`Product ${item.productId} was not found.`), { status: 404, code: 'PRODUCT_NOT_FOUND' });
      if (product.stock < item.quantity) throw Object.assign(new Error(`Only ${product.stock} units remain for ${product.sku}.`), { status: 409, code: 'STOCK_INSUFFICIENT' });
    }
    db.prepare('INSERT INTO orders (id,receipt_id,user_id,destination,subtotal_cents,duty_cents,vat_cents,carrier_fee_cents,total_cents,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(orderId, receiptId, userId, body.destinationCountry, amounts.subtotal, amounts.duty, amounts.vat, amounts.carrierFee, amounts.total, 'held', at, at);
    const updateStock = db.prepare('UPDATE products SET stock = stock - ?, status = CASE WHEN stock - ? <= reorder_threshold THEN ? ELSE status END WHERE id = ?');
    const addItem = db.prepare('INSERT INTO order_items (order_id,product_id,quantity,unit_price_cents) VALUES (?,?,?,?)');
    for (const item of body.items) {
      const product = getStock.get(item.productId) as {stock:number;sku:string;price_cents:number};
      updateStock.run(item.quantity, item.quantity, 'low_stock', item.productId);
      addItem.run(orderId, item.productId, item.quantity, product.price_cents);
    }
    const response = { orderId, escrowReceiptId: receiptId, state: 'held', ...quote, orderState: 'held', idempotencyReplayed: false };
    db.prepare('INSERT INTO idempotency_keys (key,user_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)')
      .run(idempotencyKey, userId, requestHash, JSON.stringify(response), at);
    audit(userId,'ORDER_CHECKOUT_CREATED','order',orderId,{receiptId,destination:body.destinationCountry,total:quote.total});
    return response;
  });
  return transaction();
}
