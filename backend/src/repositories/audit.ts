import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import { connectAuditLog, connectAuditReader } from '../infrastructure/atlas.js';
import type { AuditLogDocument } from './contracts.js';

export interface AppendAuditInput {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}

export async function appendAuditEvent(input: AppendAuditInput): Promise<void> {
  const auditWriter = await connectAuditLog();
  const event: AuditLogDocument = {
    _id: 'aud_' + randomUUID().replaceAll('-', '').slice(0, 18),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    details: input.details,
    at: new Date()
  };
  await auditWriter.insertOne(event);
}

export async function readAuditEvents(
  filter: Filter<AuditLogDocument> = {},
  limit = 100
): Promise<AuditLogDocument[]> {
  // Never fall back to either the application or insert-only writer principal.
  const auditReader = await connectAuditReader();
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  return auditReader.find(filter).sort({ at: -1 }).limit(safeLimit).toArray();
}
