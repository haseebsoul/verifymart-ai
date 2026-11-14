import { getAtlasDb } from '../infrastructure/atlas.js';
import { MongoProductRepository } from '../repositories/products.js';
import type { OrderDocument, ProductDocument } from '../repositories/contracts.js';

export interface AtlasVerificationResult {
  query: string;
  found: boolean;
  simulated: true;
  recordType: 'product' | 'order' | 'not_found';
  authenticityNote: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    authenticityScore: number;
    status: ProductDocument['status'];
    batchHash: string;
    provenanceEvents: ProductDocument['provenanceEvents'];
    evidenceCount: number;
    evidenceComplete: boolean;
  };
  order?: {
    id: string;
    state: OrderDocument['state'];
    destination: string;
    createdAt: Date;
    items: OrderDocument['items'];
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
      product: {
        id: product._id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        authenticityScore: product.authenticityScore,
        status: product.status,
        batchHash: product.batchHash,
        provenanceEvents: events,
        evidenceCount: events.length,
        evidenceComplete: events.length >= 4
      }
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
        createdAt: order.createdAt,
        items: order.items
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
