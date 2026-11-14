import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Long } from 'mongodb';
import { z } from 'zod';
import { getAtlasClient, getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent, readAuditEvents } from './repositories/audit.js';
import type {
  HubDocument,
  InventoryAdjustmentDocument,
  ProductDocument,
  SettingDocument,
  ThreatDocument,
  TrustLedgerDocument
} from './repositories/contracts.js';

export const atlasOpsRouter = Router();

const operators = ['operator','admin'] as const;
const inventoryRoles = ['merchant','inventory_manager','operator','admin'] as const;

atlasOpsRouter.get(
  '/metrics',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (_req, res) => {
    const database = getAtlasDb();
    const [heldOrReleased, verified, totalProducts, openThreats, hubs, allocation] = await Promise.all([
      database.collection('orders').aggregate([
        { $match: { state: { $in: ['held','released','on_hold'] } } },
        { $group: { _id: null, count: { $sum: 1 }, totalCents: { $sum: '$quote.totalCents' } } }
      ]).toArray(),
      database.collection<ProductDocument>('products').countDocuments({ status: 'verified', listingStatus: 'published' }),
      database.collection<ProductDocument>('products').countDocuments({ listingStatus: 'published' }),
      database.collection<ThreatDocument>('threats').countDocuments({ resolvedAt: null }),
      database.collection<HubDocument>('hubs').find({}).sort({ name: 1 }).toArray(),
      database.collection<ProductDocument>('products').aggregate([
        { $match: { listingStatus: 'published' } },
        { $group: { _id: '$originHubId', products: { $sum: 1 }, units: { $sum: '$stock' } } }
      ]).toArray()
    ]);
    const summary = heldOrReleased[0] as { count?: number; totalCents?: number } | undefined;
    const byHub = new Map(allocation.map((row) => [String(row._id), row]));
    res.json({
      escrowGmv: Number(summary?.totalCents ?? 0) / 100,
      verifiedOrders: Number(summary?.count ?? 0),
      verifiedProducts: verified,
      totalProducts,
      // No measured availability history exists yet; do not fabricate an SLO percentage.
      slaHealth: null,
      openThreats,
      hubs,
      hubAllocation: hubs.map(hub => ({
        hubId: hub.code, name: hub.name,
        products: Number((byHub.get(hub.code) as { products?: number } | undefined)?.products ?? 0),
        units: Number((byHub.get(hub.code) as { units?: number } | undefined)?.units ?? 0)
      })),
      velocity: [],
      telemetry: { simulated: true, source: 'No live telemetry source is connected.' }
    });
  })
);

atlasOpsRouter.get(
  '/warehouses',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['inventory_manager',...operators]),
  asyncHandler(async (_req, res) => {
    const database = getAtlasDb();
    const [hubs, stock] = await Promise.all([
      database.collection<HubDocument>('hubs').find({}).sort({ name: 1 }).toArray(),
      database.collection<ProductDocument>('products').aggregate([
        { $match: { listingStatus: 'published' } },
        { $group: { _id: '$originHubId', products: { $sum: 1 }, units: { $sum: '$stock' } } }
      ]).toArray()
    ]);
    res.json({ hubs, stock: stock.map(row => ({ hubId: row._id, products: row.products, units: row.units })) });
  })
);

atlasOpsRouter.get(
  '/threats',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['merchant','inventory_manager',...operators]),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { resolvedAt: null };
    if (req.atlasPrincipal!.role === 'merchant') {
      const merchantId = req.merchantId!;
      const products = await getAtlasDb().collection<ProductDocument>('products')
        .find({ merchantId, managedBy: 'merchant' }, { projection: { _id: 1 } }).toArray();
      filter.productId = { $in: products.map(product => product._id) };
    }
    const threats = await getAtlasDb().collection<ThreatDocument>('threats').find(filter)
      .sort({ severity: 1, detectedAt: -1 }).limit(300).toArray();
    const products = await getAtlasDb().collection<ProductDocument>('products')
      .find({ _id: { $in: threats.map(threat => threat.productId) } }).toArray();
    const byId = new Map(products.map(product => [product._id, product]));
    res.json({
      threats: threats.map(threat => {
        const product = byId.get(threat.productId);
        return {
          id: threat._id, type: threat.type, severity: threat.severity,
          detectedAt: threat.detectedAt, resolvedAt: threat.resolvedAt,
          productId: threat.productId, sku: product?.sku ?? 'unknown',
          name: product?.name ?? 'Unknown product', stock: product?.stock ?? 0,
          reorderThreshold: product?.reorderThreshold ?? 0,
          authenticityScore: product?.authenticityScore ?? 0
        };
      })
    });
  })
);

atlasOpsRouter.post(
  '/inventory/restock/:id',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...inventoryRoles], { productIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const input = z.object({ quantity: z.number().int().min(1).max(10000).default(10), reason: z.string().trim().min(4).max(500).default('Restock requested by authorized inventory staff') }).parse(req.body ?? {});
    const productId = req.params.id;
    if (!productId) { res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } }); return; }

    const database = getAtlasDb();
    const products = database.collection<ProductDocument>('products');
    const session = getAtlasClient().startSession();
    const resultBox: { updated: ProductDocument | null } = { updated: null };
    try {
      await session.withTransaction(async () => {
        const current = await products.findOne({ _id: productId }, { session });
        if (!current) throw Object.assign(new Error('Product was not found.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
        const now = new Date();
        const result = await products.findOneAndUpdate(
          { _id: productId, stock: current.stock },
          { $inc: { stock: input.quantity }, $set: { updatedAt: now, status: current.status === 'low_stock' ? 'verified' : current.status } },
          { session, returnDocument: 'after' }
        );
        resultBox.updated = result ?? null;
        if (!resultBox.updated) throw Object.assign(new Error('Inventory changed concurrently.'), { status: 409, code: 'INVENTORY_CONFLICT' });
        await database.collection<InventoryAdjustmentDocument>('inventoryAdjustments').insertOne({
          _id: 'iad_' + randomUUID().replaceAll('-', '').slice(0, 18),
          productId, actorId: req.atlasPrincipal!.id, actorRole: req.atlasPrincipal!.role,
          delta: input.quantity, reason: input.reason, at: now
        }, { session });
      });
    } finally {
      await session.endSession();
    }
    const updated = resultBox.updated;
    if (!updated) throw new Error('Inventory transaction returned without an updated product.');
    await appendAuditEvent({
      actorId: req.atlasPrincipal!.id, action: 'INVENTORY_RESTOCKED', targetType: 'product',
      targetId: productId, details: { quantity: input.quantity, reason: input.reason, simulated: false }
    });
    res.json({ productId, sku: updated.sku, added: input.quantity, stock: updated.stock });
  })
);

atlasOpsRouter.patch(
  '/inventory/:id',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...inventoryRoles], { productIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const input = z.object({
      stock: z.number().int().min(0).max(100000),
      priceUsd: z.number().finite().min(0.01).max(1000000).optional(),
      reason: z.string().trim().min(4).max(500)
    }).strict().parse(req.body);
    if (input.priceUsd !== undefined && req.atlasPrincipal!.role !== 'admin') {
      res.status(403).json({ error: { code: 'PRICE_CHANGE_FORBIDDEN', message: 'Only administrators may change product prices.', requestId: req.requestId } });
      return;
    }
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } }); return; }
    const database = getAtlasDb();
    const products = database.collection<ProductDocument>('products');
    const session = getAtlasClient().startSession();
    const resultBox: { changed: ProductDocument | null } = { changed: null };
    let delta = 0;
    try {
      await session.withTransaction(async () => {
        const current = await products.findOne({ _id: id }, { session });
        if (!current) throw Object.assign(new Error('Product was not found.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
        delta = input.stock - current.stock;
        const now = new Date();
        const filter: Record<string, unknown> = { _id: id, stock: current.stock };
        if (req.atlasPrincipal!.role === 'merchant') {
          filter.merchantId = req.merchantId!;
          filter.managedBy = 'merchant';
        }
        const setFields: Record<string, unknown> = {
          stock: input.stock,
          updatedAt: now,
          status: input.stock <= current.reorderThreshold ? 'low_stock' : current.status === 'low_stock' ? 'verified' : current.status
        };
        if (input.priceUsd !== undefined) setFields.priceCents = Long.fromNumber(Math.round(input.priceUsd * 100));
        const result = await products.findOneAndUpdate(
          filter,
          { $set: setFields },
          { session, returnDocument: 'after' }
        );
        resultBox.changed = result ?? null;
        if (!resultBox.changed) throw Object.assign(new Error('Inventory changed concurrently.'), { status: 409, code: 'INVENTORY_CONFLICT' });
        if (delta !== 0) {
          await database.collection<InventoryAdjustmentDocument>('inventoryAdjustments').insertOne({
            _id: 'iad_' + randomUUID().replaceAll('-', '').slice(0, 18),
            productId: id, actorId: req.atlasPrincipal!.id, actorRole: req.atlasPrincipal!.role,
            delta, reason: input.reason, at: now
          }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    const changed = resultBox.changed;
    if (!changed) throw new Error('Inventory update completed without a product.');
    res.json({ productId: id, sku: changed.sku, stock: changed.stock });
  })
);

atlasOpsRouter.post(
  '/threats/:id/resolve',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(4).max(500) }).parse(req.body);
    const id = req.params.id;
    if (!id) { res.status(404).json({ error: { code: 'THREAT_NOT_FOUND', message: 'Threat was not found.', requestId: req.requestId } }); return; }
    const database = getAtlasDb();
    const threats = database.collection<ThreatDocument>('threats');
    const products = database.collection<ProductDocument>('products');
    const session = getAtlasClient().startSession();
    let threat: ThreatDocument | null = null;
    try {
      await session.withTransaction(async () => {
        threat = await threats.findOne({ _id: id, resolvedAt: null }, { session });
        if (!threat) throw Object.assign(new Error('Open threat was not found.'), { status: 404, code: 'THREAT_NOT_FOUND' });
        const product = await products.findOne({ _id: threat.productId }, { session });
        if (!product) throw Object.assign(new Error('Threat product was not found.'), { status: 409, code: 'THREAT_PRODUCT_MISSING' });
        const floor = await database.collection<SettingDocument>('settings').findOne({ key: 'authenticityConfidenceFloor' }, { session });
        const confidenceFloor = Number(floor?.value ?? 92);
        if (product.authenticityScore < confidenceFloor) {
          throw Object.assign(new Error('Product remains below the configured authenticity confidence floor; keep the threat open.'), { status: 409, code: 'AUTHENTICITY_BELOW_THRESHOLD' });
        }
        const now = new Date();
        const result = await threats.updateOne({ _id: id, resolvedAt: null }, { $set: { resolvedAt: now } }, { session });
        if (result.modifiedCount !== 1) throw Object.assign(new Error('Threat changed concurrently.'), { status: 409, code: 'THREAT_CONFLICT' });
        await products.updateOne(
          { _id: product._id },
          { $set: { status: product.stock <= product.reorderThreshold ? 'low_stock' : 'verified', updatedAt: now } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
    await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'THREAT_RESOLVED', targetType: 'threat', targetId: id, details: { reason } });
    res.json({ threatId: id, resolved: true });
  })
);

atlasOpsRouter.get(
  '/settings',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (_req, res) => {
    const rows = await getAtlasDb().collection<SettingDocument>('settings').find({}).toArray();
    res.json({ settings: Object.fromEntries(rows.map(row => [row.key, row.value])) });
  })
);

atlasOpsRouter.patch(
  '/settings',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['admin']),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      authenticityConfidenceFloor: z.number().int().min(50).max(100).optional(),
      customsSurgeBuffer: z.number().int().min(0).max(100).optional(),
      maxEscrowHoldHours: z.number().int().min(1).max(720).optional()
    }).strict().refine(value => Object.keys(value).length > 0);
    const input = schema.parse(req.body);
    const now = new Date();
    const collection = getAtlasDb().collection<SettingDocument>('settings');
    for (const [key,value] of Object.entries(input)) {
      if (value === undefined) continue;
      await collection.updateOne({ key }, { $set: { key, value, updatedAt: now }, $setOnInsert: { _id: key } }, { upsert: true });
    }
    await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'SETTINGS_UPDATED', targetType: 'settings', targetId: 'platform', details: input });
    res.json({ settings: input });
  })
);

atlasOpsRouter.get(
  '/activity',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (_req, res) => {
    const database = getAtlasDb();
    const [events, orders, threats] = await Promise.all([
      readAuditEvents({}, 100),
      database.collection('orders').find({}).sort({ createdAt: -1 }).limit(50).toArray(),
      database.collection<ThreatDocument>('threats').find({}).sort({ detectedAt: -1 }).limit(50).toArray()
    ]);
    const activity = [
      ...events.map(event => ({
        id: String(event._id), type: String(event.action), target: String(event.targetType),
        targetId: String(event.targetId), at: event.at, actorId: event.actorId,
        details: event.details, source: 'audit'
      })),
      ...orders.map(order => ({
        id: 'order:' + String(order._id), type: 'ORDER_' + String(order.state).toUpperCase(),
        target: 'order', targetId: String(order._id), at: order.createdAt,
        actorId: order.userId, details: { simulatedEscrow: true }, source: 'order'
      })),
      ...threats.map(threat => ({
        id: 'threat:' + threat._id, type: threat.type, target: 'threat',
        targetId: threat._id, at: threat.detectedAt, actorId: null,
        details: { severity: threat.severity, resolvedAt: threat.resolvedAt, simulated: true }, source: 'threat'
      }))
    ].sort((a,b) => b.at.getTime() - a.at.getTime()).slice(0,150);
    res.json({ activity });
  })
);

atlasOpsRouter.get(
  '/reports/audit.csv',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
    if (!Number.isSafeInteger(limit)) {
      res.status(400).json({ error: { code: 'INVALID_LIMIT', message: 'limit must be an integer from 1 to 500.', requestId: req.requestId } });
      return;
    }
    const from = typeof req.query.from === 'string' ? new Date(req.query.from + 'T00:00:00.000Z') : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to + 'T23:59:59.999Z') : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
      res.status(400).json({ error: { code: 'INVALID_DATE_RANGE', message: 'Provide a valid date range.', requestId: req.requestId } });
      return;
    }
    const filter: Record<string, unknown> = {};
    if (from || to) filter.at = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const events = await readAuditEvents(filter, limit);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"','""') + '"';
    };
    const csv = [
      ['at','actorId','action','targetType','targetId','details'].map(cell).join(','),
      ...events.map(event => [event.at.toISOString(),event.actorId,event.action,event.targetType,event.targetId,JSON.stringify(event.details)].map(cell).join(','))
    ].join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="verifymart-audit.csv"');
    res.send('\uFEFF' + csv);
  })
);

atlasOpsRouter.get(
  '/rewards',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['merchant','operator','admin']),
  asyncHandler(async (req, res) => {
    const merchantId = req.atlasPrincipal!.role === 'merchant' ? req.merchantId : undefined;
    const ledger = await getAtlasDb().collection<TrustLedgerDocument>('trustLedger')
      .find(merchantId ? { merchantId } : {}).sort({ at: -1 }).limit(500).toArray();
    const total = ledger.reduce((sum, entry) => sum + entry.delta, 0);
    res.json({
      merchantId: merchantId ?? null,
      score: Math.min(1000, 760 + total),
      outOf: 1000,
      perks: ['Priority verification review','Expanded inventory visibility'],
      ledger
    });
  })
);

atlasOpsRouter.post(
  '/simulation/trigger',
  authenticateAtlas,
  requireAtlasRoleAndOwnership([...operators]),
  asyncHandler(async (req, res) => {
    const { type } = z.object({ type: z.enum(['customs_hold','counterfeit_surge','auto_rebalance']) }).parse(req.body);
    const database = getAtlasDb();
    if (type === 'customs_hold') {
      await database.collection<HubDocument>('hubs').updateOne({ code: 'HUB-KHI' }, { $set: { status: 'warning' }, $inc: { queueDepth: 18 } });
    } else if (type === 'counterfeit_surge') {
      const product = await database.collection<ProductDocument>('products').findOne({ listingStatus: 'published', status: { $ne: 'audit_flag' } }, { sort: { authenticityScore: 1 } });
      if (product) {
        await database.collection<ProductDocument>('products').updateOne({ _id: product._id }, { $set: { status: 'audit_flag', updatedAt: new Date() } });
        await database.collection<ThreatDocument>('threats').insertOne({
          _id: 'thr_' + randomUUID().replaceAll('-', '').slice(0, 18),
          type: 'Simulated counterfeit signal', severity: 'CRITICAL', productId: product._id,
          detectedAt: new Date(), resolvedAt: null
        });
      }
    } else {
      await database.collection<HubDocument>('hubs').updateMany({}, { $set: { status: 'online' }, $inc: { queueDepth: -5 } });
    }
    await appendAuditEvent({
      actorId: req.atlasPrincipal!.id, action: 'SIMULATION_TRIGGERED',
      targetType: 'simulation', targetId: type, details: { type, simulated: true }
    });
    res.status(202).json({ accepted: true, type, simulated: true, message: 'Simulation applied to development/demo operational data only.' });
  })
);
