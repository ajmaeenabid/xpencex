import { describe, it, expect } from 'vitest';
import { normalizeExpense } from './expense';
import { dueOccurrences } from './recurring';
import { toCSV } from '../reports/reportExport';

describe('normalizeExpense', () => {
  it('converts date-only strings and string amounts', () => {
    const r = normalizeExpense({ title: 'Lunch', amount: '৳1,250.5', category: 'Food', date: '2026-10-23' });
    expect(r).toMatchObject({ title: 'Lunch', amount: 1250.5, category: 'Food' });
    expect(r!.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rejects missing titles and non-positive amounts', () => {
    expect(normalizeExpense({ title: '', amount: 10 })).toBeNull();
    expect(normalizeExpense({ title: 'x', amount: 0 })).toBeNull();
    expect(normalizeExpense({ title: 'x', amount: 'abc' })).toBeNull();
    expect(normalizeExpense(null)).toBeNull();
  });

  it('falls back to now for invalid dates and Other for missing category', () => {
    const r = normalizeExpense({ title: 'x', amount: 5, date: 'yesterday-ish' });
    expect(r!.category).toBe('Other');
    expect(Math.abs(new Date(r!.date).getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('dueOccurrences', () => {
  it('returns every missed monthly occurrence and the next future date', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const { due, next } = dueOccurrences('2026-08-01T00:00:00.000Z', 'monthly', now);
    expect(due).toHaveLength(3);
    expect(new Date(next).getTime()).toBeGreaterThan(now.getTime());
  });

  it('caps the number of occurrences', () => {
    const { due } = dueOccurrences('2020-01-01T00:00:00.000Z', 'weekly', new Date('2026-01-01'), 24);
    expect(due).toHaveLength(24);
  });
});

describe('toCSV', () => {
  it('escapes quotes/commas and neutralises formula injection', () => {
    const csv = toCSV([
      { id: '1', uid: 'u', title: 'Pizza, "large"', amount: 12, category: 'Food', date: '2026-10-01T10:00:00.000Z' },
      { id: '2', uid: 'u', title: '=HYPERLINK("x")', amount: 1, category: 'Other', date: '2026-10-02T10:00:00.000Z' },
    ], 'BDT');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Title,Category,Amount (BDT),Paid From,Notes');
    expect(lines[1]).toContain('"Pizza, ""large"""');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
