import { describe, it, expect } from 'vitest';
import { regretSummary } from './regret';

const now = new Date(2026, 10, 20, 12); // 20 Nov 2026, local time
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
const r = (day: number, hour: number, category = 'Food', amount = 100) => ({ amount, date: at(day, hour), createdAt: at(day, hour), category, feeling: 'regret' as const });

describe('worth it or regret', () => {
  it("adds up this month's regrets and worth-it purchases", () => {
    const s = regretSummary([
      r(3, 12, 'Food', 250),
      { amount: 400, date: at(4, 12), category: 'Books', feeling: 'worth' },
      { amount: 999, date: new Date(2026, 9, 4).toISOString(), category: 'Food', feeling: 'regret' }, // last month
      { amount: 50, date: at(5, 12), category: 'Food' }, // not tagged
    ], [], now);
    expect(s).toMatchObject({ regret: 250, worth: 400, regretCount: 2, pattern: null });
  });

  it('finds late-night regrets', () => {
    const s = regretSummary([r(2, 23, 'Food'), r(3, 1, 'Shopping'), r(4, 23, 'Bills'), r(9, 14, 'Health'), r(10, 15, 'Travel')], [], now);
    expect(s.pattern).toEqual({ kind: 'night', share: 0.6 });
  });

  it('uses the Bangladesh weekend (Friday and Saturday)', () => {
    // 6, 7, 13 Nov 2026 are Friday, Saturday, Friday
    const s = regretSummary([r(6, 12, 'A'), r(7, 12, 'B'), r(13, 12, 'C'), r(10, 12, 'D'), r(11, 12, 'E')], [], now);
    expect(s.pattern).toEqual({ kind: 'weekend', share: 0.6 });
  });

  it('finds the category most regrets fall in', () => {
    const s = regretSummary([r(2, 12, 'Shopping'), r(3, 12, 'Shopping'), r(4, 12, 'Shopping'), r(10, 12, 'Shopping'), r(11, 12, 'Food')], [], now);
    expect(s.pattern).toEqual({ kind: 'category', share: 0.8, category: 'Shopping' });
  });

  it('finds regrets in the week after money came in', () => {
    const s = regretSummary([r(2, 12, 'A'), r(3, 12, 'B'), r(4, 12, 'C'), r(18, 12, 'D'), r(19, 12, 'E')], [at(1, 9)], now);
    expect(s.pattern).toEqual({ kind: 'afterMoneyIn', share: 0.6 });
  });

  it('says nothing with fewer than 5 regrets, or without a clear pattern', () => {
    expect(regretSummary([r(2, 23), r(3, 23), r(4, 23), r(5, 23)], [], now).pattern).toBeNull();
    expect(regretSummary([r(2, 12, 'A'), r(3, 12, 'B'), r(4, 12, 'C'), r(10, 12, 'D'), r(11, 12, 'E')], [], now).pattern).toBeNull();
  });
});
