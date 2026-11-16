import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendAuditEvent, readAuditEvents } from '../src/repositories/audit.js';

const { writer, reader, connectWriter, connectReader } = vi.hoisted(() => ({
  writer: { insertOne: vi.fn() },
  reader: { find: vi.fn() },
  connectWriter: vi.fn(),
  connectReader: vi.fn()
}));

vi.mock('../src/infrastructure/atlas.js', () => ({
  connectAuditLog: connectWriter,
  connectAuditReader: connectReader
}));

afterEach(() => vi.clearAllMocks());

describe('audit principal separation', () => {
  it('appends only through the insert-only writer connection', async () => {
    connectWriter.mockResolvedValue(writer);
    writer.insertOne.mockResolvedValue({ acknowledged: true });
    await appendAuditEvent({
      actorId: 'user-1', action: 'TEST_EVENT', targetType: 'test',
      targetId: 'target-1', details: { safe: true }
    });
    expect(connectWriter).toHaveBeenCalledOnce();
    expect(writer.insertOne).toHaveBeenCalledOnce();
    expect(connectReader).not.toHaveBeenCalled();
  });

  it('reads only through the separate find-only reader connection', async () => {
    const events = [{ _id: 'aud-1', action: 'TEST_EVENT' }];
    const cursor = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue(events) };
    reader.find.mockReturnValue(cursor);
    connectReader.mockResolvedValue(reader);
    await expect(readAuditEvents({}, 50)).resolves.toEqual(events);
    expect(connectReader).toHaveBeenCalledOnce();
    expect(reader.find).toHaveBeenCalledOnce();
    expect(connectWriter).not.toHaveBeenCalled();
    expect(writer.insertOne).not.toHaveBeenCalled();
  });
});
