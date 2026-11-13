import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { authRouter } from './routes-auth.js';
import { catalogRouter } from './routes-catalog.js';
import { commerceRouter } from './routes-commerce.js';
import { opsRouter } from './routes-ops.js';
import { db } from './db.js';
import { errorHandler, requestContext } from './middleware/http.js';

export const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(v=>v.trim());
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) callback(null,true); else callback(new Error('Origin is not allowed by CORS.'));
}, credentials:true }));
app.use(express.json({ limit:'1mb' }));
app.use(cookieParser());
app.use('/api', requestContext);
app.use(pinoHttp({ genReqId: req => req.requestId ?? req.headers['x-request-id']?.toString() ?? `req_${randomUUID().slice(0,12)}` }));

const publicLimiter = rateLimit({ windowMs:60_000, limit:120, standardHeaders:'draft-7', legacyHeaders:false,
  handler: (_req,res) => res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests. Please retry shortly.',requestId:res.getHeader('X-Request-Id') ?? 'unknown'}}) });
app.use('/api',publicLimiter);
app.get('/api/health',(_req,res)=>res.json({status:'ok',service:'verifymart-api',uptimeSeconds:Math.floor(process.uptime()),availabilityTarget:'99.5%',timestamp:new Date().toISOString()}));
app.get('/api/ready',(_req,res)=>{
  try { db.prepare('SELECT 1').get(); res.json({status:'ready',database:'reachable'}); }
  catch { res.status(503).json({status:'not_ready',database:'unavailable'}); }
});
app.use('/api/auth',authRouter);
app.use('/api',catalogRouter);
app.use('/api',commerceRouter);
app.use('/api',opsRouter);
app.get('/api/openapi.json',(_req,res)=>res.sendFile(new URL('../openapi.json',import.meta.url).pathname));
app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'The requested API route does not exist.',requestId:res.getHeader('X-Request-Id') ?? 'unknown'}}));
app.use(errorHandler);
