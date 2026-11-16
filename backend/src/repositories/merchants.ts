import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getAtlasClient, getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, MerchantState, ProductDocument, UserDocument } from './contracts.js';
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
    const database = getAtlasDb();
    const session = getAtlasClient().startSession();
    let merchant: MerchantDocument | null = null;
    try {
      merchant = await session.withTransaction(async (): Promise<MerchantDocument | null> => {
        const pending = await this.merchants().findOne(
          { _id: merchantId, status: 'pending' },
          { session }
        );
        if (!pending) return null;

        const owner = await database.collection<UserDocument>('users').findOne({
          _id: pending.userId,
          role: 'merchant',
          $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
        }, { session });
        if (!owner) {
          throw Object.assign(new Error('The applicant account is disabled or no longer has the merchant role.'), {
            status: 409,
            code: 'MERCHANT_OWNER_NOT_ELIGIBLE'
          });
        }

        const decided = await this.merchants().findOneAndUpdate(
          { _id: merchantId, status: 'pending' },
          {
            $set: {
              status: decision,
              updatedAt: now,
              ...(decision === 'rejected' ? { rejectionReason: explanation } : {})
            }
          },
          { session, returnDocument: 'after' }
        );
        if (!decided) {
          throw Object.assign(new Error('The merchant application changed concurrently.'), {
            status: 409,
            code: 'MERCHANT_DECISION_CONFLICT'
          });
        }

        await database.collection<ProductDocument>('products').updateMany(
          { merchantId, managedBy: 'merchant', listingStatus: 'draft' },
          { $set: { listingStatus: decision === 'approved' ? 'published' : 'archived', updatedAt: now } },
          { session }
        );
        return decided;
      });
    } finally {
      await session.endSession();
    }
    if (!merchant) return null;
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
