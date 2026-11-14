import { Router } from 'express';
import { z } from 'zod';
import { getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent } from './repositories/audit.js';
import type { MerchantDocument, ProductDocument, UserDocument } from './repositories/contracts.js';

export const atlasMerchantRouter = Router();

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  country: z.enum(['US','UK','EU','AE','PK','SG'])
});

atlasMerchantRouter.post('/merchant/apply', authenticateAtlas, asyncHandler(async (req, res) => {
  const principal = req.atlasPrincipal!;
  if (principal.role !== 'shopper') {
    res.status(409).json({ error: { code: 'MERCHANT_APPLICATION_NOT_ALLOWED', message: 'Only shopper accounts can apply for merchant access.', requestId: req.requestId } });
    return;
  }

  const input = applicationSchema.parse(req.body);
  const database = getAtlasDb();
  const existing = await database.collection<MerchantDocument>('merchants').findOne({ userId: principal.id });
  if (existing) {
    res.status(409).json({ error: { code: 'MERCHANT_APPLICATION_EXISTS', message: 'A merchant application already exists for this account.', requestId: req.requestId } });
    return;
  }

  const now = new Date();
  const merchant: MerchantDocument = {
    _id: 'mrc_' + crypto.randomUUID().replaceAll('-', '').slice(0, 18),
    userId: principal.id,
    businessName: input.businessName,
    country: input.country,
    status: 'pending',
    trustScore: 0,
    createdAt: now,
    updatedAt: now
  };

  const session = database.client.startSession();
  try {
    await session.withTransaction(async () => {
      await database.collection<MerchantDocument>('merchants').insertOne(merchant, { session });
      await database.collection<UserDocument>('users').updateOne(
        { _id: principal.id, role: 'shopper' },
        { $set: { role: 'merchant' } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await appendAuditEvent({
    actorId: principal.id,
    action: 'MERCHANT_APPLICATION_SUBMITTED',
    targetType: 'merchant',
    targetId: merchant._id,
    details: { businessName: merchant.businessName, country: merchant.country }
  });

  res.status(201).json({ merchant });
}));

atlasMerchantRouter.get('/merchant/me', authenticateAtlas, requireAtlasRoleAndOwnership(['merchant']), asyncHandler(async (req, res) => {
  const merchant = await getAtlasDb().collection<MerchantDocument>('merchants').findOne({
    _id: req.merchantId,
    userId: req.atlasPrincipal!.id
  });
  if (!merchant) {
    res.status(404).json({ error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant profile was not found.', requestId: req.requestId } });
    return;
  }
  res.json({ merchant });
}));

atlasMerchantRouter.get('/merchant/listings', authenticateAtlas, requireAtlasRoleAndOwnership(['merchant','admin']), asyncHandler(async (req, res) => {
  const filter = req.atlasPrincipal!.role === 'merchant' ? { merchantId: req.merchantId } : {};
  const products = await getAtlasDb().collection<ProductDocument>('products')
    .find(filter).sort({ updatedAt: -1, name: 1 }).limit(200).toArray();
  res.json({ products });
}));

atlasMerchantRouter.patch(
  '/merchant/listings/:id/stock',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['merchant','inventory_manager','operator','admin'], { productIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const schema = z.object({ stock: z.number().int().min(0).max(100000), reason: z.string().trim().min(4).max(500) });
    const input = schema.parse(req.body);
    const database = getAtlasDb();
    const products = database.collection<ProductDocument>('products');
    const product = await products.findOne({ _id: req.params.id });
    if (!product) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
      return;
    }

    const delta = input.stock - product.stock;
    const filter = req.atlasPrincipal!.role === 'merchant'
      ? { _id: product._id, merchantId: req.merchantId, managedBy: 'merchant' }
      : { _id: product._id };
    const session = database.client.startSession();
    try {
      await session.withTransaction(async () => {
        const update = await products.updateOne(
          { ...filter, stock: product.stock },
          { $set: { stock: input.stock, updatedAt: new Date() } },
          { session }
        );
        if (update.modifiedCount !== 1 && delta !== 0) {
          throw Object.assign(new Error('Inventory changed concurrently. Refresh and retry.'), { status: 409, code: 'INVENTORY_CONFLICT' });
        }
        if (delta !== 0) {
          await database.collection('inventoryAdjustments').insertOne({
            _id: 'iad_' + crypto.randomUUID().replaceAll('-', '').slice(0, 18),
            productId: product._id,
            actorId: req.atlasPrincipal!.id,
            actorRole: req.atlasPrincipal!.role,
            delta,
            reason: input.reason,
            at: new Date()
          }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    res.json({ productId: product._id, sku: product.sku, stock: input.stock });
  })
);
