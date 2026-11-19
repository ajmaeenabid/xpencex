import { format } from 'date-fns';
import { lastMoneyMonths, moneyMonth } from '../../shared/lib/moneyMonth';
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

/** This money month so far (`startDay`: Profile > Month starts on) */
export function thisMonth(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], now = new Date(), startDay = 1) {
  return earnedSpentSaved(incomes, expenses, moneyMonth(now, startDay).start, new Date(now.getTime() + 1));
}

/** The last full money month, for the month-end suggestion */
export function lastMonth(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], now = new Date(), startDay = 1) {
  const { start, end } = moneyMonth(now, startDay, -1);
  return earnedSpentSaved(incomes, expenses, start, end);
}

/** Earned and spent for each of the last `count` money months, oldest first, for the Reports chart */
export function monthlySeries(incomes: Deposit[], expenses: Pick<Expense, 'amount' | 'date'>[], count = 6, now = new Date(), startDay = 1) {
  return lastMoneyMonths(count, now, startDay).map(({ start, end }) => {
    const { earned, spent } = earnedSpentSaved(incomes, expenses, start, end);
    return { month: format(start, 'yyyy-MM'), earned, spent };
  });
}

/**
 * The average saved per month and the best month, from a monthlySeries. The newest month is still running and
 * months with nothing recorded say nothing about saving, so both are left out. Null until one full month exists.
 */
export function savingsSummary(series: { month: string; earned: number; spent: number }[]) {
  const full = series.slice(0, -1).filter(m => m.earned > 0 || m.spent > 0).map(m => ({ month: m.month, saved: round2(m.earned - m.spent) }));
  if (full.length === 0) return null;
  const top = full.reduce((a, m) => (m.saved > a.saved ? m : a), full[0]);
  // A "best month" that still lost money would read as praise, so there is none until some month saved
  const best = top.saved > 0 ? top : null;
  return { average: round2(full.reduce((sum, m) => sum + m.saved, 0) / full.length), best };
}
