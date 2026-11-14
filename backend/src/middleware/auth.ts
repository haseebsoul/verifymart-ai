import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@verifymart/shared';
import { db } from '../db.js';

export interface AuthUser { id: string; name: string; email: string; role: Role }
declare global { namespace Express { interface Request { user?: AuthUser; requestId?: string } } }
const secret = (): string => {
  const configured = process.env.JWT_ACCESS_SECRET;
  if (process.env.NODE_ENV === 'production' && !configured) throw new Error('JWT_ACCESS_SECRET must be configured in production.');
  return configured ?? 'local-development-only-secret-change-me';
};
export function issueAccessToken(user: AuthUser): string {
  return jwt.sign({ name: user.name, email: user.email, role: user.role }, secret(), { subject: user.id, expiresIn: '15m' });
}
export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string' || !['user','operator','admin'].includes(String(decoded.role))) return null;
    return { id: decoded.sub, name: String(decoded.name ?? ''), email: String(decoded.email ?? ''), role: decoded.role as Role };
  } catch { return null; }
}
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyAccessToken(token) : null;
  if (!user) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid access token is required.', requestId: req.requestId ?? 'unknown' } }); return; }
  const current = db.prepare('SELECT id,name,email,role,disabled_at FROM users WHERE id=?').get(user.id) as { id:string; name:string; email:string; role:string; disabled_at:string|null } | undefined;
  if (!current || current.disabled_at || !['user','operator','admin'].includes(current.role)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The account is no longer available.', requestId: req.requestId ?? 'unknown' } });
    return;
  }
  req.user = { id: current.id, name: current.name, email: current.email, role: current.role as Role }; next();
}
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    const user = verifyAccessToken(token);
    if (user) req.user = user;
  }
  next();
}
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in is required.', requestId: req.requestId ?? 'unknown' } }); return; }
    if (!roles.includes(req.user.role)) { res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your account does not have permission for this action.', requestId: req.requestId ?? 'unknown' } }); return; }
    next();
  };
}
