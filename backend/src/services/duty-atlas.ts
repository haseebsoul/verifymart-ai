import { Long } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import { MongoProductRepository } from '../repositories/products.js';
import type { SettingDocument, TariffRuleDocument } from '../repositories/contracts.js';

export type AtlasDestination = 'US' | 'UK' | 'EU' | 'AE' | 'PK' | 'SG';
export interface AtlasDutyItemInput { productId: string; quantity: number }
export interface AtlasDutyOptions { originCountry?: string; destinationCity?: string; taxProfile?: 'filer' | 'non-filer' }
export interface AtlasDutyLine {
  productId: string; sku: string; hsCode: string; quantity: number;
  value: number; duty: number; additionalCustomsDuty: number; regulatoryDuty: number;
  federalExciseDuty: number; vat: number; incomeTaxWithholding: number; carrierFee: number; platformFee: number;
}
export interface AtlasDutyQuote {
  destinationCountry: AtlasDestination; currency: 'USD'; lines: AtlasDutyLine[];
  subtotal: number; duty: number; additionalCustomsDuty: number; regulatoryDuty: number;
  federalExciseDuty: number; vat: number; incomeTaxWithholding: number; carrierFee: number;
  platformFee: number; total: number; totalPkr: number | null; usdToPkrRate: number | null;
  originCountry: string | null; destinationCity: string | null; taxProfile: 'filer' | 'non-filer';
  demoPlaceholders: boolean; placeholderNotice: string;
  source: 'seed-tariff-v1' | 'demo-placeholder-tariff-v1';
  formulaVersion: 'landed-cost-v1' | 'landed-cost-demo-v2'; computedAt: string;
}
const carrierFeeCents: Record<AtlasDestination, number> = { US:1500, UK:1800, EU:2000, AE:1400, PK:2800, SG:1600 };
const PLACEHOLDER_KEYS = [
  'pkAdditionalCustomsDutyBps','pkRegulatoryDutyBps','pkFederalExciseDutyBps',
  'pkIncomeTaxWithholdingFilerBps','pkIncomeTaxWithholdingNonFilerBps','pkPlatformFeeBps','demoUsdToPkrRate'
] as const;

export function roundRateHalfUp(valueCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(valueCents) || !Number.isSafeInteger(rateBps) || valueCents < 0 || rateBps < 0) {
    throw new Error('Duty calculation requires non-negative integer cents and basis points.');
  }
  const result = Number((BigInt(valueCents) * BigInt(rateBps) + 5_000n) / 10_000n);
  if (!Number.isSafeInteger(result)) throw new Error('Duty calculation exceeds the safe integer range.');
  return result;
}
function centsFromLong(value: Long): number {
  const cents = value.toNumber();
  if (!Number.isSafeInteger(cents)) throw new Error('Stored product price exceeds the safe integer range.');
  return cents;
}
function dollars(cents: number): number { return Number((cents / 100).toFixed(2)); }
function settingNumber(settings: Map<string, SettingDocument>, key: string): number {
  const value = settings.get(key)?.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error('The Pakistan demo estimate settings are not seeded: ' + key), {
      status:503, code:'DEMO_TARIFF_SETTINGS_MISSING'
    });
  }
  return value;
}

/**
 * Pakistan ACD/RD/FED/platform rates and WHT/FX are clearly disclosed demo
 * assumptions stored in Atlas settings. ACD/RD/FED/platform are applied to
 * item value; WHT uses item value + duties + VAT + carrier for this demo only.
 */
export async function calculateAtlasDuty(
  destinationCountry: AtlasDestination,
  items: AtlasDutyItemInput[],
  options: AtlasDutyOptions = {}
): Promise<AtlasDutyQuote> {
  if (!items.length) throw Object.assign(new Error('At least one item is required.'), { status:400, code:'ITEMS_REQUIRED' });
  const aggregated = new Map<string,number>();
  for (const item of items) {
    if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      throw Object.assign(new Error('Each quantity must be an integer from 1 to 100.'), { status:400, code:'INVALID_QUANTITY' });
    }
    aggregated.set(item.productId,(aggregated.get(item.productId)??0)+item.quantity);
  }
  for (const quantity of aggregated.values()) if (quantity > 100) {
    throw Object.assign(new Error('Combined quantity per product cannot exceed 100.'), { status:400, code:'INVALID_QUANTITY' });
  }

  const database = getAtlasDb();
  const products = new MongoProductRepository();
  const [tariffRules, settingRows] = await Promise.all([
    database.collection<TariffRuleDocument>('tariffRules').find({country:destinationCountry}).sort({hsPrefix:-1}).toArray(),
    destinationCountry === 'PK'
      ? database.collection<SettingDocument>('settings').find({key:{$in:[...PLACEHOLDER_KEYS,'pkRatesAreDemoPlaceholders']}}).toArray()
      : Promise.resolve([])
  ]);
  if (!tariffRules.length) throw Object.assign(new Error('No seeded tariff exists for this destination.'), {status:422,code:'TARIFF_NOT_FOUND'});
  const baseRule = tariffRules.find(rule => rule.hsPrefix === '');
  if (!baseRule) throw Object.assign(new Error('The destination base tariff rule is missing.'), {status:422,code:'TARIFF_NOT_FOUND'});

  const settings = new Map(settingRows.map(row=>[row.key,row]));
  const demo = destinationCountry === 'PK';
  if (demo && settings.get('pkRatesAreDemoPlaceholders')?.value !== true) {
    throw Object.assign(new Error('Pakistan demo rates are not flagged as placeholders.'), {status:503,code:'DEMO_TARIFF_SETTINGS_MISSING'});
  }
  const rates = demo ? {
    acd:settingNumber(settings,'pkAdditionalCustomsDutyBps'),
    regulatory:settingNumber(settings,'pkRegulatoryDutyBps'),
    fed:settingNumber(settings,'pkFederalExciseDutyBps'),
    withholding:settingNumber(settings,options.taxProfile === 'non-filer' ? 'pkIncomeTaxWithholdingNonFilerBps' : 'pkIncomeTaxWithholdingFilerBps'),
    platform:settingNumber(settings,'pkPlatformFeeBps'),
    fx:settingNumber(settings,'demoUsdToPkrRate')
  } : {acd:0,regulatory:0,fed:0,withholding:0,platform:0,fx:0};

  const totals = {subtotal:0,duty:0,additionalCustomsDuty:0,regulatoryDuty:0,federalExciseDuty:0,vat:0,incomeTaxWithholding:0,carrierFee:0,platformFee:0};
  const lines: AtlasDutyLine[] = [];
  for (const [productId,quantity] of [...aggregated.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    const product = await products.findPublicById(productId);
    if (!product) throw Object.assign(new Error('Product '+productId+' was not found.'), {status:404,code:'PRODUCT_NOT_FOUND'});
    const rule = tariffRules.find(candidate=>candidate.hsPrefix!=='' && product.hsCode.startsWith(candidate.hsPrefix))??baseRule;
    const value = centsFromLong(product.priceCents)*quantity;
    if (!Number.isSafeInteger(value)) throw new Error('Checkout line value exceeds the safe integer range.');
    const duty = roundRateHalfUp(value,rule.dutyRateBps);
    const acd = roundRateHalfUp(value,rates.acd);
    const regulatory = roundRateHalfUp(value,rates.regulatory);
    const fed = roundRateHalfUp(value,rates.fed);
    const carrier = carrierFeeCents[destinationCountry]*quantity;
    const vatBase = value+duty+acd+regulatory+fed+(rule.vatIncludesCarrier?carrier:0);
    const vat = roundRateHalfUp(vatBase,rule.vatRateBps);
    const withholding = roundRateHalfUp(value+duty+acd+regulatory+fed+vat+carrier,rates.withholding);
    const platform = roundRateHalfUp(value,rates.platform);
    lines.push({productId,sku:product.sku,hsCode:product.hsCode,quantity,value:dollars(value),duty:dollars(duty),
      additionalCustomsDuty:dollars(acd),regulatoryDuty:dollars(regulatory),federalExciseDuty:dollars(fed),
      vat:dollars(vat),incomeTaxWithholding:dollars(withholding),carrierFee:dollars(carrier),platformFee:dollars(platform)});
    totals.subtotal+=value; totals.duty+=duty; totals.additionalCustomsDuty+=acd;
    totals.regulatoryDuty+=regulatory; totals.federalExciseDuty+=fed; totals.vat+=vat;
    totals.incomeTaxWithholding+=withholding; totals.carrierFee+=carrier; totals.platformFee+=platform;
  }
  const totalCents = Object.values(totals).reduce((sum,value)=>sum+value,0);
  if (![...Object.values(totals),totalCents].every(Number.isSafeInteger)) throw new Error('Checkout quote exceeds the safe integer range.');
  const fxRate = demo ? rates.fx : null;
  return {
    destinationCountry,currency:'USD',lines,
    subtotal:dollars(totals.subtotal),duty:dollars(totals.duty),additionalCustomsDuty:dollars(totals.additionalCustomsDuty),
    regulatoryDuty:dollars(totals.regulatoryDuty),federalExciseDuty:dollars(totals.federalExciseDuty),vat:dollars(totals.vat),
    incomeTaxWithholding:dollars(totals.incomeTaxWithholding),carrierFee:dollars(totals.carrierFee),platformFee:dollars(totals.platformFee),
    total:dollars(totalCents),totalPkr:fxRate===null?null:Number((totalCents*fxRate/100).toFixed(2)),
    usdToPkrRate:fxRate,originCountry:options.originCountry??null,destinationCity:options.destinationCity??null,
    taxProfile:options.taxProfile??'filer',demoPlaceholders:demo,
    placeholderNotice:demo
      ? 'Illustrative placeholder rates and USD/PKR conversion only. Not official Pakistan customs, FBR, carrier, platform or market foreign-exchange data.'
      : 'Seeded demo tariff data; not an official customs determination.',
    source:baseRule.source,formulaVersion:demo?'landed-cost-demo-v2':'landed-cost-v1',computedAt:new Date().toISOString()
  };
}
