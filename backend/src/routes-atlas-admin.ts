import { Router } from 'express';
import { createHash } from 'node:crypto';
import { Long, MongoServerError } from 'mongodb';
import { z } from 'zod';
import { getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import { appendAuditEvent } from './repositories/audit.js';
import { MongoMerchantRepository } from './repositories/merchants.js';
import type { MerchantDocument, Role, UserDocument } from './repositories/contracts.js';

export const atlasAdminRouter = Router();
const adminOnly = [authenticateAtlas, requireAtlasRoleAndOwnership(['admin'])];

atlasAdminRouter.get('/admin/users', ...adminOnly, asyncHandler(async (_req, res) => {
  const users = await getAtlasDb().collection<UserDocument>('users')
    .find({}, { projection: { passwordHash: 0, refreshSessions: 0 } })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();
  res.json({ users });
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

export function asRole(value: string): Role | null {
  return ['shopper','merchant','inventory_manager','operator','admin'].includes(value) ? value as Role : null;
}

void Long;
void MongoServerError;
void MerchantDocument;
