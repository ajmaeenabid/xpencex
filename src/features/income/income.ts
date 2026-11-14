import { startOfMonth, subMonths, format } from 'date-fns';
import type { Deposit, Expense } from '../../shared/types';
import { isCashOut } from '../accounts/cash';

// Income (chosen 2026-11-11). Money in is kept in `deposits`, as before: hand-added income, money in from chat or
// an SMS, monthly deposits, loan money and cash moved to the Cash wallet. Only REAL income counts as "earned":
// not loan money (it must be paid back) and not money moved between your own accounts.
// An income doesn't need an account: then it's only recorded, and no balance changes.

/** The fixed income categories; people can add their own (incomeCategories collection) */
export const INCOME_CATEGORIES = ['Salary', 'Business', 'Freelance', 'Tuition', 'Gift', 'Rent received', 'Other'] as const;

/** Whether a money-in counts as earned income */
export function isRealIncome(d: Pick<Deposit, 'source' | 'title'> & { transfer?: boolean }): boolean {
  if (d.transfer) return false;
  if (d.source === 'loan') return false;
  // Cash out to the Cash wallet, saved before transfers were marked
  if (d.source === 'sms' && isCashOut(d.title || '')) return false;
  return true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (iso: string, from: number, to: number) => { const t = new Date(iso).getTime(); return t >= from && t < to; };

/** Earned, spent and saved (earned minus spent, can be below zero) between two moments */
export function earnedSpentSaved(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], from: Date, to: Date) {
  const a = from.getTime(), b = to.getTime();
  const earned = round2(incomes.filter(d => isRealIncome(d) && inRange(d.date, a, b)).reduce((s, d) => s + d.amount, 0));
  const spent = round2(expenses.filter(e => inRange(e.date, a, b)).reduce((s, e) => s + e.amount, 0));
  return { earned, spent, saved: round2(earned - spent) };
}

/** This calendar month so far */
export function thisMonth(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], now = new Date()) {
  return earnedSpentSaved(incomes, expenses, startOfMonth(now), new Date(now.getTime() + 1));
}

/** Last full calendar month, for the month-end suggestion */
export function lastMonth(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], now = new Date()) {
  return earnedSpentSaved(incomes, expenses, startOfMonth(subMonths(now, 1)), startOfMonth(now));
}

/** Earned and spent for each of the last `count` months, oldest first, for the Reports chart */
export function monthlySeries(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], count = 6, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const start = startOfMonth(subMonths(now, count - 1 - i));
    const end = startOfMonth(subMonths(now, count - 2 - i));
    const { earned, spent } = earnedSpentSaved(incomes, expenses, start, end);
    return { month: format(start, 'yyyy-MM'), earned, spent };
  });
}
