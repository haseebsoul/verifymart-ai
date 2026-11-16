import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getAtlasClient, getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent } from './repositories/audit.js';
import { createMongoCheckout } from './repositories/checkout.js';
import type { OrderDocument, OrderState, ProductDocument } from './repositories/contracts.js';
import { publishOrderEvent } from './realtime/order-events.js';
import { calculateAtlasDuty, calculatePakistanDemoEstimate } from './services/duty-atlas.js';

export const atlasCommerceRouter = Router();

const checkoutSchema = z.object({
  destinationCountry: z.enum(['US','UK','EU','AE','PK','SG']),
  items: z.array(z.object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(100)
  })).min(1).max(50),
  originCountry: z.string().trim().min(2).max(50).optional(),
  destinationCity: z.string().trim().min(2).max(80).optional(),
  taxProfile: z.enum(['filer','non-filer']).optional()
}).strict();

const checkoutLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.atlasPrincipal?.id ?? req.ip ?? req.socket.remoteAddress ?? 'unknown-ip'
});

atlasCommerceRouter.post(
  '/orders/checkout',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['shopper']),
  checkoutLimiter,
  asyncHandler(async (req, res) => {
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 128) {
      res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Provide an Idempotency-Key header between 8 and 128 characters.', requestId: req.requestId } });
      return;
    }
    const input = checkoutSchema.parse(req.body);
    const quote = input.destinationCountry === 'PK'
      ? await calculatePakistanDemoEstimate(input.items, {
          originCountry: input.originCountry ?? 'Not specified',
          destinationCity: input.destinationCity ?? 'Not specified',
          taxProfile: input.taxProfile ?? 'filer'
        })
      : await calculateAtlasDuty(input.destinationCountry, input.items);
    const demo = 'pakistanDemo' in quote ? quote.pakistanDemo : undefined;
    const demoCents = (key: string) => Math.round(demo?.components.find(component => component.key === key)?.amountUsd ?? 0 * 100);
    const cents = (value: number) => Math.round(value * 100);
    const result = await createMongoCheckout({
      idempotencyKey: key,
      userId: req.atlasPrincipal!.id,
      destination: input.destinationCountry,
      items: input.items,
      quote: {
        subtotalCents: Math.round(quote.subtotal * 100),
        dutyCents: Math.round(quote.duty * 100),
        vatCents: Math.round(quote.vat * 100),
        carrierFeeCents: cents(quote.carrierFee),
        ...(demo ? {
          additionalCustomsDutyCents: cents(demo.components.find(c => c.key === 'additionalCustomsDuty')?.amountUsd ?? 0),
          regulatoryDutyCents: cents(demo.components.find(c => c.key === 'regulatoryDuty')?.amountUsd ?? 0),
          federalExciseDutyCents: cents(demo.components.find(c => c.key === 'federalExciseDuty')?.amountUsd ?? 0),
          withholdingTaxCents: cents(demo.components.find(c => c.key === 'withholdingTax')?.amountUsd ?? 0),
          platformFeeCents: cents(demo.components.find(c => c.key === 'platformFee')?.amountUsd ?? 0),
          exchangeRatePkrPerUsd: demo.exchangeRatePkrPerUsd,
          totalPkr: demo.totalPkr
        } : {}),
        totalCents: cents(quote.total)
      }
    });
    if (!result.idempotencyReplayed) {
      publishOrderEvent({
        type: 'ORDER_ESCROW_CREATED', orderId: result.order._id,
        ownerUserId: result.order.userId, state: result.order.state,
        createdAt: result.order.createdAt.toISOString(), simulated: true
      });
    }
    const response = {
      orderId: result.order._id,
      escrowReceiptId: result.order.escrow.receiptId,
      state: result.order.state,
      total: result.order.quote.totalCents.toNumber() / 100,
      idempotencyReplayed: result.idempotencyReplayed,
      simulated: true,
      notice: 'Escrow is a simulated state only. No payment or funds transfer occurred.'
    };
    res.status(result.idempotencyReplayed ? 200 : 201).json(response);
  })
);

atlasCommerceRouter.get(
  '/orders',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['shopper','merchant','operator','admin']),
  asyncHandler(async (req, res) => {
    const principal = req.atlasPrincipal!;
    const database = getAtlasDb();
    let filter: Record<string, unknown> = {};
    let merchantProductIds: string[] | undefined;

    if (principal.role === 'shopper') {
      filter = { userId: principal.id };
    } else if (principal.role === 'merchant') {
      const merchantId = req.merchantId!;
      const products = await database.collection<ProductDocument>('products')
        .find({ merchantId, managedBy: 'merchant' }, { projection: { _id: 1 } }).toArray();
      merchantProductIds = products.map(product => product._id);
      filter = { 'items.productId': { $in: merchantProductIds } };
    }

    const orders = await database.collection<OrderDocument>('orders')
      .find(filter).sort({ createdAt: -1 }).limit(200).toArray();

    res.json({
      orders: orders.map(order => {
        const visibleItems = merchantProductIds
          ? order.items.filter(item => merchantProductIds!.includes(item.productId))
          : order.items;
        return {
          id: order._id,
          receiptId: order.escrow.receiptId,
          shopperName: principal.role === 'shopper' ? 'You' : undefined,
          destination: order.destination,
          subtotal: order.quote.subtotalCents.toNumber() / 100,
          duty: order.quote.dutyCents.toNumber() / 100,
          vat: order.quote.vatCents.toNumber() / 100,
          carrierFee: order.quote.carrierFeeCents.toNumber() / 100,
          additionalCustomsDuty: order.quote.additionalCustomsDutyCents?.toNumber() / 100 ?? 0,
          regulatoryDuty: order.quote.regulatoryDutyCents?.toNumber() / 100 ?? 0,
          federalExciseDuty: order.quote.federalExciseDutyCents?.toNumber() / 100 ?? 0,
          withholdingTax: order.quote.withholdingTaxCents?.toNumber() / 100 ?? 0,
          platformFee: order.quote.platformFeeCents?.toNumber() / 100 ?? 0,
          exchangeRatePkrPerUsd: order.quote.exchangeRatePkrPerUsd ?? null,
          totalPkr: order.quote.totalPkr ?? null,
          total: order.quote.totalCents.toNumber() / 100,
          state: order.state,
          holdReason: order.escrow.holdReason,
          createdAt: order.createdAt,
          items: visibleItems.map(item => ({
            productId: item.productId, sku: item.sku, name: item.name, quantity: item.quantity
          }))
        };
      })
    });
  })
);

export function isEscrowTransitionAllowed(from: OrderState, to: OrderState): boolean {
  const allowed: Record<OrderState, OrderState[]> = {
    held: ['released', 'on_hold', 'refunded'],
    on_hold: ['held', 'refunded'],
    released: [],
    refunded: []
  };
  return allowed[from].includes(to);
}

async function transitionEscrow(orderId: string, actorId: string, nextState: OrderState, reason?: string): Promise<OrderDocument | null> {
  const database = getAtlasDb();
  const orders = database.collection<OrderDocument>('orders');
  const session = getAtlasClient().startSession();
  const resultBox: { changed: OrderDocument | null } = { changed: null };
  let previousState: OrderState | undefined;
  try {
    await session.withTransaction(async () => {
      const current = await orders.findOne({ _id: orderId }, { session });
      if (!current) return;
      previousState = current.state;
      if (!isEscrowTransitionAllowed(current.state, nextState)) {
        throw Object.assign(new Error('Escrow cannot transition from ' + current.state + ' to ' + nextState + '.'), {
          status: 409, code: 'INVALID_ESCROW_STATE'
        });
      }
      if ((nextState === 'on_hold' || nextState === 'held' || nextState === 'refunded') && !reason) {
        throw Object.assign(new Error('A reason is required for this escrow state transition.'), {
          status: 400, code: 'ESCROW_REASON_REQUIRED'
        });
      }
      const result = await orders.findOneAndUpdate(
        { _id: orderId, state: current.state },
        { $set: {
          state: nextState,
          'escrow.state': nextState,
          'escrow.holdReason': nextState === 'on_hold' ? reason! : null,
          updatedAt: new Date()
        } },
        { session, returnDocument: 'after' }
      );
      resultBox.changed = result ?? null;
      if (!resultBox.changed) throw Object.assign(new Error('Order state changed concurrently.'), { status: 409, code: 'ESCROW_STATE_CONFLICT' });
    });
  } finally {
    await session.endSession();
  }
  const changed = resultBox.changed;
  if (changed && previousState) {
    const action = nextState === 'released' ? 'ESCROW_RELEASED'
      : nextState === 'on_hold' ? 'ESCROW_HELD'
      : nextState === 'refunded' ? 'ESCROW_REFUNDED'
      : 'ESCROW_REINSTATED';
    await appendAuditEvent({
      actorId, action, targetType: 'order', targetId: orderId,
      details: { from: previousState, to: nextState, reason: reason ?? null, simulated: true }
    });
    publishOrderEvent({
      type: 'ORDER_ESCROW_UPDATED', orderId, ownerUserId: changed.userId,
      state: changed.state, createdAt: changed.updatedAt.toISOString(), simulated: true
    });
  }
  return changed;
}

atlasCommerceRouter.post('/orders/:id/release', authenticateAtlas,
  requireAtlasRoleAndOwnership(['operator','admin']),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    const order = await transitionEscrow(id, req.atlasPrincipal!.id, 'released');
    if (!order) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    res.json({ orderId: order._id, state: order.state, simulated: true, notice: 'No funds were transferred.' });
  })
);

atlasCommerceRouter.post('/orders/:id/hold', authenticateAtlas,
  requireAtlasRoleAndOwnership(['operator','admin']),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    const input = z.object({ reason: z.string().trim().min(4).max(500) }).strict().parse(req.body);
    const order = await transitionEscrow(id, req.atlasPrincipal!.id, 'on_hold', input.reason);
    if (!order) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    res.json({ orderId: order._id, state: order.state, reason: input.reason, simulated: true });
  })
);


atlasCommerceRouter.post('/orders/:id/restore', authenticateAtlas,
  requireAtlasRoleAndOwnership(['operator','admin']),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    const input = z.object({ reason: z.string().trim().min(4).max(500) }).strict().parse(req.body);
    const order = await transitionEscrow(id, req.atlasPrincipal!.id, 'held', input.reason);
    if (!order) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    res.json({ orderId: order._id, state: order.state, reason: input.reason, simulated: true });
  })
);

atlasCommerceRouter.post('/orders/:id/refund', authenticateAtlas,
  requireAtlasRoleAndOwnership(['admin']),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    const input = z.object({ reason: z.string().trim().min(4).max(500) }).strict().parse(req.body);
    const order = await transitionEscrow(id, req.atlasPrincipal!.id, 'refunded', input.reason);
    if (!order) { res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order was not found.', requestId: req.requestId } }); return; }
    res.json({ orderId: order._id, state: order.state, simulated: true, notice: 'No payment was returned because no payment was collected.' });
  })
);

