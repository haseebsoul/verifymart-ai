import { getAtlasDb } from '../infrastructure/atlas.js';
import { MongoProductRepository } from '../repositories/products.js';
import type { OrderDocument, ProductDocument } from '../repositories/contracts.js';

export interface AtlasVerificationResult {
  query: string;
  found: boolean;
  simulated: true;
  recordType: 'product' | 'order' | 'not_found';
  authenticityNote: string;
  authenticityScore?: number;
  product?: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    category: string;
    priceUsd: number;
    status: ProductDocument['status'];
    authenticityScore: number;
    batchHash: string;
    hsCode: string;
    originHubId: string;
  };
  certificate?: {
    factory: string;
    batchHash: string;
    hsCode: string;
    issuedAt: string;
  };
  timeline?: Array<{
    id: string;
    stage: string;
    hubId: string;
    occurredAt: string;
    hash: string;
  }>;
  order?: {
    id: string;
    state: OrderDocument['state'];
    destination: string;
    createdAt: string;
    items: Array<{ productId: string; sku: string; name: string; quantity: number }>;
    totalUsd: number;
  };
}

const authenticityNote =
  'This is an application verification record using seeded or merchant-submitted data. Hashes and events are not manufacturer-signed proof and do not guarantee real-world authenticity.';

export async function verifyAtlasQuery(query: string): Promise<AtlasVerificationResult> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 180) {
    throw Object.assign(new Error('Verification query must contain 1 to 180 characters.'), { status: 400, code: 'INVALID_QUERY' });
  }
  const product = await new MongoProductRepository().findBySkuOrBatch(normalized);
  if (product && product.listingStatus === 'published') {
    const events = [...product.provenanceEvents].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return {
      query: normalized,
      found: true,
      simulated: true,
      recordType: 'product',
      authenticityNote,
      authenticityScore: product.authenticityScore,
      product: {
        id: product._id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        priceUsd: product.priceCents.toNumber() / 100,
        status: product.status,
        authenticityScore: product.authenticityScore,
        batchHash: product.batchHash,
        hsCode: product.hsCode,
        originHubId: product.originHubId
      },
      certificate: {
        factory: 'Application-generated verification record — not a manufacturer certificate',
        batchHash: product.batchHash,
        hsCode: product.hsCode,
        issuedAt: (events[0]?.occurredAt ?? product.createdAt).toISOString()
      },
      timeline: events.map(event => ({
        id: event.id,
        stage: event.stage,
        hubId: event.hubId,
        occurredAt: event.occurredAt.toISOString(),
        hash: event.hash
      }))
    };
  }

  const order = await getAtlasDb().collection<OrderDocument>('orders').findOne({ _id: normalized });
  if (order) {
    return {
      query: normalized,
      found: true,
      simulated: true,
      recordType: 'order',
      authenticityNote,
      order: {
        id: order._id,
        state: order.state,
        destination: order.destination,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map(item => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity
        })),
        totalUsd: order.quote.totalCents.toNumber() / 100
      }
    };
  }

  return {
    query: normalized,
    found: false,
    simulated: true,
    recordType: 'not_found',
    authenticityNote
  };
}
