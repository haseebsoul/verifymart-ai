import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import { connectAuditLog } from '../infrastructure/atlas.js';
import type { AuditLogDocument } from './contracts.js';

export interface AppendAuditInput {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}

export async function appendAuditEvent(input: AppendAuditInput): Promise<void> {
  const auditLog = await connectAuditLog();
  const event: AuditLogDocument = {
    _id: 'aud_' + randomUUID().replaceAll('-', '').slice(0, 18),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    details: input.details,
    at: new Date()
  };
  await auditLog.insertOne(event);
}

export async function readAuditEvents(
  filter: Filter<AuditLogDocument> = {},
  limit = 100
): Promise<AuditLogDocument[]> {
  const auditLog = await connectAuditLog();
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  return auditLog.find(filter).sort({ at: -1 }).limit(safeLimit).toArray();
}
