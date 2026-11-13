import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { dutySchema, holdSchema } from '@verifymart/shared';
import { db, dollars, audit, nowIso } from './db.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { asyncHandler, parseBody } from './middleware/http.js';
import { calculateDuty } from './services/duty.js';
import { createCheckout } from './services/checkout.js';
import { publishEvent } from './telemetry.js';

export const commerceRouter = Router();
const checkoutLimiter = rateLimit({ windowMs:60_000, limit:20, keyGenerator:req=>req.user!.id, standardHeaders:'draft-7', legacyHeaders:false });
commerceRouter.post('/duty/calculate', asyncHandler(async (req, res) => {
  const input = parseBody(dutySchema, req.body); res.json(calculateDuty(input.destinationCountry, input.items));
}));
commerceRouter.post('/orders/checkout', authenticate, checkoutLimiter, asyncHandler(async (req, res) => {
  const key = req.header('idempotency-key');
  if (!key || key.length < 8 || key.length > 128) { res.status(400).json({ error:{code:'IDEMPOTENCY_KEY_REQUIRED',message:'Provide an Idempotency-Key header between 8 and 128 characters.',requestId:req.requestId} }); return; }
  const result = createCheckout(req.user!.id, key, req.body);
  const replayed = result.idempotencyReplayed === true;
  if (replayed) res.status(200).json(result); else res.status(201).json(result);
  if (!replayed) publishEvent('ORDER_ESCROW_CREATED', { orderId: result.orderId, total: result.total });
}));
commerceRouter.get('/orders', authenticate, (req, res) => {
  const all = req.user!.role === 'admin' || req.user!.role === 'operator';
  const rows = db.prepare(`SELECT o.*,COALESCE(u.name, 'Former user') AS shopper_name FROM orders o LEFT JOIN users u ON u.id=o.user_id ${all ? '' : 'WHERE o.user_id=?'} ORDER BY o.created_at DESC LIMIT 200`)
    .all(...(all ? [] : [req.user!.id])) as Array<Record<string,unknown>>;
  const items = db.prepare(`SELECT oi.order_id,oi.quantity,oi.unit_price_cents,p.sku,p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`);
  res.json({ orders: rows.map(row => ({ id:row.id,receiptId:row.receipt_id,shopperName:row.shopper_name,destination:row.destination,
    subtotal:dollars(row.subtotal_cents as number),duty:dollars(row.duty_cents as number),vat:dollars(row.vat_cents as number),
    carrierFee:dollars(row.carrier_fee_cents as number),total:dollars(row.total_cents as number),state:row.state,holdReason:row.hold_reason,
    createdAt:row.created_at,items:items.all(row.id as string) })) });
});
commerceRouter.post('/orders/:id/release', authenticate, requireRole('operator','admin'), (req, res) => {
  const order = db.prepare('SELECT id,state,total_cents FROM orders WHERE id=?').get(req.params.id) as {id:string;state:string;total_cents:number} | undefined;
  if (!order) { res.status(404).json({error:{code:'ORDER_NOT_FOUND',message:'Order was not found.',requestId:req.requestId}}); return; }
  if (order.state === 'released') { res.json({orderId:order.id,state:order.state}); return; }
  if (order.state !== 'held') { res.status(409).json({error:{code:'INVALID_ESCROW_STATE',message:`Escrow cannot be released from state ${order.state}.`,requestId:req.requestId}}); return; }
  db.prepare("UPDATE orders SET state='released',updated_at=? WHERE id=?").run(nowIso(), order.id);
  audit(req.user!.id,'ESCROW_RELEASED','order',order.id,{total:dollars(order.total_cents)});
  publishEvent('ESCROW_RELEASED',{orderId:order.id}); res.json({orderId:order.id,state:'released'});
});
commerceRouter.post('/orders/:id/hold', authenticate, requireRole('operator','admin'), (req, res) => {
  const {reason} = parseBody(holdSchema, req.body);
  const order = db.prepare('SELECT id,state FROM orders WHERE id=?').get(req.params.id) as {id:string;state:string} | undefined;
  if (!order) { res.status(404).json({error:{code:'ORDER_NOT_FOUND',message:'Order was not found.',requestId:req.requestId}}); return; }
  if (order.state !== 'held') { res.status(409).json({error:{code:'INVALID_ESCROW_STATE',message:'Only held escrow can be placed on hold.',requestId:req.requestId}}); return; }
  db.prepare("UPDATE orders SET state='on_hold',hold_reason=?,updated_at=? WHERE id=?").run(reason,nowIso(),order.id);
  audit(req.user!.id,'ESCROW_HELD','order',order.id,{reason}); publishEvent('ESCROW_HELD',{orderId:order.id});
  res.json({orderId:order.id,state:'on_hold',reason});
});
