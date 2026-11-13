import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request, RequestHandler, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = req.header('x-request-id')?.slice(0, 100) || `req_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
export const asyncHandler = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void Promise.resolve(handler(req, res, next)).catch(next); };
export function parseBody<T>(schema: ZodSchema<T>, input: unknown): T { return schema.parse(input); }
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '), requestId: req.requestId ?? 'unknown' } });
    return;
  }
  const err = error as { status?: number; code?: string; message?: string };
  const status = err.status && err.status >= 400 && err.status <= 599 ? err.status : 500;
  res.status(status).json({ error: { code: err.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: status === 500 ? 'An unexpected error occurred. Use the request ID when contacting support.' : (err.message ?? 'The request could not be completed.'),
    requestId: req.requestId ?? 'unknown' } });
};
