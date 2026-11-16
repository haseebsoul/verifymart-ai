import type { Document } from 'mongodb';

export interface RefreshRotationToken {
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Atomically consumes one refresh token and appends its replacement.
 * The caller must include the old token hash and expiry in the update filter,
 * then require modifiedCount === 1 so concurrent refreshes cannot both win.
 */
export function buildRefreshRotationPipeline(tokenHash: string, replacement: RefreshRotationToken): Document[] {
  return [{
    $set: {
      refreshSessions: {
        $slice: [{
          $concatArrays: [{
            $filter: {
              input: { $ifNull: ['$refreshSessions', []] },
              as: 'session',
              cond: { $ne: ['$$session.tokenHash', tokenHash] }
            }
          }, [replacement]]
        }, -20]
      }
    }
  }];
}
