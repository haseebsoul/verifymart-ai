import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writer, reader } = vi.hoisted(() => ({
  writer: vi.fn(),
  reader: vi.fn()
}));

vi.mock('../src/infrastructure/atlas.js', () => ({
  connectAuditLog: writer,
  connectAuditReader: reader
}));

import { appendAuditEvent, readAuditEvents } from '../src/repositories/audit.js';

describe('least-privilege audit repositories', () => {
  beforeEach(() => vi.resetAllMocks());

  it('appends events through the insert-only writer and never uses the reader', async () => {
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    writer.mockResolvedValue({ insertOne });

    await appendAuditEvent({
      actorId: 'usr_operator',
      action: 'ESCROW_RELEASED',
      targetType: 'order',
      targetId: 'ord_123',
      details: { simulated: true }
    });

    expect(writer).toHaveBeenCalledOnce();
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'usr_operator',
      action: 'ESCROW_RELEASED',
      targetType: 'order',
      targetId: 'ord_123'
    }));
    expect(reader).not.toHaveBeenCalled();
  });

  it('queries events through the find-only reader and clamps result limits', async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const sort = vi.fn().mockReturnValue({ limit });
    const find = vi.fn().mockReturnValue({ sort });
    reader.mockResolvedValue({ find });

    await readAuditEvents({ action: 'ESCROW_RELEASED' }, 900);

    expect(reader).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledWith({ action: 'ESCROW_RELEASED' });
    expect(sort).toHaveBeenCalledWith({ at: -1 });
    expect(limit).toHaveBeenCalledWith(500);
    expect(toArray).toHaveBeenCalledOnce();
    expect(writer).not.toHaveBeenCalled();
  });

  it('uses a safe minimum for invalid or zero limits', async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const sort = vi.fn().mockReturnValue({ limit });
    reader.mockResolvedValue({ find: vi.fn().mockReturnValue({ sort }) });

    await readAuditEvents({}, 0);

    expect(limit).toHaveBeenCalledWith(1);
  });
});
