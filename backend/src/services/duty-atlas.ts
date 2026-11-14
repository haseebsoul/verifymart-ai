import { Long } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { ProductDocument, TariffRuleDocument } from '../repositories/contracts.js';

export type AtlasDestination = 'US' | 'UK' | 'EU' | 'AE' | 'PK' | 'SG';
export interface AtlasDutyItemInput { productId: string; quantity: number }
export interface AtlasDutyLine {
  productId: string;
  sku: string;
  hsCode: string;
  quantity: number;
  value: number;
  duty: number;
  vat: number;
  carrierFee: number;
}
export interface AtlasDutyQuote {
  destinationCountry: AtlasDestination;
  currency: 'USD';
  lines: AtlasDutyLine[];
  subtotal: number;
  duty: number;
  vat: number;
  carrierFee: number;
  total: number;
  source: 'seed-tariff-v1';
  formulaVersion: 'landed-cost-v1';
  computedAt: string;
}

const carrierFeeCents: Record<AtlasDestination, number> = {
  US: 1500, UK: 1800, EU: 2000, AE: 1400, PK: 2800, SG: 1600
};

function roundRateHalfUp(valueCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(valueCents) || !Number.isSafeInteger(rateBps) || valueCents < 0 || rateBps < 0) {
    throw new Error('Duty calculation requires non-negative integer cents and basis points.');
  }
  const result = Math.floor((valueCents * rateBps) / 10_000 + 0.5);
  if (!Number.isSafeInteger(result)) throw new Error('Duty calculation exceeds the safe integer range.');
  return result;
}

function centsFromLong(value: Long): number {
  const cents = value.toNumber();
  if (!Number.isSafeInteger(cents)) throw new Error('Stored product price exceeds the safe integer range.');
  return cents;
}

function dollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * SRS 9.4: duty = productValue*dutyPct; VAT base includes carrier fee only
 * when the selected destination/HS rule says it does; round half-up per line,
 * then sum. Values are integer cents and tariff basis points throughout.
 */
export async function calculateAtlasDuty(
  destinationCountry: AtlasDestination,
  items: AtlasDutyItemInput[]
): Promise<AtlasDutyQuote> {
  if (!items.length) throw Object.assign(new Error('At least one item is required.'), { status: 400, code: 'ITEMS_REQUIRED' });
  const aggregated = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      throw Object.assign(new Error('Each quantity must be an integer from 1 to 100.'), { status: 400, code: 'INVALID_QUANTITY' });
    }
    aggregated.set(item.productId, (aggregated.get(item.productId) ?? 0) + item.quantity);
  }
  for (const quantity of aggregated.values()) {
    if (quantity > 100) throw Object.assign(new Error('Combined quantity per product cannot exceed 100.'), { status: 400, code: 'INVALID_QUANTITY' });
  }

  const database = getAtlasDb();
  const products = database.collection<ProductDocument>('products');
  const tariffRules = await database.collection<TariffRuleDocument>('tariffRules')
    .find({ country: destinationCountry }).sort({ hsPrefix: -1 }).toArray();
  if (!tariffRules.length) {
    throw Object.assign(new Error('No seeded tariff exists for this destination.'), { status: 422, code: 'TARIFF_NOT_FOUND' });
  }
  const baseRule = tariffRules.find((rule) => rule.hsPrefix === '');
  if (!baseRule) {
    throw Object.assign(new Error('The destination base tariff rule is missing.'), { status: 422, code: 'TARIFF_NOT_FOUND' });
  }

  const lines: AtlasDutyLine[] = [];
  let subtotalCents = 0;
  let totalDutyCents = 0;
  let totalVatCents = 0;
  let totalCarrierCents = 0;

  for (const [productId, quantity] of [...aggregated.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const product = await products.findOne({ _id: productId, listingStatus: 'published' });
    if (!product) {
      throw Object.assign(new Error('Product ' + productId + ' was not found.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    const rule = tariffRules.find((candidate) => candidate.hsPrefix !== '' && product.hsCode.startsWith(candidate.hsPrefix)) ?? baseRule;
    const valueCents = centsFromLong(product.priceCents) * quantity;
    const dutyCents = roundRateHalfUp(valueCents, rule.dutyRateBps);
    const carrierCents = carrierFeeCents[destinationCountry] * quantity;
    const vatBase = valueCents + dutyCents + (rule.vatIncludesCarrier ? carrierCents : 0);
    const vatCents = roundRateHalfUp(vatBase, rule.vatRateBps);

    lines.push({
      productId,
      sku: product.sku,
      hsCode: product.hsCode,
      quantity,
      value: dollars(valueCents),
      duty: dollars(dutyCents),
      vat: dollars(vatCents),
      carrierFee: dollars(carrierCents)
    });
    subtotalCents += valueCents;
    totalDutyCents += dutyCents;
    totalVatCents += vatCents;
    totalCarrierCents += carrierCents;
  }

  return {
    destinationCountry,
    currency: 'USD',
    lines,
    subtotal: dollars(subtotalCents),
    duty: dollars(totalDutyCents),
    vat: dollars(totalVatCents),
    carrierFee: dollars(totalCarrierCents),
    total: dollars(subtotalCents + totalDutyCents + totalVatCents + totalCarrierCents),
    source: baseRule.source,
    formulaVersion: 'landed-cost-v1',
    computedAt: new Date().toISOString()
  };
}
