import {
  Db,
  MongoClient,
  type Collection,
  type Document
} from 'mongodb';

export const ATLAS_COLLECTIONS = [
  'users',
  'merchants',
  'products',
  'hubs',
  'tariffRules',
  'orders',
  'threats',
  'inventoryAdjustments',
  'auditLog',
  'settings',
  'trustLedger'
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

    const existing = new Set(await database.listCollections({}, { nameOnly: true }).map((item) => item.name).toArray());
    const missing = ATLAS_COLLECTIONS.filter((name) => !existing.has(name));
    if (missing.length > 0) {
      throw new Error('Atlas database is missing required collections: ' + missing.join(', '));
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
 * The audit writer deliberately uses a separate credential. Atlas must grant
 * this principal insert/find on auditLog only; it must not have update/remove.
 * The normal application principal is not used for audit inserts.
 */
export async function connectAuditLog(): Promise<Collection<Document>> {
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
    await database.collection('auditLog').findOne({}, { projection: { _id: 1 } });
    auditClient = client;
    auditDb = database;
    return database.collection('auditLog');
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
