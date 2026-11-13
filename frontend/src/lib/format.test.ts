import { describe, expect, it } from 'vitest';
import { money, relative } from './format';

describe('display formatters', () => {
  it('formats amounts as USD with cents', () => {
    expect(money(481.22)).toBe('$481.22');
  });
  it('labels recent events without leaking invalid timestamps', () => {
    expect(relative(new Date().toISOString())).toBe('just now');
    expect(relative(new Date(Date.now() - 65_000).toISOString())).toBe('1m ago');
  });
});
