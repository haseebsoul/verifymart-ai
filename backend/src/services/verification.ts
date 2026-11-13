import type { Product, VerifyResult, ProvenanceEvent } from '@verifymart/shared';
import { db } from '../db.js';

type ProductRow = Record<string, unknown> & {
  id: string; sku: string; batch_hash: string; hs_code: string; name: string; brand: string; category: Product['category'];
  price_cents: number; duty_rate_pct: number; stock: number; reorder_threshold: number; origin_hub_id: string;
  authenticity_score: number; sla_hours: number; image_url: string; status: Product['status'];
};
function mapProduct(row: ProductRow): Product {
  return { id: row.id, sku: row.sku, batchHash: row.batch_hash, hsCode: row.hs_code, name: row.name, brand: row.brand,
    category: row.category, priceUsd: row.price_cents / 100, dutyRatePct: row.duty_rate_pct, stock: row.stock,
    reorderThreshold: row.reorder_threshold, originHubId: row.origin_hub_id, authenticityScore: row.authenticity_score,
    slaHours: row.sla_hours, imageUrl: row.image_url, status: row.status };
}
export function findVerification(query: string): VerifyResult | null {
  const normalized = query.trim();
  if (!normalized || normalized.length > 180) return null;
  const productStmt = db.prepare(`SELECT * FROM products WHERE sku = ? COLLATE NOCASE OR batch_hash = ? COLLATE NOCASE OR id = ?`);
  let row = productStmt.get(normalized, normalized, normalized) as ProductRow | undefined;
  let orderId: string | undefined;
  if (!row) {
    const order = db.prepare('SELECT id FROM orders WHERE id = ? OR receipt_id = ?').get(normalized, normalized) as { id: string } | undefined;
    if (order) {
      orderId = order.id;
      row = db.prepare('SELECT p.* FROM products p JOIN order_items oi ON oi.product_id = p.id WHERE oi.order_id = ? LIMIT 1').get(order.id) as ProductRow | undefined;
    }
  }
  if (!row) return null;
  const product = mapProduct(row);
  const events = db.prepare('SELECT id,stage,hub_id,occurred_at,hash FROM provenance_events WHERE product_id = ? ORDER BY occurred_at ASC').all(product.id) as Array<{id:string;stage:string;hub_id:string;occurred_at:string;hash:string}>;
  const timeline: ProvenanceEvent[] = events.map(event => ({ id: event.id, stage: event.stage, hubId: event.hub_id, occurredAt: event.occurred_at, hash: event.hash }));
  if (orderId) {
    const order = db.prepare('SELECT created_at FROM orders WHERE id = ?').get(orderId) as {created_at:string};
    timeline.push({ id: `${orderId}_order`, stage: 'Escrow order created (simulated)', hubId: product.originHubId, occurredAt: order.created_at, hash: 'demo-order-record' });
  }
  return { query: normalized, product, authenticityScore: product.authenticityScore,
    certificate: { factory: `${product.brand} certified partner facility`, batchHash: product.batchHash, hsCode: product.hsCode,
      issuedAt: timeline[0]?.occurredAt ?? new Date().toISOString() }, timeline, simulated: true };
}
