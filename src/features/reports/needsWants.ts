// Needs and wants (chosen 2026-11-18): each category counts as a need or a want, and the person can move any of them.
// Their own categories stay "not sorted" until they choose, so the totals are never quietly wrong.
// Plain rules, no database calls, so they can be tested.

import type { Expense } from '../../shared/types';
import { splitMonths, sumByCategory } from '../home/insights';

export type SpendingType = 'need' | 'want';
export type SpendingGroup = SpendingType | 'unsorted';
export type SpendingTypes = Record<string, SpendingType>;

export const DEFAULT_SPENDING_TYPES: SpendingTypes = {
  Food: 'need', Transport: 'need', Bills: 'need', Health: 'need', Education: 'need', Utilities: 'need', Housing: 'need', 'Loan payment': 'need',
  Shopping: 'want', Entertainment: 'want', Travel: 'want', 'Personal Care': 'want',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The person's own choice first, then the starting list */
export const groupOf = (category: string, own: SpendingTypes = {}): SpendingGroup =>
  own[category] ?? DEFAULT_SPENDING_TYPES[category] ?? 'unsorted';

export interface GroupTotal {
  amount: number;
  percent: number; // of everything spent
  categories: { category: string; amount: number }[]; // biggest first
}

export type GroupTotals = Record<SpendingGroup, GroupTotal> & { total: number };

export function groupTotals(expenses: Pick<Expense, 'category' | 'amount'>[], own: SpendingTypes = {}): GroupTotals {
  const byCategory = sumByCategory(expenses as Expense[]);
  const total = round2(Object.values(byCategory).reduce((sum, n) => sum + n, 0));
  const build = (group: SpendingGroup): GroupTotal => {
    const categories = Object.entries(byCategory)
      .filter(([category]) => groupOf(category, own) === group)
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);
    const amount = round2(categories.reduce((sum, c) => sum + c.amount, 0));
    return { amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0, categories };
  };
  return { need: build('need'), want: build('want'), unsorted: build('unsorted'), total };
}

/** How much a group moved against last month: 0.2 is 20% more. Null when last month had nothing to compare with. */
export const groupChange = (now: number, before: number) => (before > 0 ? (now - before) / before : null);

/** This money month so far, against the same days of last month */
export function compareGroups(expenses: Expense[], now = new Date(), startDay = 1, own: SpendingTypes = {}) {
  const { thisMonth, lastMonthToDate } = splitMonths(expenses, now, startDay);
  return { current: groupTotals(thisMonth, own), before: groupTotals(lastMonthToDate, own) };
}
