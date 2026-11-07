import { describe, it, expect } from 'vitest';
import { Fund, fundPlan, sortFunds } from './funds';

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
