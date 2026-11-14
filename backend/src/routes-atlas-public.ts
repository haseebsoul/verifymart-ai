import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from './middleware/http.js';
import { calculateAtlasDuty } from './services/duty-atlas.js';
import { verifyAtlasQuery } from './services/verification-atlas.js';
import { getAtlasDb } from './infrastructure/atlas.js';
import { MongoProductRepository } from './repositories/products.js';
import type { ProductDocument } from './repositories/contracts.js';

export const atlasPublicRouter = Router();

const dutySchema = z.object({
  destinationCountry: z.enum(['US','UK','EU','AE','PK','SG']),
  items: z.array(z.object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(100)
  })).min(1).max(50)
});

atlasPublicRouter.get('/products', asyncHandler(async (req, res) => {
  const products = await new MongoProductRepository().findPublic();
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const verifiedOnly = req.query.verifiedOnly === 'true';
  const sort = req.query.sort === 'price_asc' ? 'price_asc' : req.query.sort === 'price_desc' ? 'price_desc' : 'name';
  let filtered = products.filter((product) =>
    (!category || product.category === category) &&
    (!search || (product.name + ' ' + product.brand + ' ' + product.sku).toLowerCase().includes(search)) &&
    (!verifiedOnly || product.status === 'verified')
  );
  filtered = [...filtered].sort((a,b) => {
    if (sort === 'price_asc') return a.priceCents.compare(b.priceCents);
    if (sort === 'price_desc') return b.priceCents.compare(a.priceCents);
    if (sort === 'authenticity') return b.authenticityScore - a.authenticityScore;
    return a.name.localeCompare(b.name);
  });
  res.json({
    total: filtered.length,
    products: filtered.map(product => ({
      id: product._id,
      sku: product.sku,
      batchHash: product.batchHash,
      hsCode: product.hsCode,
      name: product.name,
      brand: product.brand,
      category: product.category,
      priceUsd: product.priceCents.toNumber() / 100,
      dutyRatePct: 0,
      stock: product.stock,
      reorderThreshold: product.reorderThreshold,
      originHubId: product.originHubId,
      authenticityScore: product.authenticityScore,
      slaHours: product.slaHours,
      imageUrl: product.imageUrl,
      status: product.status
    }))
  });
}));

atlasPublicRouter.get('/products/:id', asyncHandler(async (req, res) => {
  const productId = req.params.id;
  if (!productId) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
    return;
  }
  const product = await getAtlasDb().collection<ProductDocument>('products').findOne({
    _id: productId,
    listingStatus: 'published'
  });
  if (!product) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found.', requestId: req.requestId } });
    return;
  }
  res.json({ product: { ...product, priceUsd: product.priceCents.toNumber() / 100 } });
}));

atlasPublicRouter.get('/verify/:query', asyncHandler(async (req, res) => {
  const result = await verifyAtlasQuery(req.params.query ?? '');
  res.status(result.found ? 200 : 404).json(result);
}));

atlasPublicRouter.post('/duty/calculate', asyncHandler(async (req, res) => {
  const input = dutySchema.parse(req.body);
  const quote = await calculateAtlasDuty(input.destinationCountry, input.items);
  res.json(quote);
}));
