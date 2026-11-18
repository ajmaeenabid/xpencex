import { describe, it, expect } from 'vitest';
import type { Expense } from '../../shared/types';
import { compareGroups, groupChange, groupOf, groupTotals } from './needsWants';

const spend = (category: string, amount: number, date = '2026-11-05T12:00:00.000Z') =>
  ({ id: `${category}${amount}`, uid: 'u', title: 'x', category, amount, date }) as Expense;

describe('sorting categories', () => {
  it('starts with the usual needs and wants', () => {
    expect(groupOf('Bills')).toBe('need');
    expect(groupOf('Transport')).toBe('need');
    expect(groupOf('Shopping')).toBe('want');
    expect(groupOf('Travel')).toBe('want');
  });

  it('leaves the person\'s own categories and Other not sorted', () => {
    expect(groupOf('Pets')).toBe('unsorted');
    expect(groupOf('Other')).toBe('unsorted');
  });

  it('follows the person\'s choice', () => {
    expect(groupOf('Pets', { Pets: 'want' })).toBe('want');
    expect(groupOf('Shopping', { Shopping: 'need' })).toBe('need');
  });
});

describe('adding up the groups', () => {
  const totals = groupTotals([spend('Bills', 600), spend('Food', 200), spend('Shopping', 150), spend('Pets', 50)]);

  it('gives each group its amount and share', () => {
    expect(totals.total).toBe(1000);
    expect(totals.need).toMatchObject({ amount: 800, percent: 80 });
    expect(totals.want).toMatchObject({ amount: 150, percent: 15 });
    expect(totals.unsorted).toMatchObject({ amount: 50, percent: 5 });
  });

  it('lists the biggest categories first', () => {
    expect(totals.need.categories.map(c => c.category)).toEqual(['Bills', 'Food']);
  });

  it('adds up one category across entries', () => {
    expect(groupTotals([spend('Food', 100), spend('Food', 50.5)]).need.categories).toEqual([{ category: 'Food', amount: 150.5 }]);
  });

  it('copes with no spending', () => {
    expect(groupTotals([])).toMatchObject({ total: 0, need: { amount: 0, percent: 0 } });
  });
});

describe('comparing with last month', () => {
  it('compares the same days of each month', () => {
    const now = new Date(2026, 10, 10, 12);
    const expenses = [
      spend('Bills', 300, new Date(2026, 10, 5).toISOString()),
      spend('Bills', 200, new Date(2026, 9, 5).toISOString()),
      spend('Bills', 999, new Date(2026, 9, 25).toISOString()),
    ];
    const { current, before } = compareGroups(expenses, now);
    expect(current.need.amount).toBe(300);
    expect(before.need.amount).toBe(200);
    expect(groupChange(current.need.amount, before.need.amount)).toBe(0.5);
  });

  it('has no change when last month had nothing', () => {
    expect(groupChange(100, 0)).toBeNull();
  });
});
