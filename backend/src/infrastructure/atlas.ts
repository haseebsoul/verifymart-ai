import { Db, MongoClient, type Collection, type Document } from 'mongodb';
import type { AuditLogDocument } from '../repositories/contracts.js';
import { inspectExpectedAtlasIndexes } from './indexes.js';

export const ATLAS_OPERATIONAL_COLLECTIONS = [
  'users', 'merchants', 'products', 'hubs', 'tariffRules', 'orders',
  'threats', 'inventoryAdjustments', 'settings', 'trustLedger'
] as const;

// The complete collection inventory is for deployment/seed tooling only.
// The runtime app principal is intentionally scoped to the ten operational collections.
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
  const databaseName = requiredEnv('MONGODB_DB_NAME');
  if (!['verifymart_dev', 'verifymart_staging', 'verifymart_prod'].includes(databaseName)) {
    throw new Error('MONGODB_DB_NAME must be verifymart_dev, verifymart_staging, or verifymart_prod. Legacy verifymart_v14 is not an application target.');
  }
  const client = new MongoClient(uri, {
    appName: process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI'
  });

  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.command({ ping: 1 });

    const existing = new Set(
      await database.listCollections(
        { name: { $in: [...ATLAS_OPERATIONAL_COLLECTIONS] } },
        { nameOnly: true }
      ).map((item) => item.name).toArray()
    );
    const missingCollections = ATLAS_OPERATIONAL_COLLECTIONS.filter((name) => !existing.has(name));
    if (missingCollections.length) {
      throw new Error('Atlas database is missing provisioned collections: ' + missingCollections.join(', '));
    }

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
 * Append-only audit writer: grant insert on auditLog only. It must never query
 * the collection; all audit reads use the separately scoped read principal.
 */
export async function connectAuditLog(): Promise<Collection<AuditLogDocument>> {
  if (auditWriterDb) return auditWriterDb.collection('auditLog');
  const uri = requiredEnv('MONGODB_AUDIT_URI');
  const databaseName = requiredEnv('MONGODB_DB_NAME');
  const client = new MongoClient(uri, {
    appName: (process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI') + '-Audit-Writer'
  });

  try {
    await client.connect();
    const database = client.db(databaseName);
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
 * Audit reader: grant find on auditLog only. This principal is used exclusively
 * by the Operator/Admin audit review and export endpoints.
 */
export async function connectAuditLogReader(): Promise<Collection<AuditLogDocument>> {
  if (auditReaderDb) return auditReaderDb.collection('auditLog');
  const uri = requiredEnv('MONGODB_AUDIT_READ_URI');
  const databaseName = requiredEnv('MONGODB_DB_NAME');
  const client = new MongoClient(uri, {
    appName: (process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI') + '-Audit-Reader'
  });

  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.command({ ping: 1 });
    // Exercise find permission during startup without exposing any audit content.
    await database.collection<AuditLogDocument>('auditLog').find({}, { projection: { _id: 1 } }).limit(1).toArray();
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
  if (!auditWriterDb) throw new Error('The append-only Atlas audit writer is not connected.');
  if (!auditReaderDb) throw new Error('The read-only Atlas audit reader is not connected.');
  await auditWriterDb.command({ ping: 1 });
  await auditReaderDb.command({ ping: 1 });
  await auditReaderDb.collection<AuditLogDocument>('auditLog')
    .find({}, { projection: { _id: 1 } }).limit(1).toArray();
}

export function asUtcDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid timestamp supplied to Atlas repository.');
  return parsed;
}
