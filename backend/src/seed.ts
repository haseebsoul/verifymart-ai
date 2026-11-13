import 'dotenv/config';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, nowIso } from './db.js';

const hubs = [
  ['HUB-NYC', 'New York Hub', 0.18, 0.31, 42, 'online', 8],
  ['HUB-ZRH', 'Zurich Vault', 0.42, 0.24, 34, 'online', 12],
  ['HUB-DXB', 'Dubai Terminal', 0.61, 0.46, 51, 'online', 19],
  ['HUB-SIN', 'Singapore Gateway', 0.82, 0.67, 39, 'online', 7],
  ['HUB-KHI', 'Karachi Airlink', 0.69, 0.72, 146, 'warning', 31]
] as const;

const warehouses = [
  ['WH-NYC-01', 'HUB-NYC', 'Atlantic Gateway Vault', 'New York', 'US', 25000, 18400, 'optimal'],
  ['WH-ZRH-01', 'HUB-ZRH', 'Alpine Custody Depot', 'Zurich', 'CH', 15000, 9200, 'optimal'],
  ['WH-DXB-01', 'HUB-DXB', 'Emirates Freezone Hub', 'Dubai', 'AE', 35000, 29800, 'warning'],
  ['WH-SIN-01', 'HUB-SIN', 'Straits Distribution Center', 'Singapore', 'SG', 20000, 14100, 'optimal'],
  ['WH-KHI-01', 'HUB-KHI', 'Karachi Bonded Terminal', 'Karachi', 'PK', 12000, 10800, 'warning']
] as const;

const catalog = [
  ['AUD-001','Studio Monitor Headphones','Auralis','Audio and Studio','8518.30.20',349,5,42,94,'HUB-ZRH','merchant_nordic'],
  ['AUD-002','Reference Studio DAC','Auralis','Audio and Studio','8518.40.20',429,5,8,98,'HUB-ZRH','merchant_nordic'],
  ['AUD-003','Wireless Master Headphones','Northstar Audio','Audio and Studio','8518.30.20',279,5,26,96,'HUB-NYC','merchant_nordic'],
  ['AUD-004','Ribbon Microphone','Sonora Labs','Audio and Studio','8518.10.00',549,4,4,91,'HUB-ZRH','merchant_nordic'],
  ['AUD-005','Portable Field Recorder','Sonora Labs','Audio and Studio','8519.81.00',319,4,17,97,'HUB-SIN','merchant_pacific'],
  ['AUD-006','Reference Monitor Pair','Auralis','Audio and Studio','8518.22.00',899,5,11,99,'HUB-ZRH','merchant_nordic'],
  ['HOR-004','Automatic Dress Watch','Meridian','Precision Horology','9102.11.00',1280,4,9,99,'HUB-ZRH','merchant_swiss'],
  ['HOR-005','GMT Explorer Watch','Meridian','Precision Horology','9102.21.00',1890,4,3,98,'HUB-ZRH','merchant_swiss'],
  ['HOR-006','Mechanical Field Watch','Atelier Nine','Precision Horology','9102.21.00',760,4,14,96,'HUB-NYC','merchant_swiss'],
  ['HOR-007','Moonphase Calendar','Atelier Nine','Precision Horology','9102.21.00',2350,4,5,99,'HUB-ZRH','merchant_swiss'],
  ['HOR-008','Automatic Diver 300','Meridian','Precision Horology','9102.21.00',1490,4,18,97,'HUB-DXB','merchant_swiss'],
  ['HOR-009','Skeleton Edition Watch','Atelier Nine','Precision Horology','9102.21.00',3180,4,2,99,'HUB-ZRH','merchant_swiss'],
  ['EDG-009','Edge Inference Module','Nexora','Edge Computing','8471.50.00',612,0,25,98,'HUB-SIN','merchant_pacific'],
  ['EDG-010','Compact AI Accelerator','Nexora','Edge Computing','8471.50.00',845,0,7,97,'HUB-SIN','merchant_pacific'],
  ['EDG-011','Industrial Vision Gateway','Vector Forge','Edge Computing','8517.62.00',1290,2,15,96,'HUB-DXB','merchant_pacific'],
  ['EDG-012','Secure Compute Node','Vector Forge','Edge Computing','8471.50.00',1740,0,6,99,'HUB-NYC','merchant_pacific'],
  ['EDG-013','Low-Power NPU Board','Nexora','Edge Computing','8471.50.00',389,0,31,95,'HUB-SIN','merchant_pacific'],
  ['EDG-014','Industrial Edge Server','Vector Forge','Edge Computing','8471.50.00',2490,0,3,98,'HUB-DXB','merchant_pacific'],
  ['OPT-013','Mirrorless Prime Lens','Lumina Optics','Optics and Gear','9002.11.00',890,3,13,99,'HUB-ZRH','merchant_optic'],
  ['OPT-014','Wide-Angle Cinema Lens','Lumina Optics','Optics and Gear','9002.11.00',1450,3,5,98,'HUB-ZRH','merchant_optic'],
  ['OPT-015','Thermal Imaging Scope','Aster Instruments','Optics and Gear','9005.80.00',780,3,12,94,'HUB-DXB','merchant_optic'],
  ['OPT-016','Precision Rangefinder','Aster Instruments','Optics and Gear','9015.10.00',520,2,4,96,'HUB-KHI','merchant_optic'],
  ['OPT-017','Low-Light Monocular','Aster Instruments','Optics and Gear','9005.80.00',640,3,19,97,'HUB-SIN','merchant_optic'],
  ['OPT-018','Anamorphic Cine Lens','Lumina Optics','Optics and Gear','9002.11.00',2190,3,2,99,'HUB-ZRH','merchant_optic']
] as const;

const tariffs: Record<string, { duty: number; vat: number }> = {
  US: { duty: 0.04, vat: 0.08 },
  UK: { duty: 0.045, vat: 0.20 },
  EU: { duty: 0.05, vat: 0.19 },
  AE: { duty: 0.05, vat: 0.05 },
  PK: { duty: 0.10, vat: 0.18 },
  SG: { duty: 0.03, vat: 0.09 }
};

export async function seedDatabase(): Promise<void> {
  const insertHub = db.prepare('INSERT OR IGNORE INTO hubs (id,name,x,y,latency_ms,status,queue_depth) VALUES (?,?,?,?,?,?,?)');
  for (const hub of hubs) insertHub.run(...hub);

  const insertWarehouse = db.prepare('INSERT OR IGNORE INTO warehouses (id,hub_id,name,city,country,capacity_units,utilized_units,status) VALUES (?,?,?,?,?,?,?,?)');
  for (const wh of warehouses) insertWarehouse.run(...wh);

  const count = Number((db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count);

  if (count === 0) {
    const insertProduct = db.prepare(`INSERT INTO products
      (id,sku,batch_hash,hs_code,name,brand,category,price_cents,duty_rate_pct,stock,reorder_threshold,origin_hub_id,authenticity_score,sla_hours,image_url,status,merchant_id,description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertEvent = db.prepare('INSERT INTO provenance_events (id,product_id,stage,hub_id,occurred_at,hash) VALUES (?,?,?,?,?,?)');
    const stages = ['Factory signed', 'Vault received', 'Customs pre-cleared', 'Dispatched'];
    const baseTime = Date.now();

    catalog.forEach((p, index) => {
      const [sku,name,brand,category,hsCode,price,duty,stock,score,hub,merchantId] = p;
      const batchHash = createHash('sha256').update(JSON.stringify({ sku, name, brand, hsCode, price })).digest('hex');
      const id = `p_${sku.toLowerCase().replace('-', '_')}`;
      const imageUrl = `https://images.unsplash.com/photo-${[
        '1505740420928-5e560c06d30e','1524592094714-0f0654e20314','1518441902117-f0a3a4a9d4d8','1516035069371-29a1b244cc32',
        '1498050108023-c5249f4df085','1523275335684-37898b6baf30','1511379938547-c1f69419868d','1516575150278-77136aed6920'
      ][index % 8]}?auto=format&fit=crop&w=900&q=80`;
      const status = stock <= 5 ? 'low_stock' : score < 93 ? 'audit_flag' : 'verified';
      const description = `Authentic ${brand} ${name} certified for cross-border transit via VerifyMart bonded escrow vaults.`;
      insertProduct.run(id, sku, batchHash, hsCode, name, brand, category, price * 100, duty, stock, 5, hub, score, 24 + (index % 48), imageUrl, status, merchantId, description);

      stages.forEach((stage, step) => {
        const at = new Date(baseTime - (4 - step) * 86_400_000 - index * 60000).toISOString();
        const eventHash = createHash('sha256').update(`${batchHash}:${stage}:${hub}:${at}`).digest('hex');
        insertEvent.run(`evt_${sku.toLowerCase()}_${step + 1}`, id, stage, step === 0 ? hub : ['HUB-ZRH','HUB-DXB','HUB-KHI','HUB-SIN'][step], at, eventHash);
      });
    });

    const addTariff = db.prepare('INSERT INTO tariff_rules (id,hs_prefix,country,duty_pct,vat_pct,vat_includes_carrier) VALUES (?,?,?,?,?,1)');
    for (const [country, rates] of Object.entries(tariffs)) {
      addTariff.run(`tariff_${country.toLowerCase()}`, '', country, rates.duty, rates.vat);
      const hsRates = new Map<string, number>();
      for (const item of catalog) {
        const prefix = item[4].slice(0, 7);
        hsRates.set(prefix, Math.max(hsRates.get(prefix) ?? 0, item[6] / 100));
      }
      for (const [prefix, productRate] of hsRates) {
        addTariff.run(`tariff_${country.toLowerCase()}_${prefix.replaceAll('.', '')}`, prefix, country,
          Math.min(0.45, rates.duty + productRate), rates.vat);
      }
    }

    const addThreat = db.prepare('INSERT INTO threats (id,type,severity,product_id,detected_at) VALUES (?,?,?,?,?)');
    const lowStock = db.prepare("SELECT id FROM products WHERE status = 'low_stock' LIMIT 2").all() as Array<{id:string}>;
    const auditFlag = db.prepare("SELECT id FROM products WHERE status = 'audit_flag' LIMIT 1").get() as {id:string} | undefined;
    lowStock.forEach((p, i) => addThreat.run(`threat_stock_${i+1}`, 'Low stock', 'WARN', p.id, nowIso()));
    if (auditFlag) addThreat.run('threat_auth_1', 'Counterfeit signal', 'CRITICAL', auditFlag.id, nowIso());

    // Initial movement log
    const addMovement = db.prepare('INSERT INTO inventory_movements (id,product_id,source_location,destination_location,quantity,actor_id,reason,timestamp) VALUES (?,?,?,?,?,?,?,?)');
    addMovement.run('mov_init_1', 'p_aud_001', 'Factory ZRH', 'WH-ZRH-01', 50, 'user_admin', 'Initial stock ingestion', nowIso());
    addMovement.run('mov_init_2', 'p_hor_004', 'Geneva Vault', 'WH-ZRH-01', 12, 'user_admin', 'Pre-allocated VIP horology batch', nowIso());
  }

  // Seed 5 stakeholders
  const insertUser = db.prepare('INSERT OR REPLACE INTO users (id,name,email,password_hash,role,created_at,status) VALUES (?,?,?,?,?,?,?)');
  const demoHash = await bcrypt.hash('1234', 12);
  const now = nowIso();

  // 1. Shopper
  insertUser.run('user_shopper', 'Tariq Al-Mansoor', 'buyer@verifymart.ai', demoHash, 'user', now, 'active');
  // 2. Merchant
  insertUser.run('user_merchant', 'Auralis Audio Nordic', 'merchant@verifymart.ai', demoHash, 'merchant', now, 'active');
  // 3. Inventory Manager
  insertUser.run('user_inventory', 'Marcus Vance', 'inventory@verifymart.ai', demoHash, 'inventory_manager', now, 'active');
  // 4. Operator / Auditor
  insertUser.run('user_operator', 'Elena Rostova', 'auditor@verifymart.ai', demoHash, 'operator', now, 'active');
  // 5. Administrator
  insertUser.run('user_admin', 'Haseeb Khan', 'admin@verifymart.ai', demoHash, 'admin', now, 'active');

  // Seed Merchant Applications
  const insertApp = db.prepare('INSERT OR IGNORE INTO merchant_applications (id,user_id,business_name,contact_email,country,description,status,created_at) VALUES (?,?,?,?,?,?,?,?)');
  insertApp.run('app_001', 'user_merchant', 'Auralis Sound Lab', 'merchant@verifymart.ai', 'Switzerland', 'Manufacturer of precision balanced-armature studio monitoring hardware.', 'approved', now);
  insertApp.run('app_002', null, 'Titan Precision Tools', 'contact@titantools.de', 'Germany', 'Industrial measurement rangefinders and optical calibrators.', 'pending', now);

  // Seed Notifications
  const insertNotification = db.prepare('INSERT OR IGNORE INTO notifications (id,user_id,title,message,category,is_read,created_at) VALUES (?,?,?,?,?,?,?)');
  insertNotification.run('notif_1', 'user_admin', 'Platform Security Baseline V14 Active', 'All 5 RBAC roles and SQLite WAL integrity checks verified.', 'security', 0, now);
  insertNotification.run('notif_2', 'user_operator', 'Customs Clearance Anomaly Flagged', 'Shipment #REC-9821 held at Zurich Vault awaiting HS compliance review.', 'operations', 0, now);
  insertNotification.run('notif_3', 'user_merchant', 'Batch HOR-004 Authenticity Verified', 'Your Swiss Horology batch has achieved 99/100 authenticity score.', 'escrow', 0, now);
  insertNotification.run('notif_4', 'user_inventory', 'Reorder Threshold Alert', 'Product AUD-004 Ribbon Microphone is below 5 units at WH-ZRH-01.', 'inventory', 0, now);
  insertNotification.run('notif_5', 'user_shopper', 'Landed-Cost Guarantee Confirmed', 'Order #REC-5510 customs fees pre-cleared for UK transit.', 'order', 0, now);

  // Seed Trust Ledger
  const insertLedger = db.prepare('INSERT OR IGNORE INTO trust_ledger (id,merchant_id,delta,reason,at) VALUES (?,?,?,?,?)');
  insertLedger.run('ledger_1', 'user_merchant', 94, 'Zero-counterfeit 60-day shipment audit passed', now);
  insertLedger.run('ledger_2', 'user_merchant', 5, 'On-time factory certificate submission', now);
}
