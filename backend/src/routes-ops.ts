import { Router } from 'express';
import { z } from 'zod';
import { DESTINATIONS, roleSchema, restockSchema, inventoryPatchSchema, settingSchema, simulationSchema, threatResolveSchema } from '@verifymart/shared';
import { db, dollars, audit, cryptoId, nowIso } from './db.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { asyncHandler, parseBody } from './middleware/http.js';
import { publishEvent } from './telemetry.js';

export const opsRouter = Router();
const operator = [authenticate, requireRole('operator','admin')];
const admin = [authenticate, requireRole('admin')];
opsRouter.get('/metrics', ...operator, (_req,res) => {
  const orderStats = db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(total_cents),0) AS total FROM orders WHERE state IN ('held','released','on_hold')").get() as {count:number;total:number};
  const verified = Number((db.prepare("SELECT COUNT(*) AS count FROM products WHERE status='verified'").get() as {count:number}).count);
  const totalProducts = Number((db.prepare('SELECT COUNT(*) AS count FROM products').get() as {count:number}).count);
  const hubs = db.prepare('SELECT id,name,x,y,latency_ms AS latencyMs,status,queue_depth AS queueDepth FROM hubs ORDER BY name').all();
  const allocation = db.prepare(`SELECT h.id AS hubId,h.name,COUNT(oi.order_id) AS orders FROM hubs h LEFT JOIN products p ON p.origin_hub_id=h.id LEFT JOIN order_items oi ON oi.product_id=p.id GROUP BY h.id ORDER BY h.name`).all();
  const openThreats = Number((db.prepare('SELECT COUNT(*) AS count FROM threats WHERE resolved_at IS NULL').get() as {count:number}).count);
  res.json({ escrowGmv:dollars(orderStats.total),verifiedOrders:orderStats.count,verifiedProducts:verified,totalProducts,
    slaHealth:99.5,openThreats,hubs,hubAllocation:allocation,
    velocity:Array.from({length:12},(_,i)=>({minute:i*2,orders:Math.max(2,Math.round(5+Math.sin(i/2)*3)),verifications:Math.max(3,Math.round(8+Math.cos(i/2)*4))})) });
});
opsRouter.get('/warehouses', ...operator, (_req,res) => {
  const hubs = db.prepare('SELECT id,name,x,y,latency_ms AS latencyMs,status,queue_depth AS queueDepth FROM hubs ORDER BY name').all();
  const stock = db.prepare('SELECT origin_hub_id AS hubId,COUNT(*) AS products,SUM(stock) AS units FROM products GROUP BY origin_hub_id').all();
  res.json({hubs,stock});
});
opsRouter.get('/threats', ...operator, (_req,res) => {
  const rows = db.prepare(`SELECT t.id,t.type,t.severity,t.detected_at AS detectedAt,p.id AS productId,p.sku,p.name,p.stock,p.reorder_threshold AS reorderThreshold,p.authenticity_score AS authenticityScore
    FROM threats t JOIN products p ON p.id=t.product_id WHERE t.resolved_at IS NULL ORDER BY CASE t.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,t.detected_at DESC`).all();
  res.json({threats:rows});
});
opsRouter.post('/inventory/restock/:id', ...operator, (req,res) => {
  const body = parseBody(restockSchema, req.body ?? {});
  const threat = db.prepare('SELECT id,product_id,type FROM threats WHERE id=? AND resolved_at IS NULL').get(req.params.id) as {id:string;product_id:string;type:string} | undefined;
  const productId = threat?.product_id ?? req.params.id;
  const product = db.prepare('SELECT id,sku,stock,reorder_threshold FROM products WHERE id=?').get(productId) as {id:string;sku:string;stock:number;reorder_threshold:number} | undefined;
  if (!product) { res.status(404).json({error:{code:'INVENTORY_NOT_FOUND',message:'Threat or product was not found.',requestId:req.requestId}}); return; }
  const transaction = db.transaction(() => {
    db.prepare("UPDATE products SET stock=stock+?,status=CASE WHEN EXISTS (SELECT 1 FROM threats WHERE product_id=? AND resolved_at IS NULL AND type!='Low stock') THEN 'audit_flag' WHEN ?=1 AND stock+? > reorder_threshold THEN 'verified' WHEN stock+? <= reorder_threshold THEN 'low_stock' ELSE status END WHERE id=?").run(body.quantity,product.id,threat?.type === 'Low stock' ? 1 : 0,body.quantity,body.quantity,product.id);
    if (threat) db.prepare('UPDATE threats SET resolved_at=? WHERE id=?').run(nowIso(),threat.id);
    audit(req.user!.id,'INVENTORY_RESTOCKED','product',product.id,{quantity:body.quantity,threatId:threat?.id ?? null});
  });
  transaction(); publishEvent('THREAT_RESOLVED',{threatId:threat?.id ?? null,sku:product.sku});
  res.json({productId:product.id,sku:product.sku,added:body.quantity,stock:product.stock+body.quantity,resolvedThreatId:threat?.id ?? null});
});
opsRouter.post('/threats/:id/resolve', ...operator, (req,res) => {
  const {reason} = parseBody(threatResolveSchema, req.body);
  const threat = db.prepare('SELECT t.id,t.type,t.product_id,p.sku,p.authenticity_score FROM threats t JOIN products p ON p.id=t.product_id WHERE t.id=? AND t.resolved_at IS NULL')
    .get(req.params.id) as {id:string;type:string;product_id:string;sku:string;authenticity_score:number} | undefined;
  if (!threat) { res.status(404).json({error:{code:'THREAT_NOT_FOUND',message:'Open threat was not found.',requestId:req.requestId}}); return; }
  const floorRow = db.prepare("SELECT value FROM settings WHERE key='authenticityConfidenceFloor'").get() as {value:string} | undefined;
  const confidenceFloor = Number(floorRow?.value ?? 92);
  if (threat.authenticity_score < confidenceFloor) {
    res.status(409).json({error:{code:'AUTHENTICITY_BELOW_THRESHOLD',message:`${threat.sku} scores ${threat.authenticity_score}/100, below the configured ${confidenceFloor}/100 confidence floor. Keep it under review.`,requestId:req.requestId}}); return;
  }
  const transaction = db.transaction(() => {
    db.prepare('UPDATE threats SET resolved_at=? WHERE id=?').run(nowIso(), threat.id);
    db.prepare("UPDATE products SET status=CASE WHEN stock<=reorder_threshold THEN 'low_stock' ELSE 'verified' END WHERE id=? AND authenticity_score>=?").run(threat.product_id,confidenceFloor);
    audit(req.user!.id,'THREAT_REVIEWED','threat',threat.id,{sku:threat.sku,reason,confidenceFloor});
  });
  transaction(); publishEvent('THREAT_RESOLVED',{threatId:threat.id,sku:threat.sku});
  res.json({threatId:threat.id,sku:threat.sku,resolved:true,status:'verified'});
});
opsRouter.patch('/inventory/:id', ...operator, (req,res) => {
  const body = parseBody(inventoryPatchSchema,req.body);
  const product = db.prepare('SELECT id,sku,stock,price_cents FROM products WHERE id=?').get(req.params.id) as {id:string;sku:string;stock:number;price_cents:number} | undefined;
  if (!product) { res.status(404).json({error:{code:'PRODUCT_NOT_FOUND',message:'Product was not found.',requestId:req.requestId}}); return; }
  const stock = body.stock ?? product.stock; const priceCents = body.priceUsd !== undefined ? Math.round(body.priceUsd*100) : product.price_cents;
  db.prepare("UPDATE products SET stock=?,price_cents=?,status=CASE WHEN stock<=reorder_threshold THEN 'low_stock' WHEN status='low_stock' THEN 'verified' ELSE status END WHERE id=?").run(stock,priceCents,product.id);
  audit(req.user!.id,'INVENTORY_UPDATED','product',product.id,{stock,priceUsd:priceCents/100});
  res.json({productId:product.id,sku:product.sku,stock,priceUsd:priceCents/100});
});
opsRouter.get('/settings', ...operator, (_req,res) => {
  const rows = db.prepare('SELECT key,value FROM settings').all() as Array<{key:string;value:string}>;
  res.json({settings:Object.fromEntries(rows.map(row=>[row.key,Number(row.value)]))});
});
opsRouter.patch('/settings', ...operator, (req,res) => {
  const values = parseBody(settingSchema,req.body);
  const put = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  Object.entries(values).forEach(([key,value])=>put.run(key,String(value)));
  audit(req.user!.id,'SETTINGS_UPDATED','settings','thresholds',values);
  res.json({settings:values});
});
opsRouter.post('/simulation/trigger', ...operator, (req,res) => {
  const {type} = parseBody(simulationSchema,req.body);
  if (type === 'customs_hold') {
    db.prepare("UPDATE hubs SET status='warning',queue_depth=queue_depth+18 WHERE id='HUB-KHI'");
    publishEvent('CUSTOMS_HOLD_SIMULATED',{hubId:'HUB-KHI'});
  } else if (type === 'counterfeit_surge') {
    const product = db.prepare('SELECT id,sku FROM products WHERE status != ? ORDER BY authenticity_score ASC LIMIT 1').get('audit_flag') as {id:string;sku:string} | undefined;
    if (product) {
      db.prepare("UPDATE products SET status='audit_flag' WHERE id=?").run(product.id);
      db.prepare('INSERT INTO threats (id,type,severity,product_id,detected_at) VALUES (?,?,?,?,?)').run(cryptoId('thr'),'Counterfeit signal','CRITICAL',product.id,nowIso());
      publishEvent('ANOMALY_FLAGGED',{sku:product.sku,severity:'CRITICAL'});
    }
  } else {
    db.prepare("UPDATE hubs SET status='online',queue_depth=MAX(1,queue_depth-8)").run();
    publishEvent('AUTO_REBALANCE_SIMULATED',{hubs:5});
  }
  audit(req.user!.id,'SIMULATION_TRIGGERED','simulation',type,{type});
  res.status(202).json({accepted:true,type,simulated:true,message:`${type.replaceAll('_',' ')} simulation was applied.`});
});
opsRouter.get('/reports/audit.csv', ...operator, (req,res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const to = typeof req.query.to === 'string' ? req.query.to : nowIso().slice(0,10);
  const rows = db.prepare(`SELECT a.at,u.name AS actor,a.action,a.target_type,a.target_id,a.details_json FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    WHERE date(a.at)>=date(?) AND date(a.at)<=date(?) ORDER BY a.at DESC`).all(from,to) as Array<{at:string;actor:string|null;action:string;target_type:string;target_id:string;details_json:string}>;
  const cells = (v:string) => `"${v.replaceAll('"','""')}"`;
  const csv = ['at,actor,action,target_type,target_id,details',...rows.map(r=>[r.at,r.actor??'system',r.action,r.target_type,r.target_id,r.details_json].map(v=>cells(String(v))).join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="verifymart-audit-${from}-to-${to}.csv"`);
  res.send(`\uFEFF${csv}`);
});
opsRouter.get('/rewards', ...operator, (_req,res) => {
  const ledger = db.prepare('SELECT id,delta,reason,at FROM trust_ledger WHERE merchant_id=? ORDER BY at DESC').all('merchant_demo') as Array<{id:string;delta:number;reason:string;at:string}>;
  const total = ledger.reduce((sum,item)=>sum+item.delta,0);
  let runningTotal = 0;
  const chronological = [...ledger].reverse().map(item => { runningTotal += item.delta; return {...item,runningTotal}; }).reverse();
  res.json({merchant:'VerifyMart Demo Merchant',score:Math.min(1000,760+total),outOf:1000,perks:['Zero escrow fee tier','Priority verification','Expanded stock visibility'],ledger:chronological});
});
opsRouter.get('/admin/users', ...admin, (_req,res) => {
  const users = db.prepare('SELECT id,name,email,role,last_login AS lastLogin,created_at AS createdAt FROM users ORDER BY created_at ASC').all(); res.json({users});
});
opsRouter.patch('/admin/users/:id', ...admin, (req,res) => {
  const {role} = parseBody(roleSchema,req.body);
  if (req.params.id === req.user!.id) { res.status(400).json({error:{code:'SELF_ROLE_CHANGE',message:'You cannot change your own role.',requestId:req.requestId}}); return; }
  const user = db.prepare('SELECT id,email,role FROM users WHERE id=?').get(req.params.id) as {id:string;email:string;role:string} | undefined;
  if (!user) { res.status(404).json({error:{code:'USER_NOT_FOUND',message:'User was not found.',requestId:req.requestId}}); return; }
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role,user.id); audit(req.user!.id,'USER_ROLE_CHANGED','user',user.id,{from:user.role,to:role});
  res.json({id:user.id,email:user.email,role});
});
opsRouter.delete('/admin/users/:id', ...admin, (req,res) => {
  const confirmSchema = z.object({ email:z.string().email() });
  const {email} = parseBody(confirmSchema,req.body);
  if (req.params.id === req.user!.id) { res.status(400).json({error:{code:'SELF_DELETE',message:'You cannot delete your own account.',requestId:req.requestId}}); return; }
  const user = db.prepare('SELECT id,email,role FROM users WHERE id=?').get(req.params.id) as {id:string;email:string;role:string} | undefined;
  if (!user) { res.status(404).json({error:{code:'USER_NOT_FOUND',message:'User was not found.',requestId:req.requestId}}); return; }
  if (user.email.toLowerCase() !== email.toLowerCase()) { res.status(400).json({error:{code:'CONFIRMATION_MISMATCH',message:'The confirmation email does not match this user.',requestId:req.requestId}}); return; }
  audit(req.user!.id,'USER_DELETED','user',user.id,{email:user.email,role:user.role}); db.prepare('DELETE FROM users WHERE id=?').run(user.id); res.status(204).end();
});
