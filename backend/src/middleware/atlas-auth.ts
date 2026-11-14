import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { MerchantDocument, ProductDocument, Role, UserDocument } from '../repositories/contracts.js';

export interface AtlasPrincipal {
  id: string;
  name: string;
  email: string;
  role: Role;
  merchantId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    atlasPrincipal?: AtlasPrincipal;
    merchantId?: string;
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
 * Reloading the user on every request makes the database role authoritative.
 * A demotion or role change takes effect immediately, not after token expiry.
 */
export const authenticateAtlas: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    sendAuthError(res, 401, 'UNAUTHORIZED', 'A valid access token is required.');
    return;
  }

  let subject: string;
  try {
    const verified = jwt.verify(token, accessSecret());
    if (typeof verified === 'string' || typeof verified.sub !== 'string') {
      sendAuthError(res, 401, 'UNAUTHORIZED', 'The access token is invalid.');
      return;
    }
    subject = verified.sub;
  } catch {
    sendAuthError(res, 401, 'UNAUTHORIZED', 'A valid access token is required.');
    return;
  }

  try {
    const user = await getAtlasDb().collection<UserDocument>('users').findOne({ _id: subject });
    if (!user || user.disabledAt) {
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
  } catch (error) {
    next(error);
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
        if (!merchant) {
          sendAuthError(res, 403, 'MERCHANT_ACCESS_DENIED', 'An active merchant profile is required.');
          return;
        }
        if (options.productIdParam && merchant.status !== 'approved') {
          sendAuthError(res, 403, 'MERCHANT_APPROVAL_REQUIRED', 'Merchant approval is required before changing published stock.');
          return;
        }

        // Role and ownership are evaluated in one middleware. Route handlers
        // consume the server-resolved merchantId, never a browser-supplied value.
        principal.merchantId = merchant._id;
        req.merchantId = merchant._id;

        if (options.productIdParam) {
          const productId = req.params[options.productIdParam];
          if (!productId) {
            sendAuthError(res, 403, 'RESOURCE_NOT_OWNED', 'This resource does not belong to your merchant account.');
            return;
          }
          const ownedProduct = await getAtlasDb().collection<ProductDocument>('products').findOne({
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
