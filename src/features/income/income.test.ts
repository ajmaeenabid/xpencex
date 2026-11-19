import { describe, it, expect } from 'vitest';
import type { Deposit } from '../../shared/types';
import { earnedSpentSaved, isRealIncome, lastMonth, monthlySeries, savingsSummary, thisMonth } from './income';

describe('savings summary', () => {
  const m = (month: string, earned: number, spent: number) => ({ month, earned, spent });

  it('averages the full months and finds the best one', () => {
    const series = [m('2026-08', 1000, 400), m('2026-09', 1000, 1300), m('2026-10', 2000, 500), m('2026-11', 9000, 0)];
    expect(savingsSummary(series)).toEqual({ average: 600, best: { month: '2026-10', saved: 1500 } });
  });

  it('has no best month while every month lost money', () => {
    expect(savingsSummary([m('2026-09', 0, 200), m('2026-10', 100, 300), m('2026-11', 0, 0)])).toEqual({ average: -200, best: null });
  });

  it('skips months with nothing recorded', () => {
    expect(savingsSummary([m('2026-08', 0, 0), m('2026-09', 500, 100), m('2026-10', 0, 0)])?.average).toBe(400);
  });

  it('waits for one full month', () => {
    expect(savingsSummary([m('2026-11', 500, 100)])).toBeNull();
    expect(savingsSummary([m('2026-10', 0, 0), m('2026-11', 500, 100)])).toBeNull();
  });
});

const dep = (amount: number, date: string, extra: Partial<Deposit> & { transfer?: boolean } = {}): Deposit =>
  ({ id: 'd', uid: 'u', accountId: 'a', accountName: 'A', amount, date, ...extra });

describe('isRealIncome', () => {
  it('counts income added by hand, from chat or SMS, and monthly deposits', () => {
    expect(isRealIncome({ source: 'manual' })).toBe(true);
    expect(isRealIncome({ source: 'chat' })).toBe(true);
    expect(isRealIncome({ source: 'monthly' })).toBe(true);
    expect(isRealIncome({ source: 'sms', title: 'bKash Received Money' })).toBe(true);
    expect(isRealIncome({})).toBe(true); // old monthly deposits have no source
  });

  it('leaves out loan money and money moved between your own accounts', () => {
    expect(isRealIncome({ source: 'loan' })).toBe(false);
    expect(isRealIncome({ source: 'sms', title: 'Cash Out' })).toBe(false);
    expect(isRealIncome({ source: 'manual', transfer: true })).toBe(false);
  });
});

describe('earned, spent, saved', () => {
  const now = new Date(2026, 10, 20, 12); // 20 Nov 2026
  const incomes = [
    dep(30000, new Date(2026, 10, 1).toISOString(), { source: 'manual' }),
    dep(5000, new Date(2026, 10, 5).toISOString(), { source: 'loan' }), // not earned
    dep(28000, new Date(2026, 9, 1).toISOString(), { source: 'monthly' }),
  ];
  const expenses = [
    { amount: 12000, date: new Date(2026, 10, 10).toISOString() },
    { amount: 30000, date: new Date(2026, 9, 15).toISOString() },
  ];

  it('works out this month so far', () => {
    expect(thisMonth(incomes, expenses, now)).toEqual({ earned: 30000, spent: 12000, saved: 18000 });
  });

  it('works out last month, which can be below zero', () => {
    expect(lastMonth(incomes, expenses, now)).toEqual({ earned: 28000, spent: 30000, saved: -2000 });
  });

  it('builds the monthly chart, oldest first', () => {
    const series = monthlySeries(incomes, expenses, 2, now);
    expect(series).toEqual([
      { month: '2026-10', earned: 28000, spent: 30000 },
      { month: '2026-11', earned: 30000, spent: 12000 },
    ]);
  });

  it('only counts what falls between the two moments', () => {
    expect(earnedSpentSaved(incomes, expenses, new Date(2026, 10, 2), new Date(2026, 10, 9)).earned).toBe(0);
  });
});
