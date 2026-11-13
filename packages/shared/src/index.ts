import { z } from 'zod';

export const DESTINATIONS = ['US', 'UK', 'EU', 'AE', 'PK', 'SG'] as const;
export const ROLES = ['user', 'merchant', 'inventory_manager', 'operator', 'admin'] as const;
export const CATEGORIES = ['Audio and Studio', 'Precision Horology', 'Edge Computing', 'Optics and Gear'] as const;
export const ORDER_STATES = ['held', 'released', 'refunded', 'on_hold'] as const;

export const DESTINATION_NAMES: Record<(typeof DESTINATIONS)[number], string> = {
  US: 'United States',
  UK: 'United Kingdom',
  EU: 'European Union',
  AE: 'United Arab Emirates',
  PK: 'Pakistan',
  SG: 'Singapore'
};

export const ROLE_LABELS: Record<(typeof ROLES)[number], { title: string; workspace: string; description: string }> = {
  user: {
    title: 'Shopper',
    workspace: 'Shopper Portal',
    description: 'Browse verified international goods with transparent landed cost & escrow protection.'
  },
  merchant: {
    title: 'Merchant',
    workspace: 'Merchant Studio',
    description: 'Manage cross-border listings, fulfillment, verification requests, and trust scores.'
  },
  inventory_manager: {
    title: 'Inventory Manager',
    workspace: 'Inventory Control',
    description: 'Monitor warehouse allocations, transfers, restock thresholds, and shipments.'
  },
  operator: {
    title: 'Operator / Auditor',
    workspace: 'Operations Command',
    description: 'Incident triage, threat mitigation, provenance reviews, and escrow state transitions.'
  },
  admin: {
    title: 'Administrator',
    workspace: 'Administration Center',
    description: 'Platform governance, merchant approvals, user management, and tariff policies.'
  }
};

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(4).max(128),
  requestedRole: z.enum(ROLES).optional()
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(4).max(128),
  role: z.enum(ROLES).default('user'),
  country: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  businessName: z.string().max(100).optional(),
  businessDescription: z.string().max(500).optional(),
  invitationCode: z.string().max(50).optional()
});

export const merchantApplicationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactEmail: z.string().email().max(254),
  country: z.string().min(2).max(60),
  description: z.string().trim().min(10).max(1000)
});

export const dutySchema = z.object({
  destinationCountry: z.enum(DESTINATIONS),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(100)
  })).min(1).max(50)
});

export const checkoutSchema = dutySchema.extend({
  shippingAddress: z.object({
    recipient: z.string().min(2).max(80).optional(),
    street: z.string().max(120).optional(),
    city: z.string().max(60).optional(),
    postalCode: z.string().max(20).optional()
  }).optional()
});

export const holdSchema = z.object({
  reason: z.string().trim().min(4).max(500)
});

export const restockSchema = z.object({
  quantity: z.number().int().min(1).max(10000).default(10),
  warehouseId: z.string().optional()
});

export const inventoryTransferSchema = z.object({
  productId: z.string().min(1),
  sourceWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  quantity: z.number().int().min(1).max(10000),
  reason: z.string().trim().min(4).max(250)
});

export const threatResolveSchema = z.object({
  reason: z.string().trim().min(4).max(500)
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(10).max(2000).optional(),
  hsCode: z.string().regex(/^\d{4}\.\d{2}(\.\d{2})?$/),
  priceUsd: z.number().int().min(100).max(100000000), // in integer cents
  stock: z.number().int().min(0).max(50000),
  reorderThreshold: z.number().int().min(1).max(1000).default(10),
  originHubId: z.string().default('dubai-hub'),
  imageUrl: z.string().url().or(z.string().regex(/^\/product-.*\.svg$/)).optional()
});

export const inventoryPatchSchema = z.object({
  stock: z.number().int().min(0).max(100000).optional(),
  priceUsd: z.number().int().min(100).max(100000000).optional()
}).refine((v: { stock?: number | undefined; priceUsd?: number | undefined }) => v.stock !== undefined || v.priceUsd !== undefined);

export const settingSchema = z.object({
  authenticityConfidenceFloor: z.number().int().min(50).max(100).optional(),
  customsSurgeBuffer: z.number().int().min(0).max(100).optional(),
  maxEscrowHoldHours: z.number().int().min(1).max(720).optional()
}).refine((v: Record<string, unknown>) => Object.keys(v).length > 0);

export const roleSchema = z.object({
  role: z.enum(ROLES)
});

export const simulationSchema = z.object({
  type: z.enum(['customs_hold', 'counterfeit_surge', 'auto_rebalance'])
});

export type Role = (typeof ROLES)[number];
export type Destination = (typeof DESTINATIONS)[number];
export type ProductCategory = (typeof CATEGORIES)[number];
export type OrderState = (typeof ORDER_STATES)[number];

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  status?: 'active' | 'suspended' | 'pending';
  merchantId?: string;
}

export interface Product {
  id: string;
  sku: string;
  batchHash: string;
  hsCode: string;
  name: string;
  brand: string;
  category: ProductCategory;
  priceUsd: number; // in cents or dollars based on context (standardized in API)
  dutyRatePct: number;
  stock: number;
  reorderThreshold: number;
  originHubId: string;
  authenticityScore: number;
  slaHours: number;
  imageUrl: string;
  status: 'verified' | 'low_stock' | 'audit_flag';
  merchantId?: string;
  description?: string;
}

export interface Warehouse {
  id: string;
  hubId: string;
  name: string;
  city: string;
  country: string;
  capacityUnits: number;
  utilizedUnits: number;
  status: 'optimal' | 'warning' | 'critical';
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  source: string;
  destination: string;
  quantity: number;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface DutyLine {
  productId: string;
  sku: string;
  hsCode: string;
  quantity: number;
  value: number;
  duty: number;
  vat: number;
  carrierFee: number;
}

export interface DutyQuote {
  destinationCountry: Destination;
  currency: 'USD';
  lines: DutyLine[];
  subtotal: number;
  duty: number;
  vat: number;
  carrierFee: number;
  total: number;
  source: 'seed-tariff-v1';
  formulaVersion: 'landed-cost-v1';
  computedAt: string;
}

export interface ProvenanceEvent {
  id: string;
  stage: string;
  hubId: string;
  occurredAt: string;
  hash: string;
}

export interface VerifyResult {
  query: string;
  product: Product;
  authenticityScore: number;
  certificate: {
    factory: string;
    batchHash: string;
    hsCode: string;
    issuedAt: string;
  };
  timeline: ProvenanceEvent[];
  simulated: true;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  destinationCountry: Destination;
  subtotal: number;
  duty: number;
  vat: number;
  carrierFee: number;
  total: number;
  state: OrderState;
  holdReason?: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
