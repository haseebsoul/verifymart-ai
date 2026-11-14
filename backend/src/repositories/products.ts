import type { Collection, UpdateFilter } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { ProductDocument, ProvenanceDocument } from './contracts.js';

export class MongoProductRepository {
  private products(): Collection<ProductDocument> {
    return getAtlasDb().collection<ProductDocument>('products');
  }

  async findPublic(): Promise<ProductDocument[]> {
    const merchants = getAtlasDb().collection('merchants');
    const approvedMerchantIds = await merchants.distinct<string>('_id', { status: 'approved' });
    return this.products().find({
      listingStatus: 'published',
      $or: [{ merchantId: null, managedBy: 'platform' }, { merchantId: { $in: approvedMerchantIds } }]
    }).sort({ category: 1, name: 1 }).toArray();
  }

  async findById(id: string): Promise<ProductDocument | null> {
    return this.products().findOne({ _id: id });
  }

  async findBySkuOrBatch(query: string): Promise<ProductDocument | null> {
    const normalized = query.trim();
    if (!normalized || normalized.length > 180) return null;
    return this.products().findOne({
      $or: [
        { sku: { $regex: '^' + escapeRegex(normalized) + '$', $options: 'i' } },
        { batchHash: { $regex: '^' + escapeRegex(normalized) + '$', $options: 'i' } },
        { _id: normalized }
      ]
    });
  }

  async findOwned(id: string, merchantId: string): Promise<ProductDocument | null> {
    return this.products().findOne({ _id: id, merchantId, managedBy: 'merchant' });
  }

  async changeOwnedStock(
    id: string,
    merchantId: string,
    delta: number,
    updatedAt = new Date()
  ): Promise<boolean> {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Stock delta must be a non-zero integer.');
    const result = await this.products().updateOne(
      { _id: id, merchantId, managedBy: 'merchant', stock: { $gte: Math.max(0, -delta) } },
      { $inc: { stock: delta }, $set: { updatedAt } }
    );
    return result.modifiedCount === 1;
  }

  async appendProvenanceEvent(id: string, event: ProvenanceDocument): Promise<boolean> {
    const result = await this.products().updateOne(
      { _id: id },
      { $push: { provenanceEvents: { $each: [event], $slice: -50 } }, $set: { updatedAt: event.occurredAt } } as UpdateFilter<ProductDocument>
    );
    return result.modifiedCount === 1;
  }

  async replaceProduct(product: ProductDocument): Promise<void> {
    await this.products().replaceOne({ _id: product._id }, product, { upsert: true });
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
