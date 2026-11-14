import { describe, it, expect } from 'vitest';
import { Fund, fundPlan, mainSource, quickAmounts, sortFunds, tidyAmount } from './funds';

const now = new Date('2026-11-20T12:00:00.000Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe('festival funds', () => {
  it('splits what is left over the weeks and months until the day', () => {
    const p = fundPlan({ target: 10000, saved: 2000, dueDate: inDays(56) }, now); // 8 weeks
    expect(p).toMatchObject({ left: 8000, daysLeft: 56, perWeek: 1000, progress: 0.2, reached: false, passed: false });
    expect(p.perMonth).toBe(4285.71); // 56 days is about 1.87 months
  });

  it('asks for everything this week when less than a week is left', () => {
    expect(fundPlan({ target: 3000, saved: 0, dueDate: inDays(3) }, now)).toMatchObject({ perWeek: 3000, perMonth: 3000 });
  });

  it('is reached once enough is set aside, and never shows more than 100%', () => {
    expect(fundPlan({ target: 5000, saved: 6000, dueDate: inDays(10) }, now)).toMatchObject({ left: 0, perWeek: 0, progress: 1, reached: true });
  });

  it('knows when the day has passed', () => {
    expect(fundPlan({ target: 100, saved: 0, dueDate: inDays(-2) }, now).passed).toBe(true);
  });

  it('shows the soonest upcoming fund first and past ones last', () => {
    const f = (id: string, d: number) => ({ id, dueDate: inDays(d) }) as Fund;
    expect(sortFunds([f('past', -10), f('later', 60), f('soon', 5)], now).map(x => x.id)).toEqual(['soon', 'later', 'past']);
  });
});

describe('quick set-aside amounts', () => {
  it('rounds to tidy amounts', () => {
    expect(tidyAmount(480)).toBe(500);
    expect(tidyAmount(1000)).toBe(1000);
    expect(tidyAmount(2300)).toBe(2000);
    expect(tidyAmount(0)).toBe(0);
  });

  it('suggests about 5%, 10% and 25% of the goal', () => {
    expect(quickAmounts(10000)).toEqual([500, 1000, 2000]);
    expect(quickAmounts(50000)).toEqual([2000, 5000, 10000]);
  });

  it('never suggests tiny or repeated amounts', () => {
    expect(quickAmounts(100)).toEqual([10, 20]);
  });
});

describe('savings goals without an end date', () => {
  const now = new Date(2026, 10, 11);
  const goal = (id: string, extra: Partial<Fund> = {}): Fund => ({ id, uid: 'u', name: id, target: 1000, saved: 0, createdAt: '2026-11-01T00:00:00.000Z', ...extra });

  it('has no weekly plan and never passes', () => {
    const p = fundPlan({ target: 1000, saved: 250 }, now);
    expect(p).toMatchObject({ perWeek: 0, perMonth: 0, passed: false, reached: false, progress: 0.25, left: 750 });
  });

  it('sorts dated goals first, then undated (newest first), then passed ones', () => {
    const sorted = sortFunds([
      goal('passed', { dueDate: '2026-01-01T12:00:00.000Z' }),
      goal('old-undated', { createdAt: '2026-10-01T00:00:00.000Z' }),
      goal('soon', { dueDate: '2026-12-01T12:00:00.000Z' }),
      goal('new-undated', { createdAt: '2026-11-05T00:00:00.000Z' }),
    ], now);
    expect(sorted.map(f => f.id)).toEqual(['soon', 'new-undated', 'old-undated', 'passed']);
  });

  it('suggests putting money back where most of it came from', () => {
    expect(mainSource({ fromAccounts: { bkash: 200, bank: 500, gone: 0 } })).toBe('bank');
    expect(mainSource({})).toBeNull();
  });
});
