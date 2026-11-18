import { describe, it, expect } from 'vitest';
import type { Deposit, Expense } from '../../shared/types';
import { compareYears, lastYearMonth, yearWindow } from './yearCompare';

const spend = (date: Date, amount: number, category = 'Food') =>
  ({ id: `${date.getTime()}${amount}`, uid: 'u', title: 'x', amount, category, date: date.toISOString() }) as Expense;
const earn = (date: Date, amount: number, extra: Partial<Deposit> = {}) =>
  ({ id: `${date.getTime()}${amount}`, uid: 'u', amount, date: date.toISOString(), ...extra }) as Deposit;

const now = new Date(2026, 10, 18, 10); // 18 Nov 2026

describe('which days of last year', () => {
  it('finds the same month a year ago', () => {
    const { start, end } = lastYearMonth(now);
    expect(start).toEqual(new Date(2025, 10, 1));
    expect(end).toEqual(new Date(2025, 11, 1));
  });

  it('covers as many days as have passed, including today', () => {
    const { start, end } = yearWindow(now, 1, 'sameDays');
    expect(start).toEqual(new Date(2025, 10, 1));
    expect(end).toEqual(new Date(2025, 10, 19));
  });

  it('can cover the whole month', () => {
    expect(yearWindow(now, 1, 'wholeMonth').end).toEqual(new Date(2025, 11, 1));
  });

  it('follows the day the money month starts', () => {
    const { start, end } = yearWindow(new Date(2026, 10, 27, 10), 25, 'sameDays');
    expect(start).toEqual(new Date(2025, 10, 25));
    expect(end).toEqual(new Date(2025, 10, 28));
  });

  it('never runs past the end of a shorter month', () => {
    const { end } = yearWindow(new Date(2028, 1, 29, 10), 1, 'sameDays');
    expect(end).toEqual(new Date(2027, 2, 1));
  });
});

describe('comparing with last year', () => {
  const expenses = [spend(new Date(2026, 10, 5), 1200), spend(new Date(2026, 10, 6), 300, 'Travel'), spend(new Date(2026, 9, 30), 999)];
  const incomes = [earn(new Date(2026, 10, 1), 5000)];
  const lastExpenses = [spend(new Date(2025, 10, 5), 1000), spend(new Date(2025, 10, 25), 800)];
  const lastIncomes = [earn(new Date(2025, 10, 1), 4000), earn(new Date(2025, 10, 2), 700, { source: 'loan' })];

  it('compares the same days, leaving out the later ones', () => {
    const r = compareYears({ expenses, incomes, lastExpenses, lastIncomes, now });
    expect(r.current).toEqual({ earned: 5000, spent: 1500, saved: 3500 });
    expect(r.before).toEqual({ earned: 4000, spent: 1000, saved: 3000 });
  });

  it('can compare with the whole month', () => {
    const r = compareYears({ expenses, incomes, lastExpenses, lastIncomes, now, mode: 'wholeMonth' });
    expect(r.before.spent).toBe(1800);
  });

  it('shows each category and how it changed', () => {
    const { categories } = compareYears({ expenses, incomes, lastExpenses, lastIncomes, now });
    expect(categories[0]).toEqual({ category: 'Food', now: 1200, before: 1000, change: 0.2 });
    expect(categories[1]).toEqual({ category: 'Travel', now: 300, before: 0, change: null });
  });

  it('knows when there is no history from a year ago', () => {
    expect(compareYears({ expenses, incomes, lastExpenses: [], lastIncomes: [], now }).hasHistory).toBe(false);
    expect(compareYears({ expenses, incomes, lastExpenses: [], lastIncomes: [earn(new Date(2025, 10, 2), 700, { source: 'loan' })], now }).hasHistory).toBe(false);
    expect(compareYears({ expenses, incomes, lastExpenses, lastIncomes: [], now }).hasHistory).toBe(true);
  });
});
