import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authenticateAtlas, requireAtlasRoleAndOwnership } from '../src/middleware/atlas-auth.js';

const { mockGetAtlasDb } = vi.hoisted(() => ({ mockGetAtlasDb: vi.fn() }));
vi.mock('../src/infrastructure/atlas.js', () => ({ getAtlasDb: mockGetAtlasDb }));

type UserFixture = {
  _id: string;
  name: string;
  email: string;
  role: string;
  disabledAt?: Date | null;
};
type MerchantFixture = { _id: string; userId: string; status: 'pending' | 'approved' | 'rejected' };

function fakeDb(user: UserFixture | null, merchant: MerchantFixture | null = null, ownedProduct = true) {
  return {
    collection: (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => {
        if (name === 'users') return user;
        if (name === 'merchants') return merchant;
        if (name === 'products') {
          return ownedProduct && filter.merchantId === merchant?._id
            ? { _id: filter._id, merchantId: merchant?._id, managedBy: 'merchant' }
            : null;
        }
        return null;
      }
    })
  };
}

function appFor(path: string, roles: Array<'shopper'|'merchant'|'inventory_manager'|'operator'|'admin'>) {
  const app = express();
  app.get(path, authenticateAtlas, requireAtlasRoleAndOwnership(roles, { productIdParam: path.includes(':id') ? 'id' : undefined }), (req, res) => {
    res.json({ id: req.atlasPrincipal?.id, role: req.atlasPrincipal?.role, merchantId: req.merchantId });
  });
  return app;
}

const secret = 'atlas-auth-test-secret-at-least-32-characters';
function token(userId: string) {
  return jwt.sign({}, secret, { subject: userId, expiresIn: '15m' });
}

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = secret;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('Atlas server-side role and ownership middleware', () => {
  it('rejects missing access tokens with 401', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb({ _id: 'u1', name: 'Shopper', email: 'shopper@test.invalid', role: 'shopper' }));
    const response = await request(appFor('/protected', ['admin'])).get('/protected');
    expect(response.status).toBe(401);
  });

  it('uses the current database role and denies a shopper on admin routes', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb({ _id: 'u1', name: 'Shopper', email: 'shopper@test.invalid', role: 'shopper' }));
    const response = await request(appFor('/protected', ['admin'])).get('/protected').set('Authorization', 'Bearer ' + token('u1'));
    expect(response.status).toBe(403);
  });

  it('immediately rejects disabled accounts even when their JWT is still valid', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb({ _id: 'u1', name: 'Disabled', email: 'disabled@test.invalid', role: 'admin', disabledAt: new Date() }));
    const response = await request(appFor('/protected', ['admin'])).get('/protected').set('Authorization', 'Bearer ' + token('u1'));
    expect(response.status).toBe(401);
  });

  it('allows a merchant to access their own SKU only', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb(
      { _id: 'u2', name: 'Merchant', email: 'merchant@test.invalid', role: 'merchant' },
      { _id: 'm2', userId: 'u2', status: 'approved' },
      true
    ));
    const response = await request(appFor('/merchant/products/:id', ['merchant']))
      .get('/merchant/products/p-1').set('Authorization', 'Bearer ' + token('u2'));
    expect(response.status).toBe(200);
    expect(response.body.merchantId).toBe('m2');
  });

  it('returns 403 when the merchant does not own the requested SKU', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb(
      { _id: 'u2', name: 'Merchant', email: 'merchant@test.invalid', role: 'merchant' },
      { _id: 'm2', userId: 'u2', status: 'approved' },
      false
    ));
    const response = await request(appFor('/merchant/products/:id', ['merchant']))
      .get('/merchant/products/p-other').set('Authorization', 'Bearer ' + token('u2'));
    expect(response.status).toBe(403);
  });

  it('does not allow a pending merchant to mutate stock', async () => {
    mockGetAtlasDb.mockReturnValue(fakeDb(
      { _id: 'u2', name: 'Merchant', email: 'merchant@test.invalid', role: 'merchant' },
      { _id: 'm2', userId: 'u2', status: 'pending' },
      true
    ));
    const response = await request(appFor('/merchant/products/:id', ['merchant']))
      .get('/merchant/products/p-1').set('Authorization', 'Bearer ' + token('u2'));
    expect(response.status).toBe(403);
  });
});
