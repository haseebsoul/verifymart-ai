import { randomUUID, createHash } from 'node:crypto';
import { Router } from 'express';
import { Long } from 'mongodb';
import { z } from 'zod';
import { getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent } from './repositories/audit.js';
import type { HubDocument, InventoryAdjustmentDocument, MerchantDocument, ProductDocument, UserDocument } from './repositories/contracts.js';

export const atlasMerchantRouter = Router();

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  country: z.enum(['US','UK','EU','AE','PK','SG'])
});

const merchantListingSchema = z.object({
  sku: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/),
  batchReference: z.string().trim().min(4).max(120),
  name: z.string().trim().min(2).max(160),
  brand: z.string().trim().min(2).max(100),
  category: z.enum(['Audio and Studio','Precision Horology','Edge Computing','Optics and Gear']),
  hsCode: z.string().trim().min(4).max(16).regex(/^[0-9A-Za-z]+$/),
  priceCents: z.number().int().safe().positive(),
  stock: z.number().int().min(0).max(100000),
  reorderThreshold: z.number().int().min(0).max(100000),
  originHubCode: z.string().trim().min(2).max(20),
  slaHours: z.number().int().min(1).max(720),
  imageUrl: z.string().url().max(2048).optional()
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
    _id: 'mrc_' + randomUUID().replaceAll('-', '').slice(0, 18),
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
      const changed = await database.collection<UserDocument>('users').updateOne(
        { _id: principal.id, role: 'shopper' },
        { $set: { role: 'merchant' } },
        { session }
      );
      if (changed.modifiedCount !== 1) throw Object.assign(new Error('Account role changed during merchant application.'), { status: 409, code: 'ROLE_CONFLICT' });
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
  const merchantId = req.merchantId;
  if (!merchantId) {
    res.status(404).json({ error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant profile was not found.', requestId: req.requestId } });
    return;
  }
  const merchant = await getAtlasDb().collection<MerchantDocument>('merchants').findOne({
    _id: merchantId,
    userId: req.atlasPrincipal!.id
  });
  if (!merchant) {
    res.status(404).json({ error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant profile was not found.', requestId: req.requestId } });
    return;
  }
  res.json({ merchant });
}));

atlasMerchantRouter.get('/merchant/listings', authenticateAtlas, requireAtlasRoleAndOwnership(['merchant','admin']), asyncHandler(async (req, res) => {
  const filter = req.atlasPrincipal!.role === 'merchant' ? { merchantId: req.merchantId! } : {};
  const products = await getAtlasDb().collection<ProductDocument>('products')
    .find(filter).sort({ updatedAt: -1, name: 1 }).limit(200).toArray();
  res.json({ products });
}));

atlasMerchantRouter.post('/merchant/listings', authenticateAtlas, requireAtlasRoleAndOwnership(['merchant']), asyncHandler(async (req, res) => {
  const merchantId = req.merchantId;
  if (!merchantId) {
    res.status(403).json({ error: { code: 'MERCHANT_ACCESS_DENIED', message: 'An active merchant profile is required.', requestId: req.requestId } });
    return;
  }
  const input = merchantListingSchema.parse(req.body);
  const database = getAtlasDb();
  const hub = await database.collection<HubDocument>('hubs').findOne({ code: input.originHubCode });
  if (!hub) {
    res.status(422).json({ error: { code: 'HUB_NOT_FOUND', message: 'Choose an existing origin hub.', requestId: req.requestId } });
    return;
  }
  const merchant = await database.collection<MerchantDocument>('merchants').findOne({ _id: merchantId });
  if (!merchant || merchant.status === 'rejected') {
    res.status(403).json({ error: { code: 'MERCHANT_ACCESS_DENIED', message: 'Merchant profile is not eligible to create listings.', requestId: req.requestId } });
    return;
  }
  const now = new Date();
  const product: ProductDocument = {
    _id: 'prd_' + randomUUID().replaceAll('-', '').slice(0, 18),
    sku: input.sku,
    batchHash: createHash('sha256').update(merchantId + ':' + input.sku.toLowerCase() + ':' + input.batchReference).digest('hex'),
    hsCode: input.hsCode,
    name: input.name,
    brand: input.brand,
    category: input.category,
    priceCents: Long.fromNumber(input.priceCents),
    stock: input.stock,
    reorderThreshold: input.reorderThreshold,
    originHubId: hub.code,
    authenticityScore: 0,
    slaHours: input.slaHours,
    imageUrl: input.imageUrl ?? '',
    status: 'audit_flag',
    listingStatus: merchant.status === 'approved' ? 'published' : 'draft',
    merchantId,
    managedBy: 'merchant',
    provenanceEvents: [],
    createdAt: now,
    updatedAt: now
  };
  try {
    await database.collection<ProductDocument>('products').insertOne(product);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      res.status(409).json({ error: { code: 'PRODUCT_CONFLICT', message: 'SKU or batch reference already exists.', requestId: req.requestId } });
      return;
    }
    throw error;
  }
  await appendAuditEvent({
    actorId: req.atlasPrincipal!.id,
    action: 'MERCHANT_LISTING_CREATED',
    targetType: 'product',
    targetId: product._id,
    details: { sku: product.sku, listingStatus: product.listingStatus, batchHash: product.batchHash }
  });
  res.status(201).json({ product, provenanceNote: 'Application-generated verification hash only; no manufacturer attestation is implied.' });
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
    const productId = req.params.id;
    if (!productId) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
      return;
    }
    const product = await products.findOne({ _id: productId });
    if (!product) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
      return;
    }

    const delta = input.stock - product.stock;
    const filter = req.atlasPrincipal!.role === 'merchant'
      ? { _id: product._id, merchantId: req.merchantId!, managedBy: 'merchant' }
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
          await database.collection<InventoryAdjustmentDocument>('inventoryAdjustments').insertOne({
            _id: 'iad_' + randomUUID().replaceAll('-', '').slice(0, 18),
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
