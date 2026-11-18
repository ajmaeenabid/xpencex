import { describe, it, expect } from 'vitest';
import { buildInsights, forecastMonthEnd, splitMonths } from './insights';
import { compareByCategory } from './insights';
import { Expense } from '../../shared/types';

const NOW = new Date(2026, 9, 15, 12); // 15 Oct 2026, 31-day month
const fmt = (n: number) => `৳${Math.round(n)}`;
let id = 0;
const exp = (day: Date, amount: number, category = 'Food', title = 'x'): Expense =>
  ({ id: String(id++), uid: 'u', title, amount, category, date: day.toISOString() });

describe('forecastMonthEnd', () => {
  it('projects linearly to the end of the month', () => {
    expect(forecastMonthEnd(1500, NOW)).toBeCloseTo(3100);
  });
});

describe('splitMonths', () => {
  it('compares against the same period of last month', () => {
    const { thisMonth, lastMonthToDate } = splitMonths([
      exp(new Date(2026, 9, 2), 10),
      exp(new Date(2026, 8, 10), 20), // within first 15 days of Sept
      exp(new Date(2026, 8, 25), 30), // later in Sept: excluded
    ], NOW);
    expect(thisMonth.map(e => e.amount)).toEqual([10]);
    expect(lastMonthToDate.map(e => e.amount)).toEqual([20]);
  });
});

describe('buildInsights', () => {
  it('warns when the pace will exceed the budget', () => {
    const insights = buildInsights([exp(new Date(2026, 9, 10), 3000)], 5000, {}, fmt, NOW);
    expect(insights[0]).toMatchObject({ id: 'budget', tone: 'danger', title: 'On track to overspend' });
  });

  it('reports on-track spending as good', () => {
    const insights = buildInsights([exp(new Date(2026, 9, 10), 1000)], 5000, {}, fmt, NOW);
    expect(insights.find(i => i.id === 'budget')?.tone).toBe('good');
  });

  it('flags exceeded category budgets and large month-over-month increases', () => {
    const insights = buildInsights([
      exp(new Date(2026, 9, 5), 900, 'Food'),
      exp(new Date(2026, 8, 5), 400, 'Food'),
    ], 0, { Food: 800 }, fmt, NOW);
    const ids = insights.map(i => i.id);
    expect(ids).toContain('cat-over-Food');
    expect(insights.find(i => i.id === 'trend-Food')?.title).toBe('Food up 125%');
  });

  it('returns nothing for an empty month', () => {
    expect(buildInsights([], 5000, {}, fmt, NOW)).toEqual([]);
  });
});


describe('compareByCategory', () => {
  it('compares this month so far with the same days of last month', () => {
    const now = new Date(2026, 10, 10, 12); // 10 Nov
    const e = (category: string, amount: number, date: Date) => ({ id: 'x', uid: 'u', title: 't', category, amount, date: date.toISOString() });
    const rows = compareByCategory([
      e('Food', 1200, new Date(2026, 10, 5)),
      e('Food', 1000, new Date(2026, 9, 5)),
      e('Food', 5000, new Date(2026, 9, 25)), // later in October: not compared yet
      e('Transport', 300, new Date(2026, 10, 2)),
    ], now);
    const food = rows.find(r => r.category === 'Food')!;
    expect(food).toEqual({ category: 'Food', now: 1200, before: 1000, change: 0.2 });
    expect(rows.find(r => r.category === 'Transport')!.change).toBeNull();
  });
});

describe('insights on a money month that starts on the 25th', () => {
  it('counts only spending since the start day, and projects over that month', async () => {
    const { splitMonths, forecastMonthEnd } = await import('./insights');
    const now = new Date('2026-12-04T12:00:00'); // day 10 of 25 Nov - 24 Dec
    const e = (date: string, amount: number) => ({ id: date, uid: 'u', title: 'x', category: 'Food', amount, date: `${date}T12:00:00.000Z` }) as Expense;
    const { thisMonth, lastMonthToDate } = splitMonths([e('2026-11-26', 100), e('2026-11-20', 50), e('2026-10-27', 30)], now, 25);
    expect(thisMonth.map(x => x.amount)).toEqual([100]);
    expect(lastMonthToDate.map(x => x.amount)).toEqual([30]);
    expect(forecastMonthEnd(100, now, 25)).toBe(300); // 100 in 10 days, 30-day month
  });
});
