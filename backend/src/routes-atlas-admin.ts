import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { MongoServerError, type Filter } from 'mongodb';
import { z } from 'zod';
import { getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent } from './repositories/audit.js';
import { MongoMerchantRepository } from './repositories/merchants.js';
import type { HubDocument, MerchantDocument, ProductDocument, TariffRuleDocument, UserDocument } from './repositories/contracts.js';

export const atlasAdminRouter = Router();
const adminOnly = [authenticateAtlas, requireAtlasRoleAndOwnership(['admin'])];


const hubInputSchema = z.object({
  code: z.string().trim().min(3).max(20).regex(/^HUB-[A-Z0-9-]+$/),
  name: z.string().trim().min(2).max(100),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  latencyMs: z.number().int().min(0).max(60000).default(0),
  status: z.enum(['online','warning','offline','retired']).default('online'),
  queueDepth: z.number().int().min(0).max(100000).default(0)
}).strict();

const hubUpdateSchema = hubInputSchema.omit({ code: true }).partial()
  .refine(value => Object.keys(value).length > 0, 'Provide at least one hub field to update.');

const tariffInputSchema = z.object({
  hsPrefix: z.string().trim().max(16).regex(/^[0-9A-Za-z]*$/),
  country: z.enum(['US','UK','EU','AE','PK','SG']),
  dutyRateBps: z.number().int().min(0).max(10000),
  vatRateBps: z.number().int().min(0).max(10000),
  vatIncludesCarrier: z.boolean()
}).strict();

const tariffUpdateSchema = z.object({
  dutyRateBps: z.number().int().min(0).max(10000).optional(),
  vatRateBps: z.number().int().min(0).max(10000).optional(),
  vatIncludesCarrier: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one tariff field to update.');

atlasAdminRouter.get('/admin/hubs', ...adminOnly, asyncHandler(async (_req, res) => {
  const hubs = await getAtlasDb().collection<HubDocument>('hubs').find({})
    .sort({ code: 1 }).limit(250).toArray();
  res.json({ hubs });
}));

atlasAdminRouter.post('/admin/hubs', ...adminOnly, asyncHandler(async (req, res) => {
  const input = hubInputSchema.parse(req.body);
  const hub: HubDocument = { _id: input.code, ...input };
  try {
    await getAtlasDb().collection<HubDocument>('hubs').insertOne(hub);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      res.status(409).json({ error: { code: 'HUB_CODE_EXISTS', message: 'A hub with this code already exists.', requestId: req.requestId } });
      return;
    }
    throw error;
  }
  await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'HUB_CREATED', targetType: 'hub', targetId: hub._id, details: { code: hub.code, name: hub.name } });
  res.status(201).json({ hub });
}));

atlasAdminRouter.patch('/admin/hubs/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(404).json({ error: { code: 'HUB_NOT_FOUND', message: 'Hub was not found.', requestId: req.requestId } }); return; }
  const input = hubUpdateSchema.parse(req.body);
  const hub = await getAtlasDb().collection<HubDocument>('hubs').findOneAndUpdate(
    { _id: id },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!hub) { res.status(404).json({ error: { code: 'HUB_NOT_FOUND', message: 'Hub was not found.', requestId: req.requestId } }); return; }
  await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'HUB_UPDATED', targetType: 'hub', targetId: id, details: { changedFields: Object.keys(input), status: hub.status } });
  res.json({ hub });
}));

atlasAdminRouter.get('/admin/tariff-rules', ...adminOnly, asyncHandler(async (_req, res) => {
  const rules = await getAtlasDb().collection<TariffRuleDocument>('tariffRules').find({})
    .sort({ country: 1, hsPrefix: 1 }).limit(1000).toArray();
  res.json({ rules });
}));

atlasAdminRouter.post('/admin/tariff-rules', ...adminOnly, asyncHandler(async (req, res) => {
  const input = tariffInputSchema.parse(req.body);
  const rule: TariffRuleDocument = {
    _id: 'tar_' + randomUUID().replaceAll('-', '').slice(0, 18),
    ...input,
    source: 'seed-tariff-v1'
  };
  try {
    await getAtlasDb().collection<TariffRuleDocument>('tariffRules').insertOne(rule);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      res.status(409).json({ error: { code: 'TARIFF_RULE_EXISTS', message: 'A rule already exists for this HS prefix and destination.', requestId: req.requestId } });
      return;
    }
    throw error;
  }
  await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'TARIFF_RULE_CREATED', targetType: 'tariffRule', targetId: rule._id, details: { hsPrefix: rule.hsPrefix, country: rule.country } });
  res.status(201).json({ rule });
}));

atlasAdminRouter.patch('/admin/tariff-rules/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(404).json({ error: { code: 'TARIFF_RULE_NOT_FOUND', message: 'Tariff rule was not found.', requestId: req.requestId } }); return; }
  const input = tariffUpdateSchema.parse(req.body);
  const rule = await getAtlasDb().collection<TariffRuleDocument>('tariffRules').findOneAndUpdate(
    { _id: id },
    { $set: input },
    { returnDocument: 'after' }
  );
  if (!rule) { res.status(404).json({ error: { code: 'TARIFF_RULE_NOT_FOUND', message: 'Tariff rule was not found.', requestId: req.requestId } }); return; }
  await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'TARIFF_RULE_UPDATED', targetType: 'tariffRule', targetId: id, details: { changedFields: Object.keys(input), country: rule.country, hsPrefix: rule.hsPrefix } });
  res.json({ rule });
}));

atlasAdminRouter.delete('/admin/tariff-rules/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(404).json({ error: { code: 'TARIFF_RULE_NOT_FOUND', message: 'Tariff rule was not found.', requestId: req.requestId } }); return; }
  const collection = getAtlasDb().collection<TariffRuleDocument>('tariffRules');
  const rule = await collection.findOne({ _id: id });
  if (!rule) { res.status(404).json({ error: { code: 'TARIFF_RULE_NOT_FOUND', message: 'Tariff rule was not found.', requestId: req.requestId } }); return; }
  if (rule.hsPrefix === '') {
    res.status(409).json({ error: { code: 'BASE_TARIFF_PROTECTED', message: 'The destination base tariff cannot be deleted; update it instead.', requestId: req.requestId } });
    return;
  }
  const result = await collection.deleteOne({ _id: id });
  if (result.deletedCount !== 1) { res.status(409).json({ error: { code: 'TARIFF_RULE_CONFLICT', message: 'Tariff rule changed concurrently.', requestId: req.requestId } }); return; }
  await appendAuditEvent({ actorId: req.atlasPrincipal!.id, action: 'TARIFF_RULE_DELETED', targetType: 'tariffRule', targetId: id, details: { hsPrefix: rule.hsPrefix, country: rule.country, note: 'Historical order quotes retain their stored snapshots.' } });
  res.status(204).end();
}));

atlasAdminRouter.get('/admin/users', ...adminOnly, asyncHandler(async (_req, res) => {
  const users = await getAtlasDb().collection<UserDocument>('users')
    .find({}, { projection: { passwordHash: 0, refreshSessions: 0 } })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();
  res.json({ users: users.map(user => ({ id: user._id, name: user.name, email: user.email, role: user.role, lastLogin: user.lastLogin, createdAt: user.createdAt, disabledAt: user.disabledAt ?? null })) });
}));


atlasAdminRouter.get('/admin/merchants', ...adminOnly, asyncHandler(async (req, res) => {
  const status = z.enum(['pending','approved','rejected']).optional().safeParse(req.query.status);
  if (!status.success) {
    res.status(400).json({ error: { code: 'INVALID_MERCHANT_STATUS', message: 'Merchant status filter is invalid.', requestId: req.requestId } });
    return;
  }
  const filter: Filter<MerchantDocument> = status.data ? { status: status.data } : {};
  const merchants = await getAtlasDb().collection<MerchantDocument>('merchants')
    .find(filter).sort({ createdAt: -1 }).limit(500).toArray();
  res.json({ merchants });
}));

atlasAdminRouter.get('/admin/products', ...adminOnly, asyncHandler(async (_req, res) => {
  const products = await getAtlasDb().collection<ProductDocument>('products')
    .find({ managedBy: 'merchant', merchantId: { $type: 'string' } })
    .sort({ updatedAt: -1 }).limit(1000).toArray();
  res.json({ products: products.map(product => ({
    id: product._id, sku: product.sku, name: product.name, brand: product.brand,
    listingStatus: product.listingStatus, merchantId: product.merchantId
  })) });
}));

atlasAdminRouter.patch('/admin/products/:id/listing', ...adminOnly, asyncHandler(async (req, res) => {
  const productId = req.params.id;
  if (!productId) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
    return;
  }
  const input = z.object({
    listingStatus: z.enum(['published','archived']),
    reason: z.string().trim().min(4).max(500)
  }).strict().parse(req.body);
  const database = getAtlasDb();
  const products = database.collection<ProductDocument>('products');
  const product = await products.findOne({ _id: productId, managedBy: 'merchant', merchantId: { $type: 'string' } });
  if (!product) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Merchant listing was not found.', requestId: req.requestId } });
    return;
  }
  if (input.listingStatus === 'published') {
    if (!product.merchantId) {
      res.status(409).json({ error: { code: 'MERCHANT_NOT_ELIGIBLE', message: 'A merchant-owned listing is required.', requestId: req.requestId } });
      return;
    }
    const merchant = await database.collection<MerchantDocument>('merchants').findOne({ _id: product.merchantId, status: 'approved' });
    const owner = merchant ? await database.collection<UserDocument>('users').findOne({
      _id: merchant.userId, role: 'merchant',
      $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
    }) : null;
    if (!merchant || !owner) {
      res.status(409).json({ error: { code: 'MERCHANT_NOT_ELIGIBLE', message: 'Only approved, active merchant accounts can publish listings.', requestId: req.requestId } });
      return;
    }
  }
  const changed = await products.updateOne(
    { _id: productId, listingStatus: product.listingStatus, merchantId: product.merchantId },
    { $set: { listingStatus: input.listingStatus, updatedAt: new Date() } }
  );
  if (changed.modifiedCount !== 1) {
    res.status(409).json({ error: { code: 'LISTING_CONFLICT', message: 'Listing changed concurrently. Refresh and retry.', requestId: req.requestId } });
    return;
  }
  await appendAuditEvent({
    actorId: req.atlasPrincipal!.id,
    action: input.listingStatus === 'published' ? 'MERCHANT_LISTING_PUBLISHED' : 'MERCHANT_LISTING_ARCHIVED',
    targetType: 'product', targetId: productId,
    details: { sku: product.sku, reason: input.reason, previousStatus: product.listingStatus, listingStatus: input.listingStatus }
  });
  res.json({ id: productId, listingStatus: input.listingStatus });
}));

atlasAdminRouter.patch('/admin/users/:id/role', ...adminOnly, asyncHandler(async (req, res) => {
  const principal = req.atlasPrincipal!;
  const userId = req.params.id;
  if (!userId) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User was not found.', requestId: req.requestId } });
    return;
  }
  if (userId === principal.id) {
    res.status(400).json({ error: { code: 'SELF_ROLE_CHANGE', message: 'An admin cannot change their own role.', requestId: req.requestId } });
    return;
  }
  const input = z.object({ role: z.enum(['shopper','merchant','inventory_manager','operator','admin']) }).parse(req.body);
  const users = getAtlasDb().collection<UserDocument>('users');
  const target = await users.findOne({ _id: userId });
  if (!target) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User was not found.', requestId: req.requestId } });
    return;
  }
  if (input.role === 'merchant') {
    const merchantProfile = await getAtlasDb().collection<MerchantDocument>('merchants').findOne({ userId });
    if (!merchantProfile) {
      res.status(409).json({ error: { code: 'MERCHANT_PROFILE_REQUIRED', message: 'Create a merchant application/profile before assigning the merchant role.', requestId: req.requestId } });
      return;
    }
  }
  const update = await users.updateOne({ _id: userId, role: target.role }, { $set: { role: input.role } });
  if (update.modifiedCount !== 1) {
    res.status(409).json({ error: { code: 'ROLE_CONFLICT', message: 'The user role changed concurrently. Refresh and retry.', requestId: req.requestId } });
    return;
  }
  await appendAuditEvent({
    actorId: principal.id,
    action: 'USER_ROLE_CHANGED',
    targetType: 'user',
    targetId: userId,
    details: { from: target.role, to: input.role }
  });
  res.json({ id: userId, email: target.email, role: input.role });
}));

atlasAdminRouter.delete('/admin/users/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const principal = req.atlasPrincipal!;
  const userId = req.params.id;
  if (!userId) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User was not found.', requestId: req.requestId } });
    return;
  }
  if (userId === principal.id) {
    res.status(400).json({ error: { code: 'SELF_DELETE', message: 'An admin cannot delete their own account.', requestId: req.requestId } });
    return;
  }
  const input = z.object({ email: z.string().email() }).parse(req.body);
  const users = getAtlasDb().collection<UserDocument>('users');
  const target = await users.findOne({ _id: userId });
  if (!target) {
    res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User was not found.', requestId: req.requestId } });
    return;
  }
  if (target.email.toLowerCase() !== input.email.toLowerCase()) {
    res.status(400).json({ error: { code: 'CONFIRMATION_MISMATCH', message: 'The confirmation email does not match this account.', requestId: req.requestId } });
    return;
  }

  // Preserve orders, financial history and audit references: disable the account
  // and revoke active refresh sessions instead of hard-deleting the user row.
  const now = new Date();
  await users.updateOne({ _id: userId }, { $set: { disabledAt: now, refreshSessions: [] } });
  await appendAuditEvent({
    actorId: principal.id,
    action: 'USER_DISABLED',
    targetType: 'user',
    targetId: userId,
    details: { email: target.email, role: target.role, disabledAt: now.toISOString() }
  });
  res.status(204).end();
}));

atlasAdminRouter.post('/admin/merchants/:id/decision', ...adminOnly, asyncHandler(async (req, res) => {
  const principal = req.atlasPrincipal!;
  const merchantId = req.params.id;
  if (!merchantId) {
    res.status(404).json({ error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant application was not found.', requestId: req.requestId } });
    return;
  }
  const input = z.object({
    decision: z.enum(['approved','rejected']),
    reason: z.string().trim().min(4).max(500)
  }).parse(req.body);
  const merchant = await new MongoMerchantRepository().decide(
    merchantId,
    principal.id,
    input.decision,
    input.reason
  );
  if (!merchant) {
    res.status(404).json({ error: { code: 'MERCHANT_APPLICATION_NOT_PENDING', message: 'No pending merchant application was found.', requestId: req.requestId } });
    return;
  }
  res.json({ merchant });
}));

