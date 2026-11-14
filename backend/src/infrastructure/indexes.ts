import type { Db, IndexDescription } from 'mongodb';

type IndexPlan = {
  collection: string;
  keys: IndexDescription['key'];
  options?: { name: string; unique?: boolean };
};

const indexes: IndexPlan[] = [
  { collection: 'users', keys: { email: 1 }, options: { name: 'users_email_unique', unique: true } },
  { collection: 'users', keys: { role: 1 }, options: { name: 'users_role' } },
  { collection: 'merchants', keys: { userId: 1 }, options: { name: 'merchants_user_id_unique', unique: true } },
  { collection: 'products', keys: { sku: 1 }, options: { name: 'products_sku_unique', unique: true } },
  { collection: 'products', keys: { batchHash: 1 }, options: { name: 'products_batch_hash_unique', unique: true } },
  { collection: 'products', keys: { name: 'text', brand: 'text' }, options: { name: 'products_name_brand_text' } },
  { collection: 'products', keys: { category: 1 }, options: { name: 'products_category' } },
  { collection: 'products', keys: { merchantId: 1 }, options: { name: 'products_merchant_id' } },
  { collection: 'products', keys: { status: 1 }, options: { name: 'products_status' } },
  { collection: 'hubs', keys: { code: 1 }, options: { name: 'hubs_code_unique', unique: true } },
  { collection: 'tariffRules', keys: { hsPrefix: 1, country: 1 }, options: { name: 'tariffRules_hsPrefix_country_unique', unique: true } },
  { collection: 'orders', keys: { idempotencyKey: 1 }, options: { name: 'orders_idempotency_key_unique', unique: true } },
  { collection: 'orders', keys: { userId: 1 }, options: { name: 'orders_user_id' } },
  { collection: 'orders', keys: { state: 1 }, options: { name: 'orders_state' } },
  { collection: 'orders', keys: { createdAt: -1 }, options: { name: 'orders_created_at' } },
  { collection: 'threats', keys: { severity: 1 }, options: { name: 'threats_severity' } },
  { collection: 'threats', keys: { resolvedAt: 1 }, options: { name: 'threats_resolved_at' } },
  { collection: 'threats', keys: { productId: 1 }, options: { name: 'threats_product_id' } },
  { collection: 'inventoryAdjustments', keys: { productId: 1 }, options: { name: 'inventoryAdjustments_product_id' } },
  { collection: 'inventoryAdjustments', keys: { actorId: 1 }, options: { name: 'inventoryAdjustments_actor_id' } },
  { collection: 'inventoryAdjustments', keys: { at: -1 }, options: { name: 'inventoryAdjustments_at' } },
  { collection: 'auditLog', keys: { actorId: 1 }, options: { name: 'auditLog_actor_id' } },
  { collection: 'auditLog', keys: { at: -1 }, options: { name: 'auditLog_at' } },
  { collection: 'settings', keys: { key: 1 }, options: { name: 'settings_key_unique', unique: true } },
  { collection: 'trustLedger', keys: { merchantId: 1 }, options: { name: 'trustLedger_merchant_id' } },
  { collection: 'trustLedger', keys: { at: -1 }, options: { name: 'trustLedger_at' } }
];

export async function ensureAtlasIndexes(database: Db): Promise<void> {
  for (const plan of indexes) {
    // auditLog indexes are managed by the deploy principal, not the runtime app credential.
    if (plan.collection === 'auditLog') continue;
    await database.collection(plan.collection).createIndex(plan.keys, plan.options);
  }
}

export async function inspectExpectedAtlasIndexes(database: Db, includeAudit = false): Promise<string[]> {
  const problems: string[] = [];
  for (const plan of indexes) {
    if (!includeAudit && plan.collection === 'auditLog') continue;
    const list = await database.collection(plan.collection).indexes();
    const found = list.some((item) => item.name === plan.options?.name);
    if (!found) problems.push(plan.collection + '.' + (plan.options?.name ?? 'unnamed'));
  }
  return problems;
}
