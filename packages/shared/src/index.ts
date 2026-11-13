import { z } from 'zod';

export const DESTINATIONS = ['US', 'UK', 'EU', 'AE', 'PK', 'SG'] as const;
export const ROLES = ['user', 'operator', 'admin'] as const;
export const CATEGORIES = ['Audio and Studio', 'Precision Horology', 'Edge Computing', 'Optics and Gear'] as const;
export const ORDER_STATES = ['held', 'released', 'refunded', 'on_hold'] as const;
export const DESTINATION_NAMES: Record<(typeof DESTINATIONS)[number], string> = {
  US: 'United States', UK: 'United Kingdom', EU: 'European Union', AE: 'United Arab Emirates', PK: 'Pakistan', SG: 'Singapore'
};

export const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
export const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(254), password: z.string().min(8).max(128) });
export const dutySchema = z.object({
  destinationCountry: z.enum(DESTINATIONS),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1).max(50)
});
export const checkoutSchema = dutySchema;
export const holdSchema = z.object({ reason: z.string().trim().min(4).max(500) });
export const restockSchema = z.object({ quantity: z.number().int().min(1).max(10000).default(10) });
export const threatResolveSchema = z.object({ reason: z.string().trim().min(4).max(500) });
export const inventoryPatchSchema = z.object({ stock: z.number().int().min(0).max(100000).optional(), priceUsd: z.number().min(1).max(1000000).optional() }).refine(v => v.stock !== undefined || v.priceUsd !== undefined);
export const settingSchema = z.object({
  authenticityConfidenceFloor: z.number().int().min(50).max(100).optional(),
  customsSurgeBuffer: z.number().int().min(0).max(100).optional(),
  maxEscrowHoldHours: z.number().int().min(1).max(720).optional()
}).refine(v => Object.keys(v).length > 0);
export const roleSchema = z.object({ role: z.enum(ROLES) });
export const simulationSchema = z.object({ type: z.enum(['customs_hold', 'counterfeit_surge', 'auto_rebalance']) });

export type Role = (typeof ROLES)[number];
export type Destination = (typeof DESTINATIONS)[number];
export type ProductCategory = (typeof CATEGORIES)[number];
export interface PublicUser { id: string; name: string; email: string; role: Role; createdAt: string }
export interface Product {
  id: string; sku: string; batchHash: string; hsCode: string; name: string; brand: string;
  category: ProductCategory; priceUsd: number; dutyRatePct: number; stock: number; reorderThreshold: number;
  originHubId: string; authenticityScore: number; slaHours: number; imageUrl: string;
  status: 'verified' | 'low_stock' | 'audit_flag';
}
export interface DutyLine { productId: string; sku: string; hsCode: string; quantity: number; value: number; duty: number; vat: number; carrierFee: number }
export interface DutyQuote { destinationCountry: Destination; currency: 'USD'; lines: DutyLine[]; subtotal: number; duty: number; vat: number; carrierFee: number; total: number; source: 'seed-tariff-v1'; formulaVersion: 'landed-cost-v1'; computedAt: string }
export interface ProvenanceEvent { id: string; stage: string; hubId: string; occurredAt: string; hash: string }
export interface VerifyResult { query: string; product: Product; authenticityScore: number; certificate: { factory: string; batchHash: string; hsCode: string; issuedAt: string }; timeline: ProvenanceEvent[]; simulated: true }
export interface ApiError { error: { code: string; message: string; requestId: string } }
