import { createHash, randomUUID } from 'node:crypto';
import { Long, MongoServerError, type ClientSession } from 'mongodb';
import { getAtlasClient, getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, OrderDocument, ProductDocument, UserDocument } from './contracts.js';

export interface CheckoutItemRequest {
  productId: string;
  quantity: number;
}

export interface CheckoutQuoteCents {
  subtotalCents: number;
  dutyCents: number;
  vatCents: number;
  carrierFeeCents: number;
  totalCents: number;
}

export interface MongoCheckoutRequest {
  idempotencyKey: string;
  userId: string;
  destination: string;
  items: CheckoutItemRequest[];
  quote: CheckoutQuoteCents;
  holdReceiptId?: string;
}

export interface MongoCheckoutResult {
  order: OrderDocument;
  idempotencyReplayed: boolean;
}

function conflict(message: string, code: string): Error {
  return Object.assign(new Error(message), { status: 409, code });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404, code: 'PRODUCT_NOT_FOUND' });
}

export function normalizeItems(items: CheckoutItemRequest[]): CheckoutItemRequest[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw Object.assign(new Error('Checkout item is invalid.'), { status: 400, code: 'INVALID_CHECKOUT_ITEM' });
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([productId, quantity]) => ({ productId, quantity }));
}

function requestDigest(destination: string, items: CheckoutItemRequest[]): string {
  return createHash('sha256').update(JSON.stringify({ destination, items })).digest('hex');
}

function asLong(value: number): Long {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Order money values must be non-negative integer cents.');
  return Long.fromNumber(value);
}

export async function createMongoCheckout(input: MongoCheckoutRequest): Promise<MongoCheckoutResult> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw Object.assign(new Error('Provide an Idempotency-Key between 8 and 128 characters.'), { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  const normalizedItems = normalizeItems(input.items);
  const requestHash = requestDigest(input.destination, normalizedItems);
  const database = getAtlasDb();
  const orders = database.collection<OrderDocument>('orders');
  const products = database.collection<ProductDocument>('products');
  const merchants = database.collection<MerchantDocument>('merchants');
  const users = database.collection<UserDocument>('users');

  const replay = async (session?: ClientSession): Promise<MongoCheckoutResult | null> => {
    const existing = await orders.findOne({ idempotencyKey: input.idempotencyKey }, session ? { session } : {});
    if (!existing) return null;
    if (existing.userId !== input.userId || existing.requestHash !== requestHash) {
      throw conflict('This idempotency key was already used for a different request.', 'IDEMPOTENCY_CONFLICT');
    }
    return { order: existing, idempotencyReplayed: true };
  };

  const firstReplay = await replay();
  if (firstReplay) return firstReplay;

  const session = getAtlasClient().startSession();
  const orderId = 'ord_' + randomUUID().replaceAll('-', '').slice(0, 18);
  const receiptId = input.holdReceiptId ?? ('esc_' + randomUUID().replaceAll('-', '').slice(0, 18));
  const now = new Date();
  let created: OrderDocument | undefined;

  try {
    await session.withTransaction(async () => {
      const inTransactionReplay = await replay(session);
      if (inTransactionReplay) {
        created = inTransactionReplay.order;
        return;
      }

      const snapshots: OrderDocument['items'] = [];
      for (const item of normalizedItems) {
        const product = await products.findOne(
          {
            _id: item.productId,
            stock: { $gte: item.quantity },
            listingStatus: 'published',
            $or: [
              { managedBy: 'platform', merchantId: null },
              { managedBy: 'merchant', merchantId: { $type: 'string' } }
            ]
          },
          { session }
        );
        if (!product) {
          const existingProduct = await products.findOne({ _id: item.productId }, { session });
          if (!existingProduct) throw notFound('Product ' + item.productId + ' was not found.');
          throw conflict('Only ' + existingProduct.stock + ' units remain for ' + existingProduct.sku + '.', 'STOCK_INSUFFICIENT');
        }

        if (product.managedBy === 'merchant') {
          if (!product.merchantId) throw notFound('This listing is not available for checkout.');
          const merchant = await merchants.findOne(
            { _id: product.merchantId, status: 'approved' },
            { session }
          );
          if (!merchant) throw notFound('This merchant listing is not available for checkout.');
          const owner = await users.findOne({
            _id: merchant.userId,
            role: 'merchant',
            $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
          }, { session });
          if (!owner) throw notFound('This merchant listing is not available for checkout.');
        } else if (product.managedBy !== 'platform' || product.merchantId) {
          throw notFound('This listing is not available for checkout.');
        }

        const decrement = await products.updateOne(
          { _id: item.productId, stock: { $gte: item.quantity }, listingStatus: 'published' },
          { $inc: { stock: -item.quantity }, $set: { updatedAt: now, status: product.stock - item.quantity <= product.reorderThreshold ? 'low_stock' : product.status } },
          { session }
        );
        if (decrement.modifiedCount !== 1) {
          throw conflict('Stock changed during checkout. Please refresh your cart.', 'STOCK_INSUFFICIENT');
        }

        snapshots.push({
          productId: product._id,
          sku: product.sku,
          name: product.name,
          quantity: item.quantity,
          unitPriceCents: Long.fromValue(product.priceCents)
        });
      }

      const expectedSubtotal = snapshots.reduce(
        (sum, item) => sum + BigInt(item.unitPriceCents.toString()) * BigInt(item.quantity),
        0n
      );
      const suppliedSubtotal = BigInt(asLong(input.quote.subtotalCents).toString());
      const suppliedDuty = BigInt(asLong(input.quote.dutyCents).toString());
      const suppliedVat = BigInt(asLong(input.quote.vatCents).toString());
      const suppliedCarrier = BigInt(asLong(input.quote.carrierFeeCents).toString());
      const suppliedTotal = BigInt(asLong(input.quote.totalCents).toString());
      if (expectedSubtotal !== suppliedSubtotal) {
        throw conflict('A product price changed while your cart was open. Refresh the quote and retry.', 'PRICE_CHANGED');
      }
      if (suppliedSubtotal + suppliedDuty + suppliedVat + suppliedCarrier !== suppliedTotal) {
        throw Object.assign(new Error('The server-calculated checkout quote is internally inconsistent.'), {
          status: 400, code: 'INVALID_SERVER_QUOTE'
        });
      }

      const quote = {
        subtotalCents: asLong(input.quote.subtotalCents),
        dutyCents: asLong(input.quote.dutyCents),
        vatCents: asLong(input.quote.vatCents),
        carrierFeeCents: asLong(input.quote.carrierFeeCents),
        totalCents: asLong(input.quote.totalCents),
        source: 'seed-tariff-v1' as const,
        formulaVersion: 'landed-cost-v1' as const
      };
      const order: OrderDocument = {
        _id: orderId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        userId: input.userId,
        destination: input.destination,
        items: snapshots,
        quote,
        escrow: { state: 'held', receiptId, holdReason: null },
        state: 'held',
        createdAt: now,
        updatedAt: now
      };
      await orders.insertOne(order, { session });
      created = order;
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const concurrentReplay = await replay();
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!created) throw new Error('Checkout transaction completed without creating or replaying an order.');
  return { order: created, idempotencyReplayed: false };
}
