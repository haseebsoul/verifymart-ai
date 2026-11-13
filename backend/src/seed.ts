import 'dotenv/config';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, nowIso } from './db.js';

const hubs = [
  ['HUB-NYC', 'New York', 0.18, 0.31, 42, 'online', 8],
  ['HUB-ZRH', 'Zurich', 0.42, 0.24, 34, 'online', 12],
  ['HUB-DXB', 'Dubai', 0.61, 0.46, 51, 'online', 19],
  ['HUB-SIN', 'Singapore', 0.82, 0.67, 39, 'online', 7],
  ['HUB-KHI', 'Karachi', 0.69, 0.72, 146, 'warning', 31]
] as const;

const catalog = [
  ['AUD-001','Studio Monitor Headphones','Auralis','Audio and Studio','8518.30.20',349,5,42,94,'HUB-ZRH'],
  ['AUD-002','Reference Studio DAC','Auralis','Audio and Studio','8518.40.20',429,5,8,98,'HUB-ZRH'],
  ['AUD-003','Wireless Master Headphones','Northstar Audio','Audio and Studio','8518.30.20',279,5,26,96,'HUB-NYC'],
  ['AUD-004','Ribbon Microphone','Sonora Labs','Audio and Studio','8518.10.00',549,4,4,91,'HUB-ZRH'],
  ['AUD-005','Portable Field Recorder','Sonora Labs','Audio and Studio','8519.81.00',319,4,17,97,'HUB-SIN'],
  ['AUD-006','Reference Monitor Pair','Auralis','Audio and Studio','8518.22.00',899,5,11,99,'HUB-ZRH'],
  ['HOR-004','Automatic Dress Watch','Meridian','Precision Horology','9102.11.00',1280,4,9,99,'HUB-ZRH'],
  ['HOR-005','GMT Explorer Watch','Meridian','Precision Horology','9102.21.00',1890,4,3,98,'HUB-ZRH'],
  ['HOR-006','Mechanical Field Watch','Atelier Nine','Precision Horology','9102.21.00',760,4,14,96,'HUB-NYC'],
  ['HOR-007','Moonphase Calendar','Atelier Nine','Precision Horology','9102.21.00',2350,4,5,99,'HUB-ZRH'],
  ['HOR-008','Automatic Diver 300','Meridian','Precision Horology','9102.21.00',1490,4,18,97,'HUB-DXB'],
  ['HOR-009','Skeleton Edition Watch','Atelier Nine','Precision Horology','9102.21.00',3180,4,2,99,'HUB-ZRH'],
  ['EDG-009','Edge Inference Module','Nexora','Edge Computing','8471.50.00',612,0,25,98,'HUB-SIN'],
  ['EDG-010','Compact AI Accelerator','Nexora','Edge Computing','8471.50.00',845,0,7,97,'HUB-SIN'],
  ['EDG-011','Industrial Vision Gateway','Vector Forge','Edge Computing','8517.62.00',1290,2,15,96,'HUB-DXB'],
  ['EDG-012','Secure Compute Node','Vector Forge','Edge Computing','8471.50.00',1740,0,6,99,'HUB-NYC'],
  ['EDG-013','Low-Power NPU Board','Nexora','Edge Computing','8471.50.00',389,0,31,95,'HUB-SIN'],
  ['EDG-014','Industrial Edge Server','Vector Forge','Edge Computing','8471.50.00',2490,0,3,98,'HUB-DXB'],
  ['OPT-013','Mirrorless Prime Lens','Lumina Optics','Optics and Gear','9002.11.00',890,3,13,99,'HUB-ZRH'],
  ['OPT-014','Wide-Angle Cinema Lens','Lumina Optics','Optics and Gear','9002.11.00',1450,3,5,98,'HUB-ZRH'],
  ['OPT-015','Thermal Imaging Scope','Aster Instruments','Optics and Gear','9005.80.00',780,3,12,94,'HUB-DXB'],
  ['OPT-016','Precision Rangefinder','Aster Instruments','Optics and Gear','9015.10.00',520,2,4,96,'HUB-KHI'],
  ['OPT-017','Low-Light Monocular','Aster Instruments','Optics and Gear','9005.80.00',640,3,19,97,'HUB-SIN'],
  ['OPT-018','Anamorphic Cine Lens','Lumina Optics','Optics and Gear','9002.11.00',2190,3,2,99,'HUB-ZRH']
] as const;

const tariffs: Record<string, { duty: number; vat: number }> = {
  US: { duty: 0.04, vat: 0.08 }, UK: { duty: 0.045, vat: 0.20 }, EU: { duty: 0.05, vat: 0.19 },
  AE: { duty: 0.05, vat: 0.05 }, PK: { duty: 0.10, vat: 0.18 }, SG: { duty: 0.03, vat: 0.09 }
};

export async function seedDatabase(): Promise<void> {
  const count = Number((db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count);
  const insertHub = db.prepare('INSERT OR IGNORE INTO hubs (id,name,x,y,latency_ms,status,queue_depth) VALUES (?,?,?,?,?,?,?)');
  for (const hub of hubs) insertHub.run(...hub);

  if (count === 0) {
    const insertProduct = db.prepare(`INSERT INTO products
      (id,sku,batch_hash,hs_code,name,brand,category,price_cents,duty_rate_pct,stock,reorder_threshold,origin_hub_id,authenticity_score,sla_hours,image_url,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertEvent = db.prepare('INSERT INTO provenance_events (id,product_id,stage,hub_id,occurred_at,hash) VALUES (?,?,?,?,?,?)');
    const stages = ['Factory signed', 'Vault received', 'Customs pre-cleared', 'Dispatched'];
    const baseTime = Date.now();
    catalog.forEach((p, index) => {
      const [sku,name,brand,category,hsCode,price,duty,stock,score,hub] = p;
      const batchHash = createHash('sha256').update(JSON.stringify({ sku, name, brand, hsCode, price })).digest('hex');
      const id = `p_${sku.toLowerCase().replace('-', '_')}`;
      const imageUrl = `https://images.unsplash.com/photo-${[
        '1505740420928-5e560c06d30e','1524592094714-0f0654e20314','1518441902117-f0a3a4a9d4d8','1516035069371-29a1b244cc32',
        '1498050108023-c5249f4df085','1523275335684-37898b6baf30','1511379938547-c1f69419868d','1516575150278-77136aed6920'
      ][index % 8]}?auto=format&fit=crop&w=900&q=80`;
      const status = stock <= 5 ? 'low_stock' : score < 93 ? 'audit_flag' : 'verified';
      insertProduct.run(id, sku, batchHash, hsCode, name, brand, category, price * 100, duty, stock, 5, hub, score, 24 + (index % 48), imageUrl, status);
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
        // The seeded country base and HS-specific product class are combined for a demonstrative rate.
        addTariff.run(`tariff_${country.toLowerCase()}_${prefix.replaceAll('.', '')}`, prefix, country,
          Math.min(0.45, rates.duty + productRate), rates.vat);
      }
    }
    const addThreat = db.prepare('INSERT INTO threats (id,type,severity,product_id,detected_at) VALUES (?,?,?,?,?)');
    const lowStock = db.prepare("SELECT id FROM products WHERE status = 'low_stock' LIMIT 2").all() as Array<{id:string}>;
    const auditFlag = db.prepare("SELECT id FROM products WHERE status = 'audit_flag' LIMIT 1").get() as {id:string} | undefined;
    lowStock.forEach((p, i) => addThreat.run(`threat_stock_${i+1}`, 'Low stock', 'WARN', p.id, nowIso()));
    if (auditFlag) addThreat.run('threat_auth_1', 'Counterfeit signal', 'CRITICAL', auditFlag.id, nowIso());
  }

  const demoPassword = process.env.DEMO_PASSWORD ?? 'VerifyMart-Demo-2026';
  if (process.env.NODE_ENV !== 'production') {
    const insertUser = db.prepare('INSERT OR IGNORE INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)');
    const hash = await bcrypt.hash(demoPassword, 12);
    insertUser.run('user_admin', 'Haseeb Khan', 'admin@verifymart.ai', hash, 'admin', nowIso());
    insertUser.run('user_operator', 'Elena Rostova', 'auditor@verifymart.ai', hash, 'operator', nowIso());
    insertUser.run('user_shopper', 'Alex Mercer', 'shopper@verifymart.ai', hash, 'user', nowIso());
  }
  const defaults: Record<string, number> = { authenticityConfidenceFloor: 92, customsSurgeBuffer: 15, maxEscrowHoldHours: 72 };
  const putSetting = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  Object.entries(defaults).forEach(([key, value]) => putSetting.run(key, String(value)));
  const ledgerCount = Number((db.prepare('SELECT COUNT(*) AS count FROM trust_ledger').get() as {count:number}).count);
  if (ledgerCount === 0) {
    const add = db.prepare('INSERT INTO trust_ledger (id,merchant_id,delta,reason,at) VALUES (?,?,?,?,?)');
    [['trust_1',80,'On-time fulfillment'],['trust_2',120,'Verified provenance'],['trust_3',65,'Low dispute rate'],['trust_4',100,'Consistent SLA']]
      .forEach(([id,delta,reason], i) => add.run(id, 'merchant_demo', delta, reason, new Date(Date.now() - (4-i)*86400000).toISOString()));
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed script is disabled in production.');
  await seedDatabase();
  console.log('VerifyMart seed completed. Demo accounts use DEMO_PASSWORD.');
  db.close();
}
