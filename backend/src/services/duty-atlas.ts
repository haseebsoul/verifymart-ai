import { Long } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import { MongoProductRepository } from '../repositories/products.js';
import type { TariffRuleDocument } from '../repositories/contracts.js';

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

export function roundRateHalfUp(valueCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(valueCents) || !Number.isSafeInteger(rateBps) || valueCents < 0 || rateBps < 0) {
    throw new Error('Duty calculation requires non-negative integer cents and basis points.');
  }
  const numerator = BigInt(valueCents) * BigInt(rateBps);
  const rounded = (numerator + 5_000n) / 10_000n;
  const result = Number(rounded);
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
  const products = new MongoProductRepository();
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
    const product = await products.findPublicById(productId);
    if (!product) {
      throw Object.assign(new Error('Product ' + productId + ' was not found.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    const rule = tariffRules.find((candidate) => candidate.hsPrefix !== '' && product.hsCode.startsWith(candidate.hsPrefix)) ?? baseRule;
    const valueCents = centsFromLong(product.priceCents) * quantity;
    if (!Number.isSafeInteger(valueCents)) throw new Error('Checkout line value exceeds the safe integer range.');
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
    if (![subtotalCents,totalDutyCents,totalVatCents,totalCarrierCents].every(Number.isSafeInteger)) {
      throw new Error('Checkout quote exceeds the safe integer range.');
    }
  }

  const totalCents = subtotalCents + totalDutyCents + totalVatCents + totalCarrierCents;
  if (!Number.isSafeInteger(totalCents)) throw new Error('Checkout total exceeds the safe integer range.');

  return {
    destinationCountry,
    currency: 'USD',
    lines,
    subtotal: dollars(subtotalCents),
    duty: dollars(totalDutyCents),
    vat: dollars(totalVatCents),
    carrierFee: dollars(totalCarrierCents),
    total: dollars(totalCents),
    source: baseRule.source,
    formulaVersion: 'landed-cost-v1',
    computedAt: new Date().toISOString()
  };
}

export type PakistanTaxProfile = 'filer' | 'non-filer';

export interface PakistanDemoComponent {
  key: string;
  label: string;
  amountUsd: number;
  amountPkr: number;
  basis: 'atlas-seed-tariff' | 'demo-placeholder';
}

export interface PakistanDemoEstimate {
  simulated: true;
  disclosure: string;
  originCountry: string;
  destinationCity: string;
  taxProfile: PakistanTaxProfile;
  exchangeRatePkrPerUsd: number;
  exchangeRateSource: 'demo-placeholder';
  components: PakistanDemoComponent[];
  totalUsd: number;
  totalPkr: number;
  assumptions: {
    additionalCustomsDutyBps: number;
    regulatoryDutyBps: number;
    federalExciseDutyBps: number;
    withholdingTaxBps: number;
    platformFeeBps: number;
  };
}

const PAKISTAN_DEMO = {
  additionalCustomsDutyBps: 100,
  regulatoryDutyBps: 50,
  federalExciseDutyBps: 50,
  filerWithholdingBps: 100,
  nonFilerWithholdingBps: 200,
  platformFeeBps: 100,
  exchangeRatePkrPerUsd: 280
} as const;

export async function calculatePakistanDemoEstimate(
  items: AtlasDutyItemInput[],
  options: { originCountry: string; destinationCity: string; taxProfile: PakistanTaxProfile }
): Promise<AtlasDutyQuote & { pakistanDemo: PakistanDemoEstimate }> {
  const base = await calculateAtlasDuty('PK', items);
  const subtotalCents = Math.round(base.subtotal * 100);
  const dutyCents = Math.round(base.duty * 100);
  const vatCents = Math.round(base.vat * 100);
  const carrierCents = Math.round(base.carrierFee * 100);

  const additionalCents = roundRateHalfUp(subtotalCents, PAKISTAN_DEMO.additionalCustomsDutyBps);
  const regulatoryCents = roundRateHalfUp(subtotalCents, PAKISTAN_DEMO.regulatoryDutyBps);
  const exciseCents = roundRateHalfUp(subtotalCents, PAKISTAN_DEMO.federalExciseDutyBps);
  const withholdingBps = options.taxProfile === 'filer'
    ? PAKISTAN_DEMO.filerWithholdingBps
    : PAKISTAN_DEMO.nonFilerWithholdingBps;
  const taxableBase = subtotalCents + dutyCents + additionalCents + regulatoryCents + exciseCents + vatCents + carrierCents;
  const withholdingCents = roundRateHalfUp(taxableBase, withholdingBps);
  const platformFeeCents = roundRateHalfUp(subtotalCents, PAKISTAN_DEMO.platformFeeBps);

  const components: PakistanDemoComponent[] = [
    { key: 'assessedValue', label: 'Assessed item value', amountUsd: base.subtotal, amountPkr: Math.round(subtotalCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'atlas-seed-tariff' },
    { key: 'customsDuty', label: 'Customs duty (Atlas seed tariff)', amountUsd: base.duty, amountPkr: Math.round(dutyCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'atlas-seed-tariff' },
    { key: 'additionalCustomsDuty', label: 'Additional customs duty (demo placeholder 1.00%)', amountUsd: additionalCents / 100, amountPkr: Math.round(additionalCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'demo-placeholder' },
    { key: 'regulatoryDuty', label: 'Regulatory duty (demo placeholder 0.50%)', amountUsd: regulatoryCents / 100, amountPkr: Math.round(regulatoryCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'demo-placeholder' },
    { key: 'federalExciseDuty', label: 'Federal excise duty (demo placeholder 0.50%)', amountUsd: exciseCents / 100, amountPkr: Math.round(exciseCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'demo-placeholder' },
    { key: 'salesTax', label: 'Sales tax / VAT (Atlas seed tariff)', amountUsd: base.vat, amountPkr: Math.round(vatCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'atlas-seed-tariff' },
    { key: 'withholdingTax', label: 'Income tax withholding (demo placeholder ' + (withholdingBps / 100) + '.00%)', amountUsd: withholdingCents / 100, amountPkr: Math.round(withholdingCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'demo-placeholder' },
    { key: 'carrierFee', label: 'Carrier fee (seed estimate)', amountUsd: base.carrierFee, amountPkr: Math.round(carrierCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'atlas-seed-tariff' },
    { key: 'platformFee', label: 'Platform fee (demo placeholder 1.00%)', amountUsd: platformFeeCents / 100, amountPkr: Math.round(platformFeeCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100), basis: 'demo-placeholder' }
  ];

  const totalCents = subtotalCents + dutyCents + additionalCents + regulatoryCents + exciseCents +
    vatCents + withholdingCents + carrierCents + platformFeeCents;
  const totalUsd = Number((totalCents / 100).toFixed(2));
  const totalPkr = Math.round(totalCents * PAKISTAN_DEMO.exchangeRatePkrPerUsd / 100);

  return {
    ...base,
    total: totalUsd,
    pakistanDemo: {
      simulated: true,
      disclosure: 'DEMO PLACEHOLDER ONLY — these additional tax components and the USD/PKR conversion are illustrative assumptions, not official customs rates, tax advice or a live exchange quote.',
      originCountry: options.originCountry,
      destinationCity: options.destinationCity,
      taxProfile: options.taxProfile,
      exchangeRatePkrPerUsd: PAKISTAN_DEMO.exchangeRatePkrPerUsd,
      exchangeRateSource: 'demo-placeholder',
      components,
      totalUsd,
      totalPkr,
      assumptions: {
        additionalCustomsDutyBps: PAKISTAN_DEMO.additionalCustomsDutyBps,
        regulatoryDutyBps: PAKISTAN_DEMO.regulatoryDutyBps,
        federalExciseDutyBps: PAKISTAN_DEMO.federalExciseDutyBps,
        withholdingTaxBps: withholdingBps,
        platformFeeBps: PAKISTAN_DEMO.platformFeeBps
      }
    }
  };
}
