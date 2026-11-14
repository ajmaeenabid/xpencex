import { startOfMonth, startOfYear, subMonths } from 'date-fns';
import type { Deposit, Expense } from '../../shared/types';

// The Transactions filter sheet (chosen 2026-11-11): account, date range, type, amount, receipt and feeling.
// Plain functions, so they are tested. The search box and category chips are applied as before.

export type DatePreset = 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear' | 'custom';

export interface TransactionFilters {
  accountId: string | null; // null: every account
  date: { preset: DatePreset; from?: string; to?: string } | null; // custom: 'yyyy-MM-dd' days; null: the normal recent window
  type: 'all' | 'expense' | 'income';
  minAmount: number | null;
  maxAmount: number | null;
  receiptOnly: boolean;
  feeling: 'worth' | 'regret' | null;
}

export const NO_FILTERS: TransactionFilters = {
  accountId: null, date: null, type: 'all', minAmount: null, maxAmount: null, receiptOnly: false, feeling: null,
};

/** The moments a date filter covers: from (included) to (not included), as stored on expenses */
export function dateBounds(date: NonNullable<TransactionFilters['date']>, now = new Date()): { from: string; to: string } | null {
  const iso = (d: Date) => d.toISOString();
  switch (date.preset) {
    case 'thisMonth': return { from: iso(startOfMonth(now)), to: iso(startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1))) };
    case 'lastMonth': return { from: iso(startOfMonth(subMonths(now, 1))), to: iso(startOfMonth(now)) };
    case 'last3': return { from: iso(startOfMonth(subMonths(now, 2))), to: iso(startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1))) };
    case 'thisYear': return { from: iso(startOfYear(now)), to: iso(new Date(now.getFullYear() + 1, 0, 1)) };
    case 'custom': {
      if (!date.from || !date.to) return null;
      const from = new Date(`${date.from}T00:00:00`);
      const to = new Date(`${date.to}T00:00:00`);
      to.setDate(to.getDate() + 1); // the "to" day is included
      return from < to ? { from: iso(from), to: iso(to) } : null;
    }
  }
}

const inAmount = (amount: number, f: TransactionFilters) =>
  (f.minAmount === null || amount >= f.minAmount) && (f.maxAmount === null || amount <= f.maxAmount);

export function expenseMatches(e: Expense, f: TransactionFilters, bounds: { from: string; to: string } | null) {
  if (f.type === 'income') return false;
  if (f.accountId && e.accountId !== f.accountId) return false;
  if (bounds && (e.date < bounds.from || e.date >= bounds.to)) return false;
  if (!inAmount(e.amount, f)) return false;
  if (f.receiptOnly && !e.receiptId) return false;
  if (f.feeling && e.feeling !== f.feeling) return false;
  return true;
}

/** Income has no receipt or feeling, so those filters leave it out */
export function incomeMatches(d: Deposit, f: TransactionFilters, bounds: { from: string; to: string } | null) {
  if (f.type === 'expense' || f.receiptOnly || f.feeling) return false;
  if (f.accountId && d.accountId !== f.accountId) return false;
  if (bounds && (d.date < bounds.from || d.date >= bounds.to)) return false;
  return inAmount(d.amount, f);
}

/** How many filters are on, for the badge on the filter button */
export function activeCount(f: TransactionFilters) {
  return [f.accountId, f.date, f.type !== 'all' || null, f.minAmount !== null || f.maxAmount !== null || null, f.receiptOnly || null, f.feeling]
    .filter(Boolean).length;
}

