import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { asyncHandler, requestContext, errorHandler } from './middleware/http.js';
import { checkAtlasReady } from './infrastructure/atlas.js';
import { inspectExpectedAtlasIndexes } from './infrastructure/indexes.js';
import { getAtlasDb } from './infrastructure/atlas.js';
import { atlasAuthRouter } from './routes-atlas-auth.js';
import { atlasPublicRouter } from './routes-atlas-public.js';
import { atlasMerchantRouter } from './routes-atlas-merchant.js';
import { atlasAdminRouter } from './routes-atlas-admin.js';
import { atlasCommerceRouter } from './routes-atlas-commerce.js';
import { atlasOpsRouter } from './routes-atlas-ops.js';

export const app = express();
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'req.headers["sec-websocket-protocol"]',
      'password', 'passwordHash', 'token', 'refreshToken', 'MONGODB_URI',
      'MONGODB_AUDIT_URI', 'JWT_ACCESS_SECRET'
    ],
    censor: '[REDACTED]'
  }
});

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by the VerifyMart CORS policy.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestContext);

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
app.use('/api', apiLimiter);

let requestCount = 0;
let errorCount = 0;
let durationMsTotal = 0;
const latencySamplesMs: number[] = [];

function p95LatencyMs(): number {
  if (latencySamplesMs.length === 0) return 0;
  const sorted = [...latencySamplesMs].sort((a, b) => a - b);
  return Number((sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0).toFixed(1));
}
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    requestCount += 1;
    durationMsTotal += durationMs;
    latencySamplesMs.push(durationMs);
    if (latencySamplesMs.length > 250) latencySamplesMs.shift();
    if (res.statusCode >= 500) errorCount += 1;
    logger.info({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs
    }, 'HTTP request');
  });
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await checkAtlasReady();
    res.json({
      status: 'ok',
      service: 'verifymart-api',
      database: 'ok',
      persistence: 'mongodb-atlas',
      p95LatencyMs: p95LatencyMs()
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'verifymart-api',
      database: 'unavailable',
      persistence: 'mongodb-atlas'
    });
  }
});

app.get('/api/public/metrics', asyncHandler(async (_req, res) => {
  const database = getAtlasDb();
  const [products, batchProvenanceRecords, registeredSuppliers, orderRecords] = await Promise.all([
    database.collection('products').countDocuments({ listingStatus: 'published' }),
    database.collection('products').countDocuments({
      batchHash: { $type: 'string' },
      provenanceEvents: { $exists: true, $ne: [] }
    }),
    database.collection('merchants').countDocuments({}),
    database.collection('orders').countDocuments({})
  ]);
  res.json({
    api: {
      status: 'ok',
      p95LatencyMs: p95LatencyMs(),
      requests: requestCount,
      errors: errorCount
    },
    database: { products, batchProvenanceRecords, registeredSuppliers, orderRecords }
  });
}));

app.get('/api/ready', async (_req, res) => {
  try {
    await checkAtlasReady();
    const missingIndexes = await inspectExpectedAtlasIndexes(getAtlasDb());
    if (missingIndexes.length) {
      res.status(503).json({ status: 'not_ready', reason: 'Required Atlas indexes are missing.', missingIndexes });
      return;
    }
    res.json({ status: 'ready', persistence: 'mongodb-atlas' });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'Atlas database is not ready.' });
  }
});

app.get('/metrics/prom', (req, res) => {
  const requiredToken = process.env.METRICS_BEARER_TOKEN;
  if (process.env.NODE_ENV === 'production' && !requiredToken) {
    res.status(404).end();
    return;
  }
  if (requiredToken && req.header('authorization') !== 'Bearer ' + requiredToken) {
    res.status(403).end();
    return;
  }
  res.type('text/plain; version=0.0.4; charset=utf-8').send([
    '# HELP verifymart_http_requests_total Total HTTP requests served by this process.',
    '# TYPE verifymart_http_requests_total counter',
    'verifymart_http_requests_total ' + requestCount,
    '# HELP verifymart_http_5xx_total Total HTTP 5xx responses served by this process.',
    '# TYPE verifymart_http_5xx_total counter',
    'verifymart_http_5xx_total ' + errorCount,
    '# HELP verifymart_http_duration_ms_sum Sum of HTTP request duration in milliseconds.',
    '# TYPE verifymart_http_duration_ms_sum counter',
    'verifymart_http_duration_ms_sum ' + durationMsTotal.toFixed(3)
  ].join('\n') + '\n');
});

app.use('/api', atlasAuthRouter);
app.use('/api', atlasPublicRouter);
app.use('/api', atlasMerchantRouter);
app.use('/api', atlasAdminRouter);
app.use('/api', atlasCommerceRouter);
app.use('/api', atlasOpsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
});
app.use(errorHandler);
