import { describe, it, expect } from 'vitest';
import { spendingLines } from './spendingLines';

describe('spending lines', () => {
  const november = new Date(2026, 10, 15); // 30 days

  it('splits the monthly budget into a daily and a weekly share', () => {
    const [today, week] = spendingLines({ today: 100, week: 700, month: 3000 }, 6000, november);
    expect(today).toMatchObject({ limit: 200, percent: 50, status: 'ok' });
    expect(week).toMatchObject({ limit: 1400, percent: 50, status: 'ok' });
  });

  it('turns amber from 80% and red past the limit, never filling past 100%', () => {
    const [today, week] = spendingLines({ today: 170, week: 2100, month: 2100 }, 6000, november);
    expect(today.status).toBe('near');
    expect(week).toMatchObject({ percent: 100, status: 'over' });
  });

  it('has only today and this week, and empty lines when no budget is set', () => {
    const lines = spendingLines({ today: 50, week: 50, month: 50 }, 0, november);
    expect(lines.map(l => l.key)).toEqual(['today', 'week']);
    expect(lines.every(l => l.limit === 0 && l.percent === 0 && l.status === 'ok')).toBe(true);
  });
});
