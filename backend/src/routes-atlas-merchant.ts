import { randomUUID, createHash } from 'node:crypto';
import { Router } from 'express';
import { Long, MongoServerError, type Filter } from 'mongodb';
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
  res.json({ products: products.map(product => ({
    id: product._id, _id: product._id, sku: product.sku, batchHash: product.batchHash,
    hsCode: product.hsCode, name: product.name, brand: product.brand, category: product.category,
    priceUsd: product.priceCents.toNumber() / 100, stock: product.stock,
    reorderThreshold: product.reorderThreshold, imageUrl: product.imageUrl,
    status: product.status, listingStatus: product.listingStatus
  })) });
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


const merchantListingUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  brand: z.string().trim().min(2).max(100).optional(),
  category: z.enum(['Audio and Studio','Precision Horology','Edge Computing','Optics and Gear']).optional(),
  hsCode: z.string().trim().min(4).max(16).regex(/^[0-9A-Za-z]+$/).optional(),
  priceCents: z.number().int().safe().positive().optional(),
  imageUrl: z.string().url().max(2048).nullable().optional()
}).strict().refine(value => Object.keys(value).length > 0, 'At least one editable listing field is required.');

atlasMerchantRouter.patch(
  '/merchant/listings/:id',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['merchant'], { productIdParam: 'id', allowPendingDraft: true, editableListingOnly: true }),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchantId!;
    const productId = req.params.id;
    if (!productId) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Listing was not found.', requestId: req.requestId } });
      return;
    }
    const input = merchantListingUpdateSchema.parse(req.body);
    const database = getAtlasDb();
    const merchant = await database.collection<MerchantDocument>('merchants').findOne({
      _id: merchantId, userId: req.atlasPrincipal!.id
    });
    if (!merchant || merchant.status === 'rejected') {
      res.status(403).json({ error: { code: 'MERCHANT_ACCESS_DENIED', message: 'A pending or approved merchant application is required.', requestId: req.requestId } });
      return;
    }
    const allowedStates: Array<'draft' | 'published'> = merchant.status === 'pending' ? ['draft'] : ['draft','published'];
    const changes: Partial<Pick<ProductDocument, 'name' | 'brand' | 'category' | 'hsCode' | 'priceCents' | 'imageUrl'>> & { updatedAt: Date } = {
      updatedAt: new Date()
    };
    if (input.name !== undefined) changes.name = input.name;
    if (input.brand !== undefined) changes.brand = input.brand;
    if (input.category !== undefined) changes.category = input.category;
    if (input.hsCode !== undefined) changes.hsCode = input.hsCode;
    if (input.priceCents !== undefined) changes.priceCents = Long.fromNumber(input.priceCents);
    if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl ?? '';
    const updated = await database.collection<ProductDocument>('products').findOneAndUpdate(
      { _id: productId, merchantId, managedBy: 'merchant', listingStatus: { $in: allowedStates } },
      { $set: changes },
      { returnDocument: 'after' }
    );
    if (!updated) {
      res.status(404).json({ error: { code: 'LISTING_NOT_EDITABLE', message: 'The listing was not found, is archived, or is not editable in the current merchant state.', requestId: req.requestId } });
      return;
    }
    await appendAuditEvent({
      actorId: req.atlasPrincipal!.id, action: 'MERCHANT_LISTING_UPDATED',
      targetType: 'product', targetId: productId, details: { changedFields: Object.keys(input) }
    });
    res.json({ product: updated });
  })
);

atlasMerchantRouter.post('/merchant/resubmit', authenticateAtlas, requireAtlasRoleAndOwnership(['merchant']), asyncHandler(async (req, res) => {
  const input = applicationSchema.parse(req.body);
  const merchantId = req.merchantId!;
  const now = new Date();
  const merchant = await getAtlasDb().collection<MerchantDocument>('merchants').findOneAndUpdate(
    { _id: merchantId, userId: req.atlasPrincipal!.id, status: 'rejected' },
    { $set: { businessName: input.businessName, country: input.country, status: 'pending', updatedAt: now }, $unset: { rejectionReason: '' } },
    { returnDocument: 'after' }
  );
  if (!merchant) {
    res.status(409).json({ error: { code: 'MERCHANT_RESUBMISSION_NOT_ALLOWED', message: 'Only a rejected merchant application can be resubmitted.', requestId: req.requestId } });
    return;
  }
  await appendAuditEvent({
    actorId: req.atlasPrincipal!.id, action: 'MERCHANT_APPLICATION_RESUBMITTED',
    targetType: 'merchant', targetId: merchantId,
    details: { businessName: merchant.businessName, country: merchant.country }
  });
  res.json({ merchant });
}));

atlasMerchantRouter.post(
  '/merchant/listings/:id/archive',
  authenticateAtlas,
  requireAtlasRoleAndOwnership(['merchant'], { productIdParam: 'id', allowPendingDraft: true, editableListingOnly: true }),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchantId!;
    const productId = req.params.id;
    if (!productId) {
      res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Listing was not found.', requestId: req.requestId } });
      return;
    }
    const merchant = await getAtlasDb().collection<MerchantDocument>('merchants').findOne({
      _id: merchantId, userId: req.atlasPrincipal!.id
    });
    if (!merchant || merchant.status === 'rejected') {
      res.status(403).json({ error: { code: 'MERCHANT_ACCESS_DENIED', message: 'An eligible merchant profile is required.', requestId: req.requestId } });
      return;
    }
    const allowedStates: Array<'draft' | 'published'> = merchant.status === 'pending' ? ['draft'] : ['draft','published'];
    const archived = await getAtlasDb().collection<ProductDocument>('products').updateOne(
      { _id: productId, merchantId, managedBy: 'merchant', listingStatus: { $in: allowedStates } },
      { $set: { listingStatus: 'archived', updatedAt: new Date() } }
    );
    if (archived.modifiedCount !== 1) {
      res.status(404).json({ error: { code: 'LISTING_NOT_ARCHIVABLE', message: 'The listing was not found or is already archived.', requestId: req.requestId } });
      return;
    }
    await appendAuditEvent({
      actorId: req.atlasPrincipal!.id, action: 'MERCHANT_LISTING_ARCHIVED',
      targetType: 'product', targetId: productId, details: { merchantId }
    });
    res.status(204).end();
  })
);

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
    const filter: Filter<ProductDocument> = req.atlasPrincipal!.role === 'merchant'
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
