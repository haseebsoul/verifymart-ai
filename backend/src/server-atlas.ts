import 'dotenv/config';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import { WebSocket, WebSocketServer } from 'ws';
import { app } from './app-atlas.js';
import { checkAtlasReady, closeAtlas, connectAtlas, connectAuditLog, getAtlasDb } from './infrastructure/atlas.js';
import type { HubDocument, MerchantDocument, ProductDocument, UserDocument } from './repositories/contracts.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const port = Number(process.env.PORT ?? 5000);
const host = process.env.HOST ?? '0.0.0.0';
const maxConnections = 200;
const server = createServer(app);
const contexts = new WeakMap<WebSocket, {
  userId?: string;
  role?: string;
  merchantId?: string;
  expiresAt?: number;
}>();

function send(socket: WebSocket, event: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

type SocketContext = { userId?: string; role?: string; merchantId?: string; expiresAt?: number };

async function resolveSocketContext(protocolHeader: string | undefined): Promise<SocketContext> {
  const protocols = (protocolHeader ?? '').split(',').map(value => value.trim());
  const bearerProtocol = protocols.find(value => value.startsWith('bearer.'));
  if (!bearerProtocol) return {};

  const token = bearerProtocol.slice('bearer.'.length);
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || !token) throw new Error('WEBSOCKET_UNAUTHORIZED');

  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.exp !== 'number') throw new Error('WEBSOCKET_UNAUTHORIZED');

  const database = getAtlasDb();
  const user = await database.collection<UserDocument>('users').findOne({
    _id: decoded.sub,
    $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
  });
  if (!user) throw new Error('WEBSOCKET_UNAUTHORIZED');

  const context: SocketContext = {
    userId: user._id,
    role: user.role,
    expiresAt: decoded.exp
  };
  if (user.role === 'merchant') {
    const merchant = await database.collection<MerchantDocument>('merchants').findOne({
      userId: user._id,
      status: 'approved'
    });
    if (!merchant) throw new Error('WEBSOCKET_UNAUTHORIZED');
    context.merchantId = merchant._id;
  }
  return context;
}

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 16 * 1024,
  handleProtocols: protocols => protocols.has('verifymart') ? 'verifymart' : false
});

wss.on('connection', async (socket, request) => {
  if (wss.clients.size > maxConnections) {
    socket.close(4429, 'Connection limit reached.');
    return;
  }

  try {
    const context = await resolveSocketContext(request.headers['sec-websocket-protocol']);
    contexts.set(socket, context);
    const isPublic = !context.userId;
    send(socket, {
      type: 'CONNECTED',
      channel: isPublic ? 'public' : context.role,
      authenticated: !isPublic,
      simulated: true
    });
  } catch {
    socket.close(4401, 'Authentication required.');
  }

  socket.on('error', error => logger.warn({ error: error.message }, 'WebSocket client error'));
});

wss.on('error', error => logger.error({ error: error.message }, 'WebSocket server error'));

async function broadcastSnapshots(): Promise<void> {
  if (wss.clients.size === 0) return;
  const database = getAtlasDb();
  const [hubs, products] = await Promise.all([
    database.collection<HubDocument>('hubs').find({}).sort({ name: 1 }).toArray(),
    database.collection<ProductDocument>('products').find({ listingStatus: 'published' }).limit(1000).toArray()
  ]);

  const publicHubs = hubs.map(hub => ({ name: hub.name, status: hub.status }));
  for (const socket of wss.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const context = contexts.get(socket);
    if (!context?.userId) {
      send(socket, { type: 'PUBLIC_STATUS', simulated: true, hubs: publicHubs });
      continue;
    }

    if (context.expiresAt !== undefined && Date.now() >= context.expiresAt * 1000) {
      socket.close(4401, 'Session expired. Reconnect.');
      continue;
    }

    const current = await database.collection<UserDocument>('users').findOne({
      _id: context.userId,
      $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
    });
    if (!current || current.role !== context.role) {
      socket.close(4403, 'Account permissions changed. Reconnect.');
      continue;
    }

    if (context.role === 'operator' || context.role === 'admin') {
      send(socket, {
        type: 'OPS_TELEMETRY',
        simulated: true,
        hubs: hubs.map(hub => ({
          id: hub._id, name: hub.name, status: hub.status,
          latencyMs: hub.latencyMs, queueDepth: hub.queueDepth
        })),
        inventory: {
          products: products.length,
          lowStock: products.filter(product => product.stock <= product.reorderThreshold).length,
          auditFlagged: products.filter(product => product.status === 'audit_flag').length
        }
      });
    } else if (context.role === 'inventory_manager') {
      send(socket, {
        type: 'INVENTORY_SNAPSHOT',
        simulated: false,
        inventory: products.map(product => ({
          id: product._id, sku: product.sku, name: product.name,
          stock: product.stock, reorderThreshold: product.reorderThreshold,
          status: product.status
        }))
      });
    } else if (context.role === 'merchant' && context.merchantId) {
      send(socket, {
        type: 'MERCHANT_INVENTORY',
        simulated: false,
        inventory: products.filter(product => product.merchantId === context.merchantId).map(product => ({
          id: product._id, sku: product.sku, name: product.name,
          stock: product.stock, status: product.status
        }))
      });
    } else {
      send(socket, { type: 'PUBLIC_STATUS', simulated: true, hubs: publicHubs });
    }
  }
}

let stopped = false;
const interval = setInterval(() => {
  void broadcastSnapshots().catch(error => {
    logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'WebSocket snapshot broadcast failed');
  });
}, 2000);

async function shutdown(signal: string): Promise<void> {
  if (stopped) return;
  stopped = true;
  clearInterval(interval);
  logger.info({ signal }, 'Shutting down Atlas API');
  for (const socket of wss.clients) socket.close(1001, 'Server shutting down.');
  server.close(async () => {
    await closeAtlas();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

async function main(): Promise<void> {
  const jwtSecret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().includes('replace-with')) {
    throw new Error('JWT_ACCESS_SECRET must be a non-placeholder random value of at least 32 characters.');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN?.trim()) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production.');
  }
  await connectAtlas();
  await connectAuditLog();
  await checkAtlasReady();
  server.listen(port, host, () => {
    logger.info({ host, port, persistence: 'mongodb-atlas' }, 'VerifyMart Atlas API listening');
  });
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

main().catch(async error => {
  logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'Atlas API startup failed');
  await closeAtlas().catch(() => undefined);
  process.exitCode = 1;
});
