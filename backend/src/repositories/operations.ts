import { randomUUID } from 'node:crypto';
import type { Collection, Document } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type {
  InventoryAdjustmentDocument,
  Role,
  SettingDocument,
  ThreatDocument,
  TrustLedgerDocument
} from './contracts.js';

export class MongoOperationsRepository {
  private collection<T extends Document>(name: string): Collection<T> {
    return getAtlasDb().collection<T>(name);
  }

  async listOpenThreats(): Promise<ThreatDocument[]> {
    return this.collection<ThreatDocument>('threats')
      .find({ resolvedAt: null })
      .sort({ severity: 1, detectedAt: -1 })
      .toArray();
  }

  async resolveThreat(id: string, resolvedAt = new Date()): Promise<boolean> {
    const result = await this.collection<ThreatDocument>('threats').updateOne(
      { _id: id, resolvedAt: null },
      { $set: { resolvedAt } }
    );
    return result.modifiedCount === 1;
  }

  async recordInventoryAdjustment(input: {
    productId: string;
    actorId: string;
    actorRole: Role;
    delta: number;
    reason: string;
  }): Promise<InventoryAdjustmentDocument> {
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new Error('Inventory delta must be a non-zero integer.');
    const reason = input.reason.trim();
    if (reason.length < 4 || reason.length > 500) throw new Error('Inventory adjustment reason is required.');
    const record: InventoryAdjustmentDocument = {
      _id: 'iad_' + randomUUID().replaceAll('-', '').slice(0, 18),
      productId: input.productId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      delta: input.delta,
      reason,
      at: new Date()
    };
    await this.collection<InventoryAdjustmentDocument>('inventoryAdjustments').insertOne(record);
    return record;
  }

  async readSettings(): Promise<Record<string, number | string | boolean>> {
    const rows = await this.collection<SettingDocument>('settings').find({}).toArray();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async writeSettings(values: Record<string, number | string | boolean>): Promise<void> {
    const collection = this.collection<SettingDocument>('settings');
    const now = new Date();
    for (const [key, value] of Object.entries(values)) {
      await collection.updateOne(
        { key },
        { $set: { key, value, updatedAt: now }, $setOnInsert: { _id: key } },
        { upsert: true }
      );
    }
  }

  async readTrustLedger(merchantId: string): Promise<TrustLedgerDocument[]> {
    return this.collection<TrustLedgerDocument>('trustLedger')
      .find({ merchantId })
      .sort({ at: -1 })
      .toArray();
  }

  async recordTrustEntry(input: { merchantId: string; delta: number; reason: string }): Promise<TrustLedgerDocument> {
    const row: TrustLedgerDocument = {
      ...input,
      _id: 'trl_' + randomUUID().replaceAll('-', '').slice(0, 18),
      at: new Date()
    };
    await this.collection<TrustLedgerDocument>('trustLedger').insertOne(row);
    return row;
  }

  async adjustStock(
    productId: string,
    delta: number,
    canAdjust: { merchantId?: string; platformWide: boolean }
  ): Promise<boolean> {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Stock delta must be a non-zero integer.');
    const filter: Record<string, unknown> = { _id: productId, stock: { $gte: Math.max(0, -delta) } };
    if (!canAdjust.platformWide) {
      if (!canAdjust.merchantId) return false;
      filter.merchantId = canAdjust.merchantId;
      filter.managedBy = 'merchant';
    }
    const result = await this.collection('products').updateOne(
      filter,
      { $inc: { stock: delta }, $set: { updatedAt: new Date() } }
    );
    return result.modifiedCount === 1;
  }
}
