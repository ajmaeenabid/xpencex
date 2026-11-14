import { describe, it, expect } from 'vitest';
import type { Receipt } from '../../shared/types';
import { filterReceipts, hasExpense, newestFirst, usage } from './receiptGallery';

const receipt = (id: string, createdAt: string, source: Receipt['source'], expenseId?: string): Receipt => ({
  id, uid: 'u1', type: 'image/jpeg', size: 1000, source, createdAt, ...(expenseId && { expenseId }),
});

const a = receipt('a', '2026-11-01T10:00:00.000Z', 'add', 'e1');
const b = receipt('b', '2026-11-03T10:00:00.000Z', 'chat', 'e2');
const c = receipt('c', '2026-11-02T10:00:00.000Z', 'chat'); // kept after its expense was deleted
const d = receipt('d', '2026-11-04T10:00:00.000Z', 'add', 'gone'); // its expense was deleted
const all = [a, b, c, d];
const known: Record<string, boolean> = { e1: true, e2: true, gone: false };
const exists = (id: string) => known[id];

describe('filterReceipts', () => {
  it('shows newest first', () => {
    expect(newestFirst(all).map(r => r.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(filterReceipts(all, 'all', exists).map(r => r.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('filters by where the receipt came from', () => {
    expect(filterReceipts(all, 'chat', exists).map(r => r.id)).toEqual(['b', 'c']);
    expect(filterReceipts(all, 'add', exists).map(r => r.id)).toEqual(['d', 'a']);
  });

  it('finds receipts with no expense, including ones whose expense was deleted', () => {
    expect(filterReceipts(all, 'none', exists).map(r => r.id)).toEqual(['d', 'c']);
  });

  it('does not call a receipt "no expense" while its expense is still loading', () => {
    expect(hasExpense(receipt('x', '2026-11-05T00:00:00.000Z', 'add', 'unknown'), () => undefined)).toBe(true);
  });
});

describe('usage', () => {
  it('works out the bar', () => {
    expect(usage(37)).toEqual({ used: 37, max: 100, percent: 37, nearlyFull: false });
    expect(usage(90).nearlyFull).toBe(true);
    expect(usage(120).used).toBe(100);
  });
});
