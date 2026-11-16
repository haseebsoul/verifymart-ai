import { describe, expect, it } from 'vitest';
import { buildRefreshRotationPipeline } from '../src/routes-atlas-auth.js';

describe('refresh-token rotation invariants', () => {
  it('removes only the consumed token and appends one replacement in one bounded pipeline update', () => {
    const replacement = {
      tokenHash: 'replacement-hash',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-01-08T00:00:00.000Z')
    };
    const pipeline = buildRefreshRotationPipeline('consumed-hash', replacement);
    const serialized = JSON.stringify(pipeline);
    expect(serialized).toContain('$$session.tokenHash');
    expect(serialized).toContain('consumed-hash');
    expect(serialized).toContain('replacement-hash');
    expect(serialized).toContain('$concatArrays');
    expect(serialized).toContain('$slice');
    expect(serialized).toContain('-20');
  });
});
