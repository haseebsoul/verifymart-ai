import { Router } from 'express';
import { z } from 'zod';
import {
  DESTINATIONS, roleSchema, restockSchema, inventoryPatchSchema,
  settingSchema, simulationSchema, threatResolveSchema, inventoryTransferSchema,
  productCreateSchema, merchantApplicationSchema
} from '@verifymart/shared';
import { db, dollars, nowIso } from './db.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { asyncHandler, parseBody } from './middleware/http.js';
import { publishEvent } from './telemetry.js';
import { randomBytes } from 'node:crypto';

export const opsRouter = Router();

function recordAudit(actorId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown>): void {
  const auditId = `aud_${randomBytes(8).toString('hex')}`;
  db.prepare(`INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details_json, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(auditId, actorId, action, targetType, targetId, JSON.stringify(details), nowIso());
}

// Access controls
const internalStaff = [authenticate, requireRole('merchant', 'inventory_manager', 'operator', 'admin')];
const inventoryOrOps = [authenticate, requireRole('inventory_manager', 'operator', 'admin')];
const operatorOrAdmin = [authenticate, requireRole('operator', 'admin')];
const adminOnly = [authenticate, requireRole('admin')];

// 1. Unified Operations & Dashboard Metrics
opsRouter.get('/metrics', ...internalStaff, (req, res) => {
  const user = req.user!;
  const orderStats = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total, COALESCE(SUM(CASE WHEN state = 'held' THEN total_cents ELSE 0 END),0) AS heldTotal, COALESCE(SUM(CASE WHEN state = 'released' THEN total_cents ELSE 0 END),0) AS releasedTotal FROM orders").get() as { count: number; total: number; heldTotal: number; releasedTotal: number };
  const verified = Number((db.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'verified'").get() as { count: number }).count);
  const totalProducts = Number((db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count);
  const hubs = db.prepare('SELECT id, name, x, y, latency_ms AS latencyMs, status, queue_depth AS queueDepth FROM hubs ORDER BY name').all();
  const allocation = db.prepare(`SELECT h.id AS hubId, h.name, COUNT(oi.order_id) AS orders FROM hubs h LEFT JOIN products p ON p.origin_hub_id = h.id LEFT JOIN order_items oi ON oi.product_id = p.id GROUP BY h.id ORDER BY h.name`).all();
  const openThreats = Number((db.prepare('SELECT COUNT(*) AS count FROM threats WHERE resolved_at IS NULL').get() as { count: number }).count);
  const totalUsers = Number((db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count);
  const pendingApps = Number((db.prepare("SELECT COUNT(*) AS count FROM merchant_applications WHERE status = 'pending'").get() as { count: number }).count);

  res.json({
    role: user.role,
    escrowGmv: dollars(orderStats.total),
    escrowHeld: dollars(orderStats.heldTotal),
    escrowReleased: dollars(orderStats.releasedTotal),
    verifiedOrders: orderStats.count,
    verifiedProducts: verified,
    totalProducts,
    totalUsers,
    pendingMerchantApplications: pendingApps,
    slaHealth: 99.5,
    openThreats,
    hubs,
    hubAllocation: allocation,
    velocity: Array.from({ length: 12 }, (_, i) => ({
      minute: i * 2,
      orders: Math.max(2, Math.round(5 + Math.sin(i / 2) * 3)),
      verifications: Math.max(3, Math.round(8 + Math.cos(i / 2) * 4))
    }))
  });
});

// 2. Warehouses & Hubs
opsRouter.get('/warehouses', ...internalStaff, (_req, res) => {
  const warehouses = db.prepare(`SELECT w.id, w.hub_id AS hubId, w.name, w.city, w.country, w.capacity_units AS capacityUnits, w.utilized_units AS utilizedUnits, w.status, h.name AS hubName
    FROM warehouses w JOIN hubs h ON h.id = w.hub_id ORDER BY w.city`).all();
  const hubs = db.prepare('SELECT id, name, latency_ms AS latencyMs, status, queue_depth AS queueDepth FROM hubs ORDER BY name').all();
  const stockByHub = db.prepare('SELECT origin_hub_id AS hubId, COUNT(*) AS products, SUM(stock) AS units FROM products GROUP BY origin_hub_id').all();
  res.json({ warehouses, hubs, stockByHub });
});

// 3. Threats & Risk Resolution
opsRouter.get('/threats', ...inventoryOrOps, (_req, res) => {
  const rows = db.prepare(`SELECT t.id, t.type, t.severity, t.detected_at AS detectedAt, p.id AS productId, p.sku, p.name, p.stock, p.reorder_threshold AS reorderThreshold, p.authenticity_score AS authenticityScore
    FROM threats t JOIN products p ON p.id = t.product_id WHERE t.resolved_at IS NULL
    ORDER BY CASE t.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, t.detected_at DESC`).all();
  res.json({ threats: rows });
});

opsRouter.post('/threats/:id/resolve', ...operatorOrAdmin, (req, res) => {
  const { reason } = parseBody(threatResolveSchema, req.body);
  const threat = db.prepare('SELECT t.id, t.type, t.product_id, p.sku, p.authenticity_score FROM threats t JOIN products p ON p.id = t.product_id WHERE t.id = ? AND t.resolved_at IS NULL')
    .get(req.params.id) as { id: string; type: string; product_id: string; sku: string; authenticity_score: number } | undefined;

  if (!threat) {
    res.status(404).json({ error: { code: 'THREAT_NOT_FOUND', message: 'Open threat was not found.', requestId: req.requestId } });
    return;
  }

  const floorRow = db.prepare("SELECT value FROM settings WHERE key = 'authenticityConfidenceFloor'").get() as { value: string } | undefined;
  const confidenceFloor = Number(floorRow?.value ?? 92);

  if (threat.authenticity_score < confidenceFloor) {
    res.status(409).json({ error: { code: 'AUTHENTICITY_BELOW_THRESHOLD', message: `${threat.sku} scores ${threat.authenticity_score}/100, below the required ${confidenceFloor}/100 confidence floor.`, requestId: req.requestId } });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE threats SET resolved_at = ?, resolution_reason = ? WHERE id = ?').run(nowIso(), reason, threat.id);
    db.prepare("UPDATE products SET status = CASE WHEN stock <= reorder_threshold THEN 'low_stock' ELSE 'verified' END WHERE id = ?").run(threat.product_id);
    recordAudit(req.user!.id, 'THREAT_RESOLVED', 'threat', threat.id, { sku: threat.sku, reason, confidenceFloor });
  })();

  publishEvent('THREAT_RESOLVED', { threatId: threat.id, sku: threat.sku, reason });
  res.json({ success: true, threatId: threat.id, resolvedAt: nowIso() });
});

// 4. Inventory Management: Restock, Transfers & Movements
opsRouter.post('/inventory/restock/:id', ...inventoryOrOps, (req, res) => {
  const body = parseBody(restockSchema, req.body ?? {});
  const threat = db.prepare('SELECT id, product_id, type FROM threats WHERE id = ? AND resolved_at IS NULL').get(req.params.id) as { id: string; product_id: string; type: string } | undefined;
  const productId = threat?.product_id ?? req.params.id;
  const product = db.prepare('SELECT id, sku, name, stock, reorder_threshold FROM products WHERE id = ?').get(productId) as { id: string; sku: string; name: string; stock: number; reorder_threshold: number } | undefined;

  if (!product) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Target product was not found.', requestId: req.requestId } });
    return;
  }

  db.transaction(() => {
    db.prepare("UPDATE products SET stock = stock + ?, status = CASE WHEN stock + ? <= reorder_threshold THEN 'low_stock' ELSE 'verified' END WHERE id = ?")
      .run(body.quantity, body.quantity, product.id);

    if (threat) {
      db.prepare('UPDATE threats SET resolved_at = ?, resolution_reason = ? WHERE id = ?').run(nowIso(), 'Restocked via Inventory Control', threat.id);
    }

    const movId = `mov_${randomBytes(8).toString('hex')}`;
    db.prepare(`INSERT INTO inventory_movements (id, product_id, source_location, destination_location, quantity, actor_id, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(movId, product.id, 'External Supplier / Depot', body.warehouseId || 'Primary Bonded Vault', body.quantity, req.user!.id, 'Operational restock replenishment', nowIso());

    recordAudit(req.user!.id, 'INVENTORY_RESTOCKED', 'product', product.id, { quantity: body.quantity, previousStock: product.stock, newStock: product.stock + body.quantity });
  })();

  publishEvent('INVENTORY_RESTOCKED', { productId: product.id, sku: product.sku, quantity: body.quantity });
  res.json({ success: true, productId: product.id, sku: product.sku, added: body.quantity, stock: product.stock + body.quantity });
});

opsRouter.post('/inventory/transfer', ...inventoryOrOps, (req, res) => {
  const body = parseBody(inventoryTransferSchema, req.body);
  const product = db.prepare('SELECT id, sku, stock FROM products WHERE id = ?').get(body.productId) as { id: string; sku: string; stock: number } | undefined;
  if (!product) {
    res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.', requestId: req.requestId } });
    return;
  }

  const movId = `mov_${randomBytes(8).toString('hex')}`;
  db.transaction(() => {
    db.prepare(`INSERT INTO inventory_movements (id, product_id, source_location, destination_location, quantity, actor_id, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(movId, product.id, body.sourceWarehouseId, body.destinationWarehouseId, body.quantity, req.user!.id, body.reason, nowIso());

    recordAudit(req.user!.id, 'INVENTORY_TRANSFERRED', 'product', product.id, body);
  })();

  res.json({ success: true, movementId: movId, timestamp: nowIso() });
});

opsRouter.get('/inventory/movements', ...internalStaff, (_req, res) => {
  const movements = db.prepare(`SELECT m.id, m.product_id AS productId, p.sku, p.name AS productName, m.source_location AS source, m.destination_location AS destination, m.quantity, u.name AS actorName, m.reason, m.timestamp
    FROM inventory_movements m JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.actor_id ORDER BY m.timestamp DESC LIMIT 100`).all();
  res.json({ movements });
});

// 5. Merchant Applications & Studio Actions
opsRouter.get('/applications', ...adminOnly, (_req, res) => {
  const apps = db.prepare(`SELECT a.id, a.user_id AS userId, a.business_name AS businessName, a.contact_email AS contactEmail, a.country, a.description, a.status, a.created_at AS createdAt
    FROM merchant_applications a ORDER BY a.created_at DESC`).all();
  res.json({ applications: apps });
});

opsRouter.post('/applications/:id/approve', ...adminOnly, (req, res) => {
  const app = db.prepare('SELECT id, user_id FROM merchant_applications WHERE id = ?').get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!app) {
    res.status(404).json({ error: { code: 'APP_NOT_FOUND', message: 'Application not found.', requestId: req.requestId } });
    return;
  }

  db.transaction(() => {
    db.prepare("UPDATE merchant_applications SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?")
      .run(req.user!.id, nowIso(), app.id);
    if (app.user_id) {
      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(app.user_id);
    }
    recordAudit(req.user!.id, 'MERCHANT_APPROVED', 'merchant_application', app.id, { applicantId: app.user_id });
  })();

  res.json({ success: true, applicationId: app.id, status: 'approved' });
});

// 6. Settings & Thresholds
opsRouter.get('/settings', ...internalStaff, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings = Object.fromEntries(rows.map(r => [r.key, Number(r.value)]));
  res.json({
    authenticityConfidenceFloor: settings.authenticityConfidenceFloor ?? 92,
    customsSurgeBuffer: settings.customsSurgeBuffer ?? 15,
    maxEscrowHoldHours: settings.maxEscrowHoldHours ?? 72
  });
});

opsRouter.patch('/settings', ...operatorOrAdmin, (req, res) => {
  const body = parseBody(settingSchema, req.body);
  db.transaction(() => {
    for (const [key, value] of Object.entries(body)) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    }
    recordAudit(req.user!.id, 'SETTINGS_UPDATED', 'settings', 'global', body);
  })();

  publishEvent('SETTINGS_CHANGED', body);
  res.json({ success: true, updated: body });
});

// 7. Simulations
opsRouter.post('/simulation/trigger', ...operatorOrAdmin, (req, res) => {
  const { type } = parseBody(simulationSchema, req.body);
  const now = nowIso();

  if (type === 'customs_hold') {
    db.prepare("UPDATE hubs SET status = 'warning', queue_depth = queue_depth + 18 WHERE id = 'HUB-ZRH'").run();
    recordAudit(req.user!.id, 'SIMULATION_TRIGGERED', 'simulation', 'customs_hold', { target: 'HUB-ZRH', queueIncrement: 18 });
  } else if (type === 'counterfeit_surge') {
    const p = db.prepare('SELECT id, sku FROM products LIMIT 1').get() as { id: string; sku: string };
    const threatId = `threat_${randomBytes(6).toString('hex')}`;
    db.prepare('INSERT INTO threats (id, type, severity, product_id, detected_at) VALUES (?, ?, ?, ?, ?)').run(threatId, 'Simulated Counterfeit Spike', 'CRITICAL', p.id, now);
    recordAudit(req.user!.id, 'SIMULATION_TRIGGERED', 'simulation', 'counterfeit_surge', { threatId, sku: p.sku });
  } else if (type === 'auto_rebalance') {
    db.prepare("UPDATE hubs SET queue_depth = MAX(3, queue_depth - 10), status = 'online'").run();
    recordAudit(req.user!.id, 'SIMULATION_TRIGGERED', 'simulation', 'auto_rebalance', { restored: true });
  }

  publishEvent('SIMULATION_EVENT', { type, triggeredBy: req.user!.name, at: now });
  res.json({ success: true, simulation: type, triggeredAt: now });
});

// 8. Notifications & Messages
opsRouter.get('/notifications', authenticate, (req, res) => {
  const rows = db.prepare('SELECT id, title, message, category, is_read AS isRead, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user!.id);
  res.json({ notifications: rows });
});

opsRouter.patch('/notifications/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ success: true });
});

// 9. Admin User Management
opsRouter.get('/admin/users', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT id, name, email, role, status, created_at AS createdAt, last_login AS lastLogin FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows });
});

opsRouter.patch('/admin/users/:id/role', ...adminOnly, (req, res) => {
  const { role } = parseBody(roleSchema, req.body);
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: { code: 'SELF_DEMOTION_FORBIDDEN', message: 'You cannot alter your own administrative role privileges.', requestId: req.requestId } });
    return;
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  recordAudit(req.user!.id, 'USER_ROLE_CHANGED', 'user', req.params.id, { newRole: role });
  res.json({ success: true, userId: req.params.id, role });
});

opsRouter.patch('/admin/users/:id/status', ...adminOnly, (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Status must be active or suspended.', requestId: req.requestId } });
    return;
  }
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: { code: 'SELF_SUSPENSION_FORBIDDEN', message: 'Cannot suspend your own account.', requestId: req.requestId } });
    return;
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  recordAudit(req.user!.id, 'USER_STATUS_CHANGED', 'user', req.params.id, { status });
  res.json({ success: true, userId: req.params.id, status });
});

// 10. Audit Logs
opsRouter.get('/admin/audit-logs', ...adminOnly, (_req, res) => {
  const logs = db.prepare(`SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId, a.details_json AS detailsJson, a.at, u.name AS actorName, u.email AS actorEmail
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 100`).all();
  res.json({ logs });
});

// 11. CSV Export
opsRouter.get('/reports/audit.csv', ...operatorOrAdmin, (_req, res) => {
  const rows = db.prepare(`SELECT a.id, a.at, a.action, a.target_type, a.target_id, COALESCE(u.email, 'system') AS actor, a.details_json
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 1000`).all() as Array<{
      id: string; at: string; action: string; target_type: string; target_id: string; actor: string; details_json: string;
    }>;

  const header = '\uFEFFid,timestamp,action,target_type,target_id,actor,details\r\n';
  const csv = header + rows.map(r => `"${r.id}","${r.at}","${r.action}","${r.target_type}","${r.target_id}","${r.actor}","${r.details_json.replace(/"/g, '""')}"`).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="verifymart_audit_${Date.now()}.csv"`);
  res.send(csv);
});
