// This money month against the same month last year (chosen 2026-11-18). The person can compare with the same days
// of that month, or with the whole month. Plain rules, no database calls, so they can be tested.

import { addDays } from 'date-fns';
import { moneyMonth, moneyMonthDay } from '../../shared/lib/moneyMonth';
import type { Deposit, Expense } from '../../shared/types';
import { sumByCategory } from '../home/insights';
import { earnedSpentSaved, isRealIncome } from '../income/income';

export type YearMode = 'sameDays' | 'wholeMonth';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The whole money month a year before this one */
export const lastYearMonth = (now: Date, startDay = 1) => moneyMonth(now, startDay, -12);

/** The part of last year's month to compare with: as many days as have passed this month, or all of it */
export function yearWindow(now: Date, startDay = 1, mode: YearMode = 'sameDays'): { start: Date; end: Date } {
  const whole = lastYearMonth(now, startDay);
  if (mode === 'wholeMonth') return whole;
  const sameDay = addDays(whole.start, moneyMonthDay(now, startDay).day);
  return { start: whole.start, end: sameDay < whole.end ? sameDay : whole.end };
}

export interface YearCategory {
  category: string;
  now: number;
  before: number;
  change: number | null; // null when there was nothing to compare with
}

/** Spent, earned, saved and each category, now against last year */
export function compareYears({ expenses, incomes, lastExpenses, lastIncomes, now = new Date(), startDay = 1, mode = 'sameDays' }: {
  expenses: Expense[];
  incomes: Deposit[];
  lastExpenses: Expense[];
  lastIncomes: Deposit[];
  now?: Date;
  startDay?: number;
  mode?: YearMode;
}) {
  const from = moneyMonth(now, startDay).start;
  const to = new Date(now.getTime() + 1);
  const window = yearWindow(now, startDay, mode);
  const inside = (date: string, start: Date, end: Date) => { const t = new Date(date).getTime(); return t >= start.getTime() && t < end.getTime(); };

  const thisByCategory = sumByCategory(expenses.filter(e => inside(e.date, from, to)));
  const lastByCategory = sumByCategory(lastExpenses.filter(e => inside(e.date, window.start, window.end)));
  const categories: YearCategory[] = Object.keys({ ...thisByCategory, ...lastByCategory })
    .map(category => {
      const nowAmount = round2(thisByCategory[category] || 0);
      const before = round2(lastByCategory[category] || 0);
      return { category, now: nowAmount, before, change: before > 0 ? (nowAmount - before) / before : null };
    })
    .sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before));

  return {
    window,
    current: earnedSpentSaved(incomes, expenses, from, to),
    before: earnedSpentSaved(lastIncomes, lastExpenses, window.start, window.end),
    categories,
    // Anything at all in last year's month, even outside the days being compared
    hasHistory: lastExpenses.length > 0 || lastIncomes.some(isRealIncome),
  };
}
