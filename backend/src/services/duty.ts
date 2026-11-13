import type { Destination, DutyQuote } from '@verifymart/shared';
import { db, dollars } from '../db.js';

type ProductRow = { id: string; sku: string; hs_code: string; price_cents: number; duty_rate_pct: number };
type TariffRow = { duty_pct: number; vat_pct: number; vat_includes_carrier: number };
const carrierFees: Record<Destination, number> = { US: 15, UK: 18, EU: 20, AE: 14, PK: 28, SG: 16 };
const roundHalfUp = (value: number): number => Math.floor(value * 100 + 0.5 + Number.EPSILON);

export function calculateDuty(destinationCountry: Destination, items: Array<{ productId: string; quantity: number }>): DutyQuote {
  const tariff = db.prepare('SELECT duty_pct, vat_pct, vat_includes_carrier FROM tariff_rules WHERE country = ?').get(destinationCountry) as TariffRow | undefined;
  if (!tariff) throw Object.assign(new Error('No seeded tariff exists for this destination.'), { status: 422, code: 'TARIFF_NOT_FOUND' });
  const getProduct = db.prepare('SELECT id, sku, hs_code, price_cents, duty_rate_pct FROM products WHERE id = ?');
  const lines = items.map(item => {
    const product = getProduct.get(item.productId) as ProductRow | undefined;
    if (!product) throw Object.assign(new Error(`Product ${item.productId} was not found.`), { status: 404, code: 'PRODUCT_NOT_FOUND' });
    const valueCents = product.price_cents * item.quantity;
    const hsRule = db.prepare('SELECT duty_pct FROM tariff_rules WHERE country = ? AND hs_prefix <> ? AND ? LIKE hs_prefix || '%' ORDER BY LENGTH(hs_prefix) DESC LIMIT 1').get(destinationCountry, '', product.hs_code) as { duty_pct:number } | undefined;
    const dutyRate = hsRule?.duty_pct ?? tariff.duty_pct;
    const dutyCents = Math.floor(valueCents * dutyRate + 0.5);
    const carrierCents = Math.floor(carrierFees[destinationCountry] * 100 * item.quantity + 0.5);
    const vatBase = valueCents + dutyCents + (tariff.vat_includes_carrier ? carrierCents : 0);
    const vatCents = Math.floor(vatBase * tariff.vat_pct + 0.5);
    return { productId: product.id, sku: product.sku, hsCode: product.hs_code, quantity: item.quantity,
      value: dollars(valueCents), duty: dollars(dutyCents), vat: dollars(vatCents), carrierFee: dollars(carrierCents),
      _value: valueCents, _duty: dutyCents, _vat: vatCents, _carrier: carrierCents };
  });
  const sum = (key: '_value' | '_duty' | '_vat' | '_carrier'): number => lines.reduce((total, line) => total + line[key], 0);
  const subtotal = sum('_value'); const duty = sum('_duty'); const vat = sum('_vat'); const carrierFee = sum('_carrier');
  const total = subtotal + duty + vat + carrierFee;
  return {
    destinationCountry, currency: 'USD',
    lines: lines.map(({ _value, _duty, _vat, _carrier, ...line }) => line),
    subtotal: dollars(subtotal), duty: dollars(duty), vat: dollars(vat), carrierFee: dollars(carrierFee), total: dollars(total),
    source: 'seed-tariff-v1', formulaVersion: 'landed-cost-v1', computedAt: new Date().toISOString()
  };
}

export function quoteToCents(quote: DutyQuote): { subtotal: number; duty: number; vat: number; carrierFee: number; total: number } {
  return { subtotal: roundHalfUp(quote.subtotal), duty: roundHalfUp(quote.duty), vat: roundHalfUp(quote.vat), carrierFee: roundHalfUp(quote.carrierFee), total: roundHalfUp(quote.total) };
}
