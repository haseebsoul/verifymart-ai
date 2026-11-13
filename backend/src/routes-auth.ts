import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema, type PublicUser, type Role } from '@verifymart/shared';
import { db, nowIso } from './db.js';
import { authenticate, issueAccessToken } from './middleware/auth.js';
import { asyncHandler, parseBody } from './middleware/http.js';

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });
const cookieName = 'vm_refresh';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

function safeUser(user: { id: string; name: string; email: string; role: Role; created_at: string; status?: string; merchant_id?: string | null }): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    status: (user.status as PublicUser['status']) ?? 'active',
    merchantId: user.merchant_id ?? undefined
  };
}

function createSession(userId: string): string {
  const raw = randomBytes(48).toString('base64url');
  const sesId = `ses_${randomBytes(8).toString('hex')}`;
  db.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(sesId, userId, tokenHash(raw), new Date(Date.now() + 7 * 86400000).toISOString(), nowIso());
  return raw;
}

authRouter.get('/mode', (_req, res) => res.json({ demoMode: process.env.NODE_ENV !== 'production' }));

authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = parseBody(registerSchema, req.body);
  const exists = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(body.email);
  if (exists) {
    res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.', requestId: req.requestId } });
    return;
  }

  // Security gate: staff and admin roles cannot be self-provisioned without valid invitation
  let assignedRole: Role = 'user';
  let accountStatus = 'active';

  if (body.role === 'admin') {
    res.status(403).json({ error: { code: 'ADMIN_PROVISIONING_FORBIDDEN', message: 'Administrator accounts must be provisioned through administrative governance.', requestId: req.requestId } });
    return;
  } else if (body.role === 'merchant') {
    assignedRole = 'merchant';
    accountStatus = 'pending'; // Requires admin approval
  } else if (body.role === 'inventory_manager' || body.role === 'operator') {
    if (body.invitationCode !== 'VERIFYMART-STAFF-2026') {
      res.status(403).json({ error: { code: 'INVITATION_INVALID', message: 'A valid staff invitation token is required for internal operations roles.', requestId: req.requestId } });
      return;
    }
    assignedRole = body.role;
  }

  const id = `usr_${randomBytes(8).toString('hex')}`;
  const passwordHash = await bcrypt.hash(body.password, 12);

  db.prepare(`INSERT INTO users (id,name,email,password_hash,role,created_at,status) VALUES (?,?,?,?,?,?,?)`)
    .run(id, body.name, body.email.toLowerCase(), passwordHash, assignedRole, nowIso(), accountStatus);

  if (assignedRole === 'merchant') {
    const appId = `app_${randomBytes(8).toString('hex')}`;
    db.prepare(`INSERT INTO merchant_applications (id,user_id,business_name,contact_email,country,description,status,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(appId, id, body.businessName || body.name, body.email.toLowerCase(), body.country || 'Global', body.businessDescription || 'Merchant application submission', 'pending', nowIso());
  }

  const row = db.prepare('SELECT id,name,email,role,created_at,status FROM users WHERE id = ?').get(id) as {
    id: string; name: string; email: string; role: Role; created_at: string; status: string
  };

  const refresh = createSession(id);
  res.cookie(cookieName, refresh, cookieOptions());

  res.status(201).json({
    user: safeUser(row),
    accessToken: issueAccessToken({ id, name: row.name, email: row.email, role: row.role }),
    requiresApproval: accountStatus === 'pending'
  });
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(loginSchema, req.body);
  const row = db.prepare('SELECT id,name,email,password_hash,role,failed_logins,locked_until,created_at,status,merchant_id FROM users WHERE email = ? COLLATE NOCASE').get(body.email) as
    { id: string; name: string; email: string; password_hash: string; role: Role; failed_logins: number; locked_until: string | null; created_at: string; status: string; merchant_id: string | null } | undefined;

  if (!row) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', requestId: req.requestId } });
    return;
  }

  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
    res.status(423).json({ error: { code: 'ACCOUNT_LOCKED', message: `Account is temporarily locked until ${row.locked_until}.`, requestId: req.requestId } });
    return;
  }

  if (!(await bcrypt.compare(body.password, row.password_hash))) {
    const fails = row.failed_logins + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails >= 5 ? 0 : fails, lock, row.id);
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', requestId: req.requestId } });
    return;
  }

  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = ? WHERE id = ?').run(nowIso(), row.id);
  const refresh = createSession(row.id);
  res.cookie(cookieName, refresh, cookieOptions());

  const user = safeUser(row);
  res.json({
    user,
    accessToken: issueAccessToken({ id: row.id, name: row.name, email: row.email, role: row.role })
  });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const refresh = req.cookies?.[cookieName] as string | undefined;
  if (!refresh) {
    res.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'Refresh session is missing.', requestId: req.requestId } });
    return;
  }

  const hash = tokenHash(refresh);
  const session = db.prepare(`SELECT s.id, s.user_id, s.expires_at, u.name, u.email, u.role, u.created_at, u.status, u.merchant_id
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hash) as
    { id: string; user_id: string; expires_at: string; name: string; email: string; role: Role; created_at: string; status: string; merchant_id: string | null } | undefined;

  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    res.clearCookie(cookieName, cookieOptions());
    res.status(401).json({ error: { code: 'REFRESH_EXPIRED', message: 'Refresh session has expired. Sign in again.', requestId: req.requestId } });
    return;
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
  const nextRefresh = createSession(session.user_id);
  res.cookie(cookieName, nextRefresh, cookieOptions());

  res.json({
    user: safeUser({ id: session.user_id, name: session.name, email: session.email, role: session.role, created_at: session.created_at, status: session.status, merchant_id: session.merchant_id }),
    accessToken: issueAccessToken({ id: session.user_id, name: session.name, email: session.email, role: session.role })
  });
}));

authRouter.post('/logout', (req, res) => {
  const refresh = req.cookies?.[cookieName] as string | undefined;
  if (refresh) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(refresh));
  res.clearCookie(cookieName, cookieOptions());
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  const row = db.prepare('SELECT id, name, email, role, created_at, status, merchant_id FROM users WHERE id = ?').get(req.user!.id) as
    { id: string; name: string; email: string; role: Role; created_at: string; status: string; merchant_id: string | null } | undefined;

  if (!row) {
    res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User no longer exists.', requestId: req.requestId } });
    return;
  }

  res.json({ user: safeUser(row) });
});
