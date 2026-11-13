import { Router } from 'express';
import type { Product } from '@verifymart/shared';
import { db } from './db.js';
import { asyncHandler } from './middleware/http.js';
import { findVerification } from './services/verification.js';

export const catalogRouter = Router();
type ProductRow = { id:string;sku:string;batch_hash:string;hs_code:string;name:string;brand:string;category:Product['category'];price_cents:number;duty_rate_pct:number;stock:number;reorder_threshold:number;origin_hub_id:string;authenticity_score:number;sla_hours:number;image_url:string;status:Product['status'] };
function mapProduct(p: ProductRow): Product { return { id:p.id,sku:p.sku,batchHash:p.batch_hash,hsCode:p.hs_code,name:p.name,brand:p.brand,category:p.category,
  priceUsd:p.price_cents/100,dutyRatePct:p.duty_rate_pct,stock:p.stock,reorderThreshold:p.reorder_threshold,originHubId:p.origin_hub_id,
  authenticityScore:p.authenticity_score,slaHours:p.sla_hours,imageUrl:p.image_url,status:p.status }; }
const selectProducts = `SELECT p.*,h.name AS hub_name FROM products p JOIN hubs h ON h.id=p.origin_hub_id`;
catalogRouter.get('/products', asyncHandler(async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0,100) : '';
  const verifiedOnly = req.query.verifiedOnly === 'true';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'authenticity';
  const where: string[] = []; const args: string[] = [];
  if (category) { where.push('p.category = ?'); args.push(category); }
  if (search) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.sku LIKE ?)'); args.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  if (verifiedOnly) where.push("p.status = 'verified'");
  const order = sort === 'price_asc' ? 'p.price_cents ASC' : sort === 'price_desc' ? 'p.price_cents DESC' : 'p.authenticity_score DESC';
  const sql = `${selectProducts} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order},p.sku ASC`;
  const rows = db.prepare(sql).all(...args) as ProductRow[];
  res.json({ products: rows.map(mapProduct), total: rows.length });
}));
catalogRouter.get('/products/:id', (req, res) => {
  const row = db.prepare(`${selectProducts} WHERE p.id = ? OR p.sku = ? COLLATE NOCASE`).get(req.params.id, req.params.id) as ProductRow | undefined;
  if (!row) { res.status(404).json({ error: { code:'PRODUCT_NOT_FOUND',message:'Product was not found.',requestId:req.requestId } }); return; }
  res.json({ product: mapProduct(row), originHubName: (row as ProductRow & {hub_name:string}).hub_name });
});
catalogRouter.get('/verify/:query', (req, res) => {
  const result = findVerification(req.params.query);
  if (!result) { res.status(404).json({ error: { code:'VERIFICATION_NOT_FOUND',message:'Nothing found for that code. Try one of the sample hashes.',requestId:req.requestId } }); return; }
  res.json(result);
});
