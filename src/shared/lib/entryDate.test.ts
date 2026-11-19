import { describe, expect, it } from 'vitest';
import { entryDate } from './entryDate';

describe('entryDate', () => {
  const now = new Date(2026, 10, 19, 22, 18);

  it('gives today the current time, so it sorts above earlier entries', () => {
    expect(entryDate('2026-11-19', now)).toBe(now.toISOString());
  });

  it('gives another day midday', () => {
    expect(entryDate('2026-11-17', now)).toBe(new Date(2026, 10, 17, 12).toISOString());
  });

  it('keeps a full date and time, and uses now when there is no day', () => {
    expect(entryDate('2026-11-17T08:30:00.000Z', now)).toBe('2026-11-17T08:30:00.000Z');
    expect(entryDate(undefined, now)).toBe(now.toISOString());
  });
});
