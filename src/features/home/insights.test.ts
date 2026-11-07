import { describe, it, expect } from 'vitest';
import { buildInsights, forecastMonthEnd, splitMonths } from './insights';
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
