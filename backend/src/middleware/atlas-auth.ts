import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, Role, UserDocument } from '../repositories/contracts.js';

export interface AtlasPrincipal {
  id: string;
  name: string;
  email: string;
  role: Role;
  merchantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      atlasPrincipal?: AtlasPrincipal;
      merchantId?: string;
    }
  }
}

function accessSecret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error('JWT_ACCESS_SECRET must be configured before Atlas authentication is enabled.');
  return value;
}

function sendAuthError(res: Response, status: 401 | 403, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
      requestId: res.getHeader('X-Request-Id')?.toString() ?? 'unknown'
    }
  });
}

/**
 * Each authenticated request reloads the user from Atlas. JWT role claims are
 * not trusted for authorization, so role changes and account disablement take
 * effect immediately instead of waiting for access-token expiry.
 */
export const authenticateAtlas: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      sendAuthError(res, 401, 'UNAUTHORIZED', 'A valid access token is required.');
      return;
    }

    const decoded = jwt.verify(token, accessSecret()) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string') {
      sendAuthError(res, 401, 'UNAUTHORIZED', 'The access token is invalid.');
      return;
    }

    const user = await getAtlasDb().collection<UserDocument>('users').findOne({ _id: decoded.sub });
    if (!user) {
      sendAuthError(res, 401, 'UNAUTHORIZED', 'The account is no longer available.');
      return;
    }

    req.atlasPrincipal = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    next();
  } catch {
    sendAuthError(res, 401, 'UNAUTHORIZED', 'A valid access token is required.');
  }
};

export function requireAtlasRoleAndOwnership(
  roles: Role[],
  options: { productIdParam?: string } = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = req.atlasPrincipal;
      if (!principal) {
        sendAuthError(res, 401, 'UNAUTHORIZED', 'Sign in is required.');
        return;
      }
      if (!roles.includes(principal.role)) {
        sendAuthError(res, 403, 'FORBIDDEN', 'Your account does not have permission for this action.');
        return;
      }

      if (principal.role === 'merchant') {
        const merchant = await getAtlasDb().collection<MerchantDocument>('merchants').findOne({
          userId: principal.id
        });
        if (!merchant || merchant.status === 'rejected') {
          sendAuthError(res, 403, 'MERCHANT_ACCESS_DENIED', 'An active merchant profile is required.');
          return;
        }

        // Role and ownership are decided in the same middleware. Route handlers
        // receive this server-resolved merchantId; they never accept it from input.
        principal.merchantId = merchant._id;
        req.merchantId = merchant._id;

        if (options.productIdParam) {
          const productId = req.params[options.productIdParam];
          const ownedProduct = await getAtlasDb().collection('products').findOne({
            _id: productId,
            merchantId: merchant._id,
            managedBy: 'merchant'
          });
          if (!ownedProduct) {
            sendAuthError(res, 403, 'RESOURCE_NOT_OWNED', 'This resource does not belong to your merchant account.');
            return;
          }
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
