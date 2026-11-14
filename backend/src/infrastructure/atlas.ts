import { Db, MongoClient, type Collection, type Document } from 'mongodb';
import type { AuditLogDocument } from '../repositories/contracts.js';
import { ensureAtlasIndexes } from './indexes.js';

export const ATLAS_COLLECTIONS = [
  'users', 'merchants', 'products', 'hubs', 'tariffRules', 'orders',
  'threats', 'inventoryAdjustments', 'auditLog', 'settings', 'trustLedger'
] as const;

export type AtlasCollectionName = (typeof ATLAS_COLLECTIONS)[number];

let appClient: MongoClient | undefined;
let appDb: Db | undefined;
let auditClient: MongoClient | undefined;
let auditDb: Db | undefined;

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
  const client = new MongoClient(uri, {
    appName: process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI'
  });

  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.command({ ping: 1 });

    const existing = new Set(
      await database.listCollections({}, { nameOnly: true }).map((item) => item.name).toArray()
    );
    for (const name of ATLAS_COLLECTIONS) {
      if (existing.has(name)) continue;
      if (name === 'auditLog') {
        throw new Error('auditLog must be provisioned by the deployment principal before app startup.');
      }
      await database.createCollection(name);
    }

    // Indexing auditLog requires a deployment credential. Runtime credentials
    // must not have update/remove (or schema-management) privileges on that collection.
    await ensureAtlasIndexes(database);
    appClient = client;
    appDb = database;
    return database;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

/**
 * The audit writer uses a distinct Atlas principal. Grant it find/insert on
 * auditLog only; do not grant update/remove. The ordinary app URI must not be
 * used to append audit entries.
 */
export async function connectAuditLog(): Promise<Collection<AuditLogDocument>> {
  if (auditDb) return auditDb.collection('auditLog');
  const uri = requiredEnv('MONGODB_AUDIT_URI');
  const databaseName = requiredEnv('MONGODB_DB_NAME');
  const client = new MongoClient(uri, {
    appName: (process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI') + '-Audit'
  });

  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.command({ ping: 1 });
    // This read confirms that the URI can access the collection without testing writes.
    await database.collection<AuditLogDocument>('auditLog').findOne({}, { projection: { _id: 1 } });
    auditClient = client;
    auditDb = database;
    return database.collection<AuditLogDocument>('auditLog');
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function closeAtlas(): Promise<void> {
  const clients = [appClient, auditClient].filter((client): client is MongoClient => Boolean(client));
  appClient = undefined;
  appDb = undefined;
  auditClient = undefined;
  auditDb = undefined;
  await Promise.all(clients.map((client) => client.close()));
}

export async function checkAtlasReady(): Promise<void> {
  await getAtlasDb().command({ ping: 1 });
}

export function asUtcDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid timestamp supplied to Atlas repository.');
  return parsed;
}
