import { describe, it, expect } from 'vitest';
import type { Deposit, Expense } from '../../shared/types';
import { NO_FILTERS, activeCount, dateBounds, expenseMatches, incomeMatches } from './transactionFilters';

const now = new Date(2026, 10, 11, 15); // 11 Nov 2026
const exp = (extra: Partial<Expense> = {}): Expense => ({
  id: 'e', uid: 'u', title: 'Lunch', amount: 450, category: 'Food', date: new Date(2026, 10, 5, 12).toISOString(), accountId: 'bkash', ...extra,
});
const inc = (extra: Partial<Deposit> = {}): Deposit => ({ id: 'd', uid: 'u', amount: 30000, date: new Date(2026, 10, 1, 12).toISOString(), accountId: 'bank', ...extra });

describe('dateBounds', () => {
  it('works out the presets', () => {
    const last = dateBounds({ preset: 'lastMonth' }, now)!;
    expect(new Date(last.from).getMonth()).toBe(9);
    expect(new Date(last.to).getMonth()).toBe(10);
    const year = dateBounds({ preset: 'thisYear' }, now)!;
    expect(new Date(year.from).getFullYear()).toBe(2026);
    expect(new Date(year.to).getFullYear()).toBe(2027);
  });

  it('includes the last day of a custom range, and refuses a backwards one', () => {
    const r = dateBounds({ preset: 'custom', from: '2026-11-01', to: '2026-11-05' }, now)!;
    expect(exp().date < r.to).toBe(true); // 5 Nov at noon is inside
    expect(dateBounds({ preset: 'custom', from: '2026-11-05', to: '2026-11-01' }, now)).toBeNull();
    expect(dateBounds({ preset: 'custom', from: '2026-11-05' }, now)).toBeNull();
  });
});

describe('matching', () => {
  it('lets everything through with no filters', () => {
    expect(expenseMatches(exp(), NO_FILTERS, null)).toBe(true);
    expect(incomeMatches(inc(), NO_FILTERS, null)).toBe(true);
  });

  it('filters by type, account and amount', () => {
    expect(expenseMatches(exp(), { ...NO_FILTERS, type: 'income' }, null)).toBe(false);
    expect(incomeMatches(inc(), { ...NO_FILTERS, type: 'expense' }, null)).toBe(false);
    expect(expenseMatches(exp(), { ...NO_FILTERS, accountId: 'bank' }, null)).toBe(false);
    expect(incomeMatches(inc(), { ...NO_FILTERS, accountId: 'bank' }, null)).toBe(true);
    expect(expenseMatches(exp(), { ...NO_FILTERS, minAmount: 500 }, null)).toBe(false);
    expect(expenseMatches(exp(), { ...NO_FILTERS, minAmount: 100, maxAmount: 450 }, null)).toBe(true);
  });

  it('receipt and feeling filters show only matching expenses, never income', () => {
    expect(expenseMatches(exp({ receiptId: 'r1' }), { ...NO_FILTERS, receiptOnly: true }, null)).toBe(true);
    expect(expenseMatches(exp(), { ...NO_FILTERS, receiptOnly: true }, null)).toBe(false);
    expect(expenseMatches(exp({ feeling: 'regret' }), { ...NO_FILTERS, feeling: 'regret' }, null)).toBe(true);
    expect(incomeMatches(inc(), { ...NO_FILTERS, feeling: 'worth' }, null)).toBe(false);
  });

  it('filters by date range', () => {
    const lastMonth = dateBounds({ preset: 'lastMonth' }, now);
    expect(expenseMatches(exp(), NO_FILTERS, lastMonth)).toBe(false);
    expect(expenseMatches(exp({ date: new Date(2026, 9, 20).toISOString() }), NO_FILTERS, lastMonth)).toBe(true);
  });
});

describe('activeCount', () => {
  it('counts the filters that are on', () => {
    expect(activeCount(NO_FILTERS)).toBe(0);
    expect(activeCount({ ...NO_FILTERS, accountId: 'a', type: 'income', minAmount: 5, receiptOnly: true })).toBe(4);
  });
});
