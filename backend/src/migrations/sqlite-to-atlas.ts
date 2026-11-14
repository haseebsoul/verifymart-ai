import 'dotenv/config';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Long, MongoClient, type Document, type AnyBulkWriteOperation } from 'mongodb';

type Row = Record<string, unknown>;
type TargetCollection = {
  name: string;
  documents: Document[];
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function toDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid source timestamp: ' + String(value));
  return date;
}

function toLong(value: unknown): Long {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number)) throw new Error('Money value is not a safe integer number of cents.');
  return Long.fromNumber(number);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getTableNames(database: Database.Database): Set<string> {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>;
  return new Set(rows.map((row) => row.name));
}

function sourceRows(database: Database.Database, tables: Set<string>, table: string): Row[] {
  if (!tables.has(table)) return [];
  return database.prepare('SELECT * FROM ' + table).all() as Row[];
}

function mustHaveTables(tables: Set<string>): void {
  const required = ['users','hubs','products','tariff_rules','orders','order_items','threats','audit_logs','settings','trust_ledger'];
  const missing = required.filter((table) => !tables.has(table));
  if (missing.length) throw new Error('Source SQLite file is missing required tables: ' + missing.join(', '));
}

function buildCollections(database: Database.Database): TargetCollection[] {
  const tables = getTableNames(database);
  mustHaveTables(tables);
  const users = sourceRows(database, tables, 'users');
  const sessions = sourceRows(database, tables, 'sessions');
  const sessionsByUser = new Map<string, Array<{tokenHash:string;expiresAt:Date;createdAt:Date}>>();
  for (const session of sessions) {
    const userId = String(session.user_id);
    const list = sessionsByUser.get(userId) ?? [];
    list.push({
      tokenHash: String(session.token_hash),
      expiresAt: toDate(session.expires_at),
      createdAt: toDate(session.created_at)
    });
    sessionsByUser.set(userId, list);
  }

  const userDocs = users.map((row) => ({
    _id: String(row.id),
    name: String(row.name),
    email: String(row.email).toLowerCase(),
    passwordHash: String(row.password_hash),
    role: row.role === 'user' ? 'shopper' : row.role,
    failedLogins: Number(row.failed_logins ?? 0),
    lockedUntil: row.locked_until ? toDate(row.locked_until) : null,
    lastLogin: row.last_login ? toDate(row.last_login) : null,
    createdAt: toDate(row.created_at),
    refreshSessions: sessionsByUser.get(String(row.id)) ?? [],
    migratedFrom: 'sqlite-v1'
  }));

  const hubs = sourceRows(database, tables, 'hubs');
  const hubDocs = hubs.map((row) => ({
    _id: String(row.id),
    code: String(row.id),
    name: String(row.name),
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    latencyMs: Number(row.latency_ms ?? 0),
    status: String(row.status ?? 'unknown'),
    queueDepth: Number(row.queue_depth ?? 0),
    migratedFrom: 'sqlite-v1'
  }));

  const productRows = sourceRows(database, tables, 'products');
  const eventRows = sourceRows(database, tables, 'provenance_events');
  const eventsByProduct = new Map<string, Array<Record<string, unknown>>>();
  for (const event of eventRows) {
    const productId = String(event.product_id);
    const list = eventsByProduct.get(productId) ?? [];
    list.push({
      id: String(event.id),
      stage: String(event.stage),
      hubId: String(event.hub_id),
      occurredAt: toDate(event.occurred_at),
      hash: String(event.hash)
    });
    eventsByProduct.set(productId, list);
  }

  const productDocs = productRows.map((row) => ({
    _id: String(row.id),
    sku: String(row.sku),
    batchHash: String(row.batch_hash),
    hsCode: String(row.hs_code),
    name: String(row.name),
    brand: String(row.brand),
    category: String(row.category),
    priceCents: toLong(row.price_cents),
    dutyRateBps: Math.round(Number(row.duty_rate_pct ?? 0) * 100),
    stock: Number(row.stock),
    reorderThreshold: Number(row.reorder_threshold),
    originHubId: String(row.origin_hub_id),
    authenticityScore: Number(row.authenticity_score),
    slaHours: Number(row.sla_hours),
    imageUrl: String(row.image_url ?? ''),
    status: String(row.status),
    merchantId: null,
    managedBy: 'platform',
    provenanceEvents: (eventsByProduct.get(String(row.id)) ?? []).slice(-50),
    migratedFrom: 'sqlite-v1'
  }));

  const tariffs = sourceRows(database, tables, 'tariff_rules');
  const tariffDocs = tariffs.map((row) => ({
    _id: String(row.id),
    hsPrefix: String(row.hs_prefix),
    country: String(row.country),
    dutyRateBps: Math.round(Number(row.duty_pct) * 10000),
    vatRateBps: Math.round(Number(row.vat_pct) * 10000),
    vatIncludesCarrier: Number(row.vat_includes_carrier ?? 1) === 1,
    source: 'seed-tariff-v1',
    migratedFrom: 'sqlite-v1'
  }));

  const items = sourceRows(database, tables, 'order_items');
  const productsById = new Map(productDocs.map((product) => [String(product._id), product]));
  const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const product = productsById.get(String(item.product_id));
    if (!product) throw new Error('Order item refers to missing product ' + String(item.product_id));
    const list = itemsByOrder.get(String(item.order_id)) ?? [];
    list.push({
      productId: String(item.product_id),
      sku: String(product.sku),
      name: String(product.name),
      quantity: Number(item.quantity),
      unitPriceCents: toLong(item.unit_price_cents)
    });
    itemsByOrder.set(String(item.order_id), list);
  }

  const idempotency = sourceRows(database, tables, 'idempotency_keys');
  const idempotencyByOrder = new Map<string, {key:string;requestHash:string}>();
  for (const entry of idempotency) {
    const response = toJsonObject(entry.response_json);
    const orderId = typeof response.orderId === 'string' ? response.orderId : '';
    if (orderId) idempotencyByOrder.set(orderId, {
      key: String(entry.key),
      requestHash: String(entry.request_hash)
    });
  }

  const orderRows = sourceRows(database, tables, 'orders');
  const orderDocs = orderRows.map((row) => {
    const idKey = idempotencyByOrder.get(String(row.id));
    if (!idKey) {
      throw new Error('Order ' + String(row.id) + ' has no matching idempotency key; refusing incomplete migration.');
    }
    const createdAt = toDate(row.created_at);
    const updatedAt = toDate(row.updated_at ?? row.created_at);
    const receiptId = String(row.receipt_id);
    const state = String(row.state);
    return {
      _id: String(row.id),
      idempotencyKey: idKey.key,
      requestHash: idKey.requestHash,
      userId: String(row.user_id ?? ''),
      destination: String(row.destination),
      items: itemsByOrder.get(String(row.id)) ?? [],
      quote: {
        subtotalCents: toLong(row.subtotal_cents),
        dutyCents: toLong(row.duty_cents),
        vatCents: toLong(row.vat_cents),
        carrierFeeCents: toLong(row.carrier_fee_cents),
        totalCents: toLong(row.total_cents),
        source: 'seed-tariff-v1',
        formulaVersion: 'landed-cost-v1'
      },
      escrow: { state, receiptId, holdReason: row.hold_reason ? String(row.hold_reason) : null },
      state,
      createdAt,
      updatedAt,
      migratedFrom: 'sqlite-v1'
    };
  });

  const threatDocs = sourceRows(database, tables, 'threats').map((row) => ({
    _id: String(row.id),
    type: String(row.type),
    severity: String(row.severity),
    productId: String(row.product_id),
    detectedAt: toDate(row.detected_at),
    resolvedAt: row.resolved_at ? toDate(row.resolved_at) : null,
    migratedFrom: 'sqlite-v1'
  }));

  const adjustmentDocs = sourceRows(database, tables, 'inventory_adjustments').map((row) => ({
    _id: String(row.id),
    productId: String(row.product_id),
    actorId: String(row.actor_id),
    actorRole: row.actor_role === 'user' ? 'shopper' : String(row.actor_role),
    delta: Number(row.delta),
    reason: String(row.reason),
    at: toDate(row.at),
    migratedFrom: 'sqlite-v1'
  }));

  const auditDocs = sourceRows(database, tables, 'audit_logs').map((row) => ({
    _id: String(row.id),
    actorId: row.actor_id ? String(row.actor_id) : null,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    details: toJsonObject(row.details_json),
    at: toDate(row.at),
    migratedFrom: 'sqlite-v1'
  }));

  const settingDocs = sourceRows(database, tables, 'settings').map((row) => ({
    _id: String(row.key),
    key: String(row.key),
    value: Number.isFinite(Number(row.value)) ? Number(row.value) : String(row.value),
    updatedAt: new Date(),
    migratedFrom: 'sqlite-v1'
  }));

  const ledgerDocs = sourceRows(database, tables, 'trust_ledger').map((row) => ({
    _id: String(row.id),
    merchantId: String(row.merchant_id),
    delta: Number(row.delta),
    reason: String(row.reason),
    at: toDate(row.at),
    migratedFrom: 'sqlite-v1'
  }));

  return [
    { name: 'users', documents: userDocs },
    { name: 'merchants', documents: [] },
    { name: 'products', documents: productDocs },
    { name: 'hubs', documents: hubDocs },
    { name: 'tariffRules', documents: tariffDocs },
    { name: 'orders', documents: orderDocs },
    { name: 'threats', documents: threatDocs },
    { name: 'inventoryAdjustments', documents: adjustmentDocs },
    { name: 'auditLog', documents: auditDocs },
    { name: 'settings', documents: settingDocs },
    { name: 'trustLedger', documents: ledgerDocs }
  ];
}

async function main(): Promise<void> {
  const targetName = requiredEnv('MONGODB_DB_NAME');
  if (!['verifymart_dev','verifymart_staging'].includes(targetName)) {
    throw new Error('Migration is restricted to verifymart_dev or verifymart_staging. Production cutover is a separate approved operation.');
  }
  const sourcePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? '../data/verifymart.sqlite');
  if (!existsSync(sourcePath)) throw new Error('SQLite source file does not exist: ' + sourcePath);
  const uri = requiredEnv('MONGODB_MIGRATION_URI');
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const mongo = new MongoClient(uri, {
    appName: (process.env.MONGODB_APP_NAME ?? 'VerifyMart-AI') + '-Migration'
  });

  try {
    const plan = buildCollections(source);
    console.log('Migration plan for ' + targetName + ' (read-only dry run unless --apply is supplied):');
    for (const collection of plan) console.log('  ' + collection.name + ': ' + collection.documents.length + ' source documents');

    await mongo.connect();
    const database = mongo.db(targetName);
    await database.command({ ping: 1 });
    const apply = process.argv.includes('--apply');
    if (!apply) {
      console.log('Dry run complete. No MongoDB writes were performed.');
      return;
    }

    for (const collection of plan) {
      if (collection.name === 'auditLog') continue;
      if (collection.documents.length === 0) continue;
      const operations: AnyBulkWriteOperation<Document>[] = collection.documents.map((document) => ({
        replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true }
      }));
      await database.collection(collection.name).bulkWrite(operations, { ordered: true });
    }

    if (plan.find((item) => item.name === 'auditLog')!.documents.length > 0) {
      const auditUri = requiredEnv('MONGODB_AUDIT_MIGRATION_URI');
      const auditClient = new MongoClient(auditUri, { appName: 'VerifyMart-Audit-Migration' });
      try {
        await auditClient.connect();
        const auditOps: AnyBulkWriteOperation<Document>[] = plan.find((item) => item.name === 'auditLog')!.documents.map((document) => ({
          insertOne: { document }
        }));
        await auditClient.db(targetName).collection('auditLog').bulkWrite(auditOps, { ordered: true });
      } finally {
        await auditClient.close();
      }
    }

    for (const collection of plan) {
      const actual = await database.collection(collection.name).countDocuments({ migratedFrom: 'sqlite-v1' });
      if (actual !== collection.documents.length) {
        throw new Error('Document count mismatch for ' + collection.name + ': expected ' + collection.documents.length + ', found ' + actual);
      }
    }
    console.log('Migration count verification passed for all eleven collections.');
  } finally {
    source.close();
    await mongo.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown migration failure';
  console.error('Atlas migration failed: ' + message);
  process.exitCode = 1;
});
