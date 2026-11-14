import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { buildCollections, toJsonObject } from '../src/migrations/sqlite-to-atlas.js';

let source: Database.Database | undefined;
afterEach(() => {
  source?.close();
  source = undefined;
});

function fixture(): Database.Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,role TEXT,failed_logins INTEGER,locked_until TEXT,last_login TEXT,created_at TEXT);
    CREATE TABLE sessions(user_id TEXT,token_hash TEXT,expires_at TEXT,created_at TEXT);
    CREATE TABLE hubs(id TEXT PRIMARY KEY,name TEXT,x REAL,y REAL,latency_ms INTEGER,status TEXT,queue_depth INTEGER);
    CREATE TABLE products(id TEXT PRIMARY KEY,sku TEXT,batch_hash TEXT,hs_code TEXT,name TEXT,brand TEXT,category TEXT,price_cents INTEGER,duty_rate_pct REAL,stock INTEGER,reorder_threshold INTEGER,origin_hub_id TEXT,authenticity_score INTEGER,sla_hours INTEGER,image_url TEXT,status TEXT);
    CREATE TABLE provenance_events(id TEXT,product_id TEXT,stage TEXT,hub_id TEXT,occurred_at TEXT,hash TEXT);
    CREATE TABLE tariff_rules(id TEXT,hs_prefix TEXT,country TEXT,duty_pct REAL,vat_pct REAL,vat_includes_carrier INTEGER);
    CREATE TABLE orders(id TEXT,receipt_id TEXT,user_id TEXT,destination TEXT,subtotal_cents INTEGER,duty_cents INTEGER,vat_cents INTEGER,carrier_fee_cents INTEGER,total_cents INTEGER,state TEXT,hold_reason TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE order_items(order_id TEXT,product_id TEXT,quantity INTEGER,unit_price_cents INTEGER);
    CREATE TABLE idempotency_keys(key TEXT,user_id TEXT,request_hash TEXT,response_json TEXT,created_at TEXT);
    CREATE TABLE threats(id TEXT,type TEXT,severity TEXT,product_id TEXT,detected_at TEXT,resolved_at TEXT);
    CREATE TABLE inventory_adjustments(id TEXT,product_id TEXT,actor_id TEXT,actor_role TEXT,delta INTEGER,reason TEXT,at TEXT);
    CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,details_json TEXT,at TEXT);
    CREATE TABLE settings(key TEXT,value TEXT);
    CREATE TABLE trust_ledger(id TEXT,merchant_id TEXT,delta INTEGER,reason TEXT,at TEXT);
  `);
  const now = '2026-01-01T00:00:00.000Z';
  database.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)').run('u1','Shopper','shopper@example.test','bcrypt-hash','user',0,null,null,now);
  database.prepare('INSERT INTO hubs VALUES (?,?,?,?,?,?,?)').run('HUB-KHI','Karachi',0.7,0.7,30,'online',0);
  database.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('p1','SKU-1','batch-hash','8518.30','Headphones','Brand','Audio and Studio',12345,5,8,2,'HUB-KHI',98,48,'','verified');
  database.prepare('INSERT INTO tariff_rules VALUES (?,?,?,?,?,?)').run('t1','','PK',0.1,0.18,1);
  database.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('o1','receipt-1','u1','PK',12345,1000,2000,300,15645,'held',null,now,now);
  database.prepare('INSERT INTO order_items VALUES (?,?,?,?)').run('o1','p1',1,12345);
  database.prepare('INSERT INTO idempotency_keys VALUES (?,?,?,?,?)')
    .run('key-12345678','u1','request-hash',JSON.stringify({orderId:'o1'}),now);
  database.prepare('INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)')
    .run('a1','u1','ORDER_CREATED','order','o1',JSON.stringify({note:'fixture'}),now);
  database.prepare('INSERT INTO settings VALUES (?,?)').run('threshold','92');
  return database;
}

describe('SQLite to Atlas migration planning', () => {
  it('preserves IDs, converts money to BSON Long, and marks migrated documents', () => {
    source = fixture();
    const plan = buildCollections(source);
    const byName = new Map(plan.map(collection => [collection.name, collection.documents]));
    const user = byName.get('users')?.[0];
    const order = byName.get('orders')?.[0] as { _id: string; userId: string; quote: { totalCents: { toString(): string } }; migratedFrom: string };
    expect(user?._id).toBe('u1');
    expect(user?.role).toBe('shopper');
    expect(user?.migratedFrom).toBe('sqlite-v1');
    expect(order._id).toBe('o1');
    expect(order.userId).toBe('u1');
    expect(order.quote.totalCents.toString()).toBe('15645');
    expect(order.migratedFrom).toBe('sqlite-v1');
    expect(byName.get('merchants')).toEqual([]);
    expect(byName.get('auditLog')?.[0]?.migratedFrom).toBe('sqlite-v1');
  });

  it('aborts rather than replacing malformed source JSON with an empty object', () => {
    expect(() => toJsonObject('{bad json', 'audit record a2')).toThrow(/migration aborted to avoid discarding data/i);
  });

  it('rejects valid JSON values that are not objects', () => {
    expect(() => toJsonObject('[]', 'audit record a3')).toThrow(/migration aborted to avoid discarding data/i);
  });

  it('keeps a genuinely empty optional JSON field empty', () => {
    expect(toJsonObject(null, 'legacy null details')).toEqual({});
  });
});
