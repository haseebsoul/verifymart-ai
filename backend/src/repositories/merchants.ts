import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, MerchantState, ProductDocument } from './contracts.js';
import { appendAuditEvent } from './audit.js';

export class MongoMerchantRepository {
  private merchants(): Collection<MerchantDocument> {
    return getAtlasDb().collection<MerchantDocument>('merchants');
  }

  async findByUserId(userId: string): Promise<MerchantDocument | null> {
    return this.merchants().findOne({ userId });
  }

  async createPending(input: {
    userId: string;
    businessName: string;
    country: string;
  }): Promise<MerchantDocument> {
    const now = new Date();
    const merchant: MerchantDocument = {
      _id: 'mrc_' + randomUUID().replaceAll('-', '').slice(0, 18),
      userId: input.userId,
      businessName: input.businessName.trim(),
      country: input.country,
      status: 'pending',
      trustScore: 0,
      createdAt: now,
      updatedAt: now
    };
    await this.merchants().insertOne(merchant);
    return merchant;
  }

  async decide(
    merchantId: string,
    actorId: string,
    decision: Extract<MerchantState, 'approved' | 'rejected'>,
    reason: string
  ): Promise<MerchantDocument | null> {
    const explanation = reason.trim();
    if (explanation.length < 4 || explanation.length > 500) {
      throw Object.assign(new Error('A decision reason between 4 and 500 characters is required.'), {
        status: 400,
        code: 'MERCHANT_DECISION_REASON_REQUIRED'
      });
    }

    const now = new Date();
    const merchant = await this.merchants().findOneAndUpdate(
      { _id: merchantId, status: 'pending' },
      {
        $set: {
          status: decision,
          updatedAt: now,
          ...(decision === 'rejected' ? { rejectionReason: explanation } : {})
        }
      },
      { returnDocument: 'after' }
    );
    if (!merchant) return null;

    const products = getAtlasDb().collection<ProductDocument>('products');
    await products.updateMany(
      { merchantId, managedBy: 'merchant', listingStatus: 'draft' },
      { $set: { listingStatus: decision === 'approved' ? 'published' : 'archived', updatedAt: now } }
    );
    await appendAuditEvent({
      actorId,
      action: decision === 'approved' ? 'MERCHANT_APPROVED' : 'MERCHANT_REJECTED',
      targetType: 'merchant',
      targetId: merchantId,
      details: { userId: merchant.userId, reason: explanation }
    });
    return merchant;
  }
}
