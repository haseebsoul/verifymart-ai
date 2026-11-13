import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const location = process.env.DATABASE_PATH ?? (process.env.VITEST ? ':memory:' : '../data/verifymart.sqlite');
const databasePath = location === ':memory:' ? location : resolve(process.cwd(), location);
if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','merchant','inventory_manager','operator','admin')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','pending')),
  merchant_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  country TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  queue_depth INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  capacity_units INTEGER NOT NULL,
  utilized_units INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'optimal' CHECK(status IN ('optimal','warning','critical'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  batch_hash TEXT NOT NULL UNIQUE,
  hs_code TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  duty_rate_pct REAL NOT NULL,
  stock INTEGER NOT NULL CHECK(stock >= 0),
  reorder_threshold INTEGER NOT NULL,
  origin_hub_id TEXT NOT NULL REFERENCES hubs(id),
  authenticity_score INTEGER NOT NULL,
  sla_hours INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL,
  merchant_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_location TEXT NOT NULL,
  destination_location TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  actor_id TEXT REFERENCES users(id),
  reason TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariff_rules (
  id TEXT PRIMARY KEY,
  hs_prefix TEXT NOT NULL,
  country TEXT NOT NULL,
  duty_pct REAL NOT NULL,
  vat_pct REAL NOT NULL,
  vat_includes_carrier INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS provenance_events (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  occurred_at TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  duty_cents INTEGER NOT NULL,
  vat_cents INTEGER NOT NULL,
  carrier_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('held','released','refunded','on_hold')),
  hold_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  PRIMARY KEY(order_id, product_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'Audit log is append-only');
END;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_ledger (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT REFERENCES users(id),
  recipient_id TEXT REFERENCES users(id),
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_product ON provenance_events(product_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_threats_open ON threats(resolved_at, severity);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
`);

export function nowIso(): string { return new Date().toISOString(); }
export function cents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
export function dollars(cents: number): number { return Math.round(cents) / 100; }
