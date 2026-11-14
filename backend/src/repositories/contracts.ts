import type { ClientSession, Document, Long } from 'mongodb';

export type Role = 'shopper' | 'merchant' | 'inventory_manager' | 'operator' | 'admin';
export type OrderState = 'held' | 'released' | 'refunded' | 'on_hold';
export type MerchantState = 'pending' | 'approved' | 'rejected';

export interface UserDocument extends Document {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  failedLogins: number;
  lockedUntil: Date | null;
  lastLogin: Date | null;
  createdAt: Date;
  refreshSessions: Array<{ tokenHash: string; expiresAt: Date; createdAt: Date }>;
}

export interface MerchantDocument extends Document {
  _id: string;
  userId: string;
  businessName: string;
  country: string;
  status: MerchantState;
  rejectionReason?: string;
  trustScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProvenanceDocument extends Document {
  id: string;
  stage: string;
  hubId: string;
  occurredAt: Date;
  hash: string;
}

export interface ProductDocument extends Document {
  _id: string;
  sku: string;
  batchHash: string;
  hsCode: string;
  name: string;
  brand: string;
  category: string;
  priceCents: Long;
  stock: number;
  reorderThreshold: number;
  originHubId: string;
  authenticityScore: number;
  slaHours: number;
  imageUrl: string;
  status: 'verified' | 'low_stock' | 'audit_flag' | 'draft' | 'archived';
  merchantId: string | null;
  managedBy: 'merchant' | 'platform';
  provenanceEvents: ProvenanceDocument[];
  createdAt?: Date;
  updatedAt?: Date;
  migratedFrom?: 'sqlite-v1';
}

export interface HubDocument extends Document {
  _id: string;
  code: string;
  name: string;
  x: number;
  y: number;
  latencyMs: number;
  status: string;
  queueDepth: number;
}

export interface TariffRuleDocument extends Document {
  _id: string;
  hsPrefix: string;
  country: 'US' | 'UK' | 'EU' | 'AE' | 'PK' | 'SG';
  dutyRateBps: number;
  vatRateBps: number;
  vatIncludesCarrier: boolean;
  source: 'seed-tariff-v1';
}

export interface OrderItemDocument extends Document {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: Long;
}

export interface OrderDocument extends Document {
  _id: string;
  idempotencyKey: string;
  requestHash: string;
  userId: string | null;
  destination: string;
  items: OrderItemDocument[];
  quote: {
    subtotalCents: Long;
    dutyCents: Long;
    vatCents: Long;
    carrierFeeCents: Long;
    totalCents: Long;
    source: 'seed-tariff-v1';
    formulaVersion: 'landed-cost-v1';
  };
  escrow: { state: OrderState; receiptId: string; holdReason: string | null };
  state: OrderState;
  createdAt: Date;
  updatedAt: Date;
  migratedFrom?: 'sqlite-v1';
}

export interface ThreatDocument extends Document {
  _id: string;
  type: string;
  severity: 'CRITICAL' | 'WARN' | 'INFO';
  productId: string;
  detectedAt: Date;
  resolvedAt: Date | null;
}

export interface InventoryAdjustmentDocument extends Document {
  _id: string;
  productId: string;
  actorId: string;
  actorRole: Role;
  delta: number;
  reason: string;
  at: Date;
  migratedFrom?: 'sqlite-v1';
}

export interface AuditLogDocument extends Document {
  _id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  at: Date;
  migratedFrom?: 'sqlite-v1';
}

export interface SettingDocument extends Document {
  _id: string;
  key: string;
  value: number | string | boolean;
  updatedAt: Date;
}

export interface TrustLedgerDocument extends Document {
  _id: string;
  merchantId: string;
  delta: number;
  reason: string;
  at: Date;
}

export interface RepositoryContext {
  session?: ClientSession;
}
