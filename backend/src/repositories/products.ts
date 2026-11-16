import type { Collection } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, ProductDocument, ProvenanceDocument, UserDocument } from './contracts.js';

export class MongoProductRepository {
  private products(): Collection<ProductDocument> {
    return getAtlasDb().collection<ProductDocument>('products');
  }

  private async activeApprovedMerchantIds(): Promise<string[]> {
    const database = getAtlasDb();
    const approved = await database.collection<MerchantDocument>('merchants')
      .find({ status: 'approved' }, { projection: { _id: 1, userId: 1 } }).toArray();
    if (!approved.length) return [];
    const users = await database.collection<UserDocument>('users')
      .find({
        _id: { $in: approved.map(merchant => String(merchant.userId)) },
        role: 'merchant',
        $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
      }, { projection: { _id: 1 } }).toArray();
    const activeIds = new Set(users.map(user => String(user._id)));
    return approved
      .filter(merchant => activeIds.has(String(merchant.userId)))
      .map(merchant => String(merchant._id));
  }

  async findPublic(): Promise<ProductDocument[]> {
    const approvedMerchantIds = await this.activeApprovedMerchantIds();
    return this.products().find({
      listingStatus: 'published',
      $or: [
        { merchantId: null, managedBy: 'platform' },
        { merchantId: { $in: approvedMerchantIds }, managedBy: 'merchant' }
      ]
    }).sort({ category: 1, name: 1 }).toArray();
  }

  async findPublicById(id: string): Promise<ProductDocument | null> {
    const product = await this.products().findOne({
      _id: id,
      listingStatus: 'published'
    });
    if (!product) return null;
    if (product.managedBy === 'platform' && !product.merchantId) return product;
    if (product.managedBy !== 'merchant' || !product.merchantId) return null;
    const allowed = await this.activeApprovedMerchantIds();
    return allowed.includes(product.merchantId) ? product : null;
  }

  async findById(id: string): Promise<ProductDocument | null> {
    return this.products().findOne({ _id: id });
  }

  async findBySkuOrBatch(query: string): Promise<ProductDocument | null> {
    const normalized = query.trim();
    if (!normalized || normalized.length > 180) return null;
    const product = await this.products().findOne({
      listingStatus: 'published',
      $or: [
        { sku: { $regex: '^' + escapeRegex(normalized) + '$', $options: 'i' } },
        { batchHash: { $regex: '^' + escapeRegex(normalized) + '$', $options: 'i' } },
        { _id: normalized }
      ]
    });
    if (!product) return null;
    if (product.managedBy === 'platform' && !product.merchantId) return product;
    if (product.managedBy !== 'merchant' || !product.merchantId) return null;
    const allowed = await this.activeApprovedMerchantIds();
    return allowed.includes(product.merchantId) ? product : null;
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
      { $push: { provenanceEvents: { $each: [event], $slice: -50 } }, $set: { updatedAt: event.occurredAt } } as never
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
