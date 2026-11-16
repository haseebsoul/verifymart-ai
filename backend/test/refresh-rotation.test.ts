import { describe, expect, it } from 'vitest';
import { buildRefreshRotationPipeline } from '../src/services/refresh-rotation.js';

describe('atomic refresh token rotation pipeline', () => {
  it('removes the presented token, appends its replacement and retains at most twenty sessions', () => {
    const replacement = {
      tokenHash: 'replacement-hash',
      createdAt: new Date('2026-11-16T12:00:00.000Z'),
      expiresAt: new Date('2026-11-23T12:00:00.000Z')
    };

    expect(buildRefreshRotationPipeline('presented-hash', replacement)).toEqual([{
      $set: {
        refreshSessions: {
          $slice: [{
            $concatArrays: [{
              $filter: {
                input: { $ifNull: ['$refreshSessions', []] },
                as: 'session',
                cond: { $ne: ['$$session.tokenHash', 'presented-hash'] }
              }
            }, [replacement]]
          }, -20]
        }
      }
    }]);
  });
});
