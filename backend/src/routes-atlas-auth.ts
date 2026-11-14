import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import type { Collection } from 'mongodb';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoServerError, type UpdateFilter } from 'mongodb';
import { z } from 'zod';
import { getAtlasDb } from './infrastructure/atlas.js';
import { authenticateAtlas } from './middleware/atlas-auth.js';
import { asyncHandler } from './middleware/http.js';
import type { UserDocument } from './repositories/contracts.js';
import { MongoUserRepository } from './repositories/users.js';

export const atlasAuthRouter = Router();

atlasAuthRouter.get('/auth/mode', (_req, res) => {
  const demoMode = process.env.NODE_ENV !== 'production' && Boolean(process.env.DEMO_PASSWORD);
  res.json({ demoMode });
});
const cookieName = 'verifymart_refresh';
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128)
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

function jwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required for Atlas authentication.');
  return secret;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeUser(user: UserDocument) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function issueAccessToken(user: UserDocument): string {
  return jwt.sign({ name: user.name, email: user.email }, jwtSecret(), {
    subject: user._id,
    expiresIn: '15m'
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: sevenDaysMs
  };
}

function invalidCredentials(res: Response, requestId?: string) {
  res.status(401).json({
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
      requestId: requestId ?? 'unknown'
    }
  });
}

async function newRefreshSession(userId: string, res: Response, userCollection: Collection<UserDocument>) {
  const token = randomBytes(48).toString('base64url');
  const now = new Date();
  await userCollection.updateOne(
    { _id: userId },
    ({
      $push: {
        refreshSessions: {
          tokenHash: hashToken(token),
          createdAt: now,
          expiresAt: new Date(now.getTime() + sevenDaysMs)
        }
      }
    } as unknown as UpdateFilter<UserDocument>));
  res.cookie(cookieName, token, cookieOptions());
}

atlasAuthRouter.post('/auth/register', registerLimiter, asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const users = getAtlasDb().collection<UserDocument>('users');
  const user: UserDocument = {
    _id: 'usr_' + randomUUID().replaceAll('-', '').slice(0, 18),
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: await bcrypt.hash(input.password, 12),
    role: 'shopper',
    failedLogins: 0,
    lockedUntil: null,
    lastLogin: null,
    disabledAt: null,
    createdAt: new Date(),
    refreshSessions: []
  };

  try {
    await users.insertOne(user);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.', requestId: req.requestId } });
      return;
    }
    throw error;
  }

  await newRefreshSession(user._id, res, users);
  res.status(201).json({ user: safeUser(user), accessToken: issueAccessToken(user) });
}));

atlasAuthRouter.post('/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const users = getAtlasDb().collection<UserDocument>('users');
  const user = await users.findOne({ email: input.email.toLowerCase() });

  // Same response for unknown, disabled and incorrect-password accounts.
  if (!user || user.disabledAt) {
    invalidCredentials(res, req.requestId);
    return;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    res.status(423).json({ error: { code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked after repeated failed attempts.', requestId: req.requestId } });
    return;
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    await new MongoUserRepository().incrementFailedLogin(user._id);
    invalidCredentials(res, req.requestId);
    return;
  }

  await new MongoUserRepository().clearFailedLogins(user._id);
  await newRefreshSession(user._id, res, users);
  res.json({ user: safeUser(user), accessToken: issueAccessToken(user) });
}));

atlasAuthRouter.post('/auth/refresh', asyncHandler(async (req, res) => {
  const refresh = req.cookies?.[cookieName] as string | undefined;
  if (!refresh) {
    res.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'Refresh session is missing.', requestId: req.requestId } });
    return;
  }

  const users = getAtlasDb().collection<UserDocument>('users');
  const tokenHash = hashToken(refresh);
  const user = await users.findOne({
    'refreshSessions.tokenHash': tokenHash,
    $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }]
  });

  if (!user) {
    res.clearCookie(cookieName, cookieOptions());
    res.status(401).json({ error: { code: 'REFRESH_EXPIRED', message: 'Refresh session has expired. Sign in again.', requestId: req.requestId } });
    return;
  }

  const existing = user.refreshSessions.find(session => session.tokenHash === tokenHash);
  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    await users.updateOne({ _id: user._id }, { $pull: { refreshSessions: { tokenHash } } } as unknown as UpdateFilter<UserDocument>);
    res.clearCookie(cookieName, cookieOptions());
    res.status(401).json({ error: { code: 'REFRESH_EXPIRED', message: 'Refresh session has expired. Sign in again.', requestId: req.requestId } });
    return;
  }

  const nextToken = randomBytes(48).toString('base64url');
  const now = new Date();
  const rotated = await users.updateOne(
    { _id: user._id, 'refreshSessions.tokenHash': tokenHash, $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }] },
    ({
      $pull: { refreshSessions: { tokenHash } },
      $push: {
        refreshSessions: {
          tokenHash: hashToken(nextToken),
          createdAt: now,
          expiresAt: new Date(now.getTime() + sevenDaysMs)
        }
      }
    } as unknown as UpdateFilter<UserDocument>));
  if (rotated.modifiedCount !== 1) {
    res.clearCookie(cookieName, cookieOptions());
    res.status(401).json({ error: { code: 'REFRESH_REPLAYED', message: 'Refresh token was already rotated. Sign in again.', requestId: req.requestId } });
    return;
  }

  res.cookie(cookieName, nextToken, cookieOptions());
  res.json({ user: safeUser(user), accessToken: issueAccessToken(user) });
}));

atlasAuthRouter.post('/auth/logout', asyncHandler(async (req, res) => {
  const refresh = req.cookies?.[cookieName] as string | undefined;
  if (refresh) {
    await getAtlasDb().collection<UserDocument>('users').updateMany(
      { 'refreshSessions.tokenHash': hashToken(refresh) },
      { $pull: { refreshSessions: { tokenHash: hashToken(refresh) } } } as unknown as UpdateFilter<UserDocument>
    );
  }
  res.clearCookie(cookieName, cookieOptions());
  res.status(204).end();
}));

atlasAuthRouter.get('/auth/me', authenticateAtlas, asyncHandler(async (req, res) => {
  const user = await getAtlasDb().collection<UserDocument>('users').findOne({ _id: req.atlasPrincipal!.id });
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The account is no longer available.', requestId: req.requestId } });
    return;
  }
  res.json({ user: safeUser(user) });
}));
