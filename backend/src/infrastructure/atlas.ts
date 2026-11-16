import { Db, MongoClient, type Collection, type Document } from 'mongodb';
import type { AuditLogDocument } from '../repositories/contracts.js';
import { inspectExpectedAtlasIndexes } from './indexes.js';

export const ATLAS_OPERATIONAL_COLLECTIONS = [
  'users', 'merchants', 'products', 'hubs', 'tariffRules', 'orders',
  'threats', 'inventoryAdjustments', 'settings', 'trustLedger'
] as const;
export const ATLAS_COLLECTIONS = [...ATLAS_OPERATIONAL_COLLECTIONS, 'auditLog'] as const;

export type AtlasCollectionName = (typeof ATLAS_COLLECTIONS)[number];

let appClient: MongoClient | undefined;
let appDb: Db | undefined;
let auditWriterClient: MongoClient | undefined;
let auditWriterDb: Db | undefined;
let auditReaderClient: MongoClient | undefined;
let auditReaderDb: Db | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required before Atlas can be used.');
  return value;
}

function databaseName(): string {
  const name = requiredEnv('MONGODB_DB_NAME');
  if (!['verifymart_dev', 'verifymart_staging', 'verifymart_prod'].includes(name)) {
    throw new Error('MONGODB_DB_NAME must be verifymart_dev, verifymart_staging, or verifymart_prod. Legacy verifymart_v14 is not an application target.');
  }
  return name;
}

function clientOptions(suffix?: string) {
  return { appName: (process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI') + (suffix ?? '') };
}

export function getAtlasDb(): Db {
  if (!appDb) throw new Error('Atlas has not been connected. Call connectAtlas() during startup.');
  return appDb;
}

export function getAtlasClient(): MongoClient {
  if (!appClient) throw new Error('Atlas has not been connected. Call connectAtlas() during startup.');
  return appClient;
}

export function getCollection<TSchema extends Document = Document>(
  name: AtlasCollectionName
): Collection<TSchema> {
  return getAtlasDb().collection<TSchema>(name);
}

export async function connectAtlas(): Promise<Db> {
  if (appDb) return appDb;
  const uri = requiredEnv('MONGODB_URI');
  const name = databaseName();
  const client = new MongoClient(uri, clientOptions());

  try {
    await client.connect();
    const database = client.db(name);
    await database.command({ ping: 1 });

    const existing = new Set(
      await database.listCollections(
        { name: { $in: [...ATLAS_OPERATIONAL_COLLECTIONS] } },
        { nameOnly: true }
      ).map((item) => item.name).toArray()
    );
    const missingCollections = ATLAS_OPERATIONAL_COLLECTIONS.filter((collection) => !existing.has(collection));
    if (missingCollections.length) {
      throw new Error('Atlas database is missing provisioned collections: ' + missingCollections.join(', '));
    }

    // The application principal can inspect indexes on operational collections only.
    // auditLog indexes are validated by the out-of-band provisioning check.
    const missingIndexes = await inspectExpectedAtlasIndexes(database);
    if (missingIndexes.length) {
      throw new Error('Atlas database is missing required indexes: ' + missingIndexes.join(', '));
    }

    appClient = client;
    appDb = database;
    return database;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Append-only audit writer. Its Atlas principal has insert permission on
 * auditLog only; it must never be used for a read or verification query.
 */
export async function connectAuditLog(): Promise<Collection<AuditLogDocument>> {
  if (auditWriterDb) return auditWriterDb.collection<AuditLogDocument>('auditLog');
  const client = new MongoClient(requiredEnv('MONGODB_AUDIT_URI'), clientOptions('-Audit-Writer'));

  try {
    await client.connect();
    const database = client.db(databaseName());
    await database.command({ ping: 1 });
    auditWriterClient = client;
    auditWriterDb = database;
    return database.collection<AuditLogDocument>('auditLog');
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Separate read-only audit principal. Only Operator/Admin API handlers call
 * readAuditEvents; the Atlas database role grants find and nothing else.
 */
export async function connectAuditReader(): Promise<Collection<AuditLogDocument>> {
  if (auditReaderDb) return auditReaderDb.collection<AuditLogDocument>('auditLog');
  const client = new MongoClient(requiredEnv('MONGODB_AUDIT_READ_URI'), clientOptions('-Audit-Reader'));

  try {
    await client.connect();
    const database = client.db(databaseName());
    await database.command({ ping: 1 });
    await database.collection<AuditLogDocument>('auditLog').findOne({}, { projection: { _id: 1 } });
    auditReaderClient = client;
    auditReaderDb = database;
    return database.collection<AuditLogDocument>('auditLog');
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function closeAtlas(): Promise<void> {
  const clients = [appClient, auditWriterClient, auditReaderClient]
    .filter((client): client is MongoClient => Boolean(client));
  appClient = undefined;
  appDb = undefined;
  auditWriterClient = undefined;
  auditWriterDb = undefined;
  auditReaderClient = undefined;
  auditReaderDb = undefined;
  await Promise.all(clients.map((client) => client.close()));
}

export async function checkAtlasReady(): Promise<void> {
  await getAtlasDb().command({ ping: 1 });
  if (!auditWriterDb) throw new Error('The separate insert-only Atlas audit principal is not connected.');
  await auditWriterDb.command({ ping: 1 });
  if (!auditReaderDb) throw new Error('The separate find-only Atlas audit principal is not connected.');
  await auditReaderDb.command({ ping: 1 });
  await auditReaderDb.collection<AuditLogDocument>('auditLog').findOne({}, { projection: { _id: 1 } });
}

export function asUtcDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid timestamp supplied to Atlas repository.');
  return parsed;
}
