import { getDaysInMonth } from 'date-fns';

export type LineStatus = 'ok' | 'near' | 'over';

export interface SpendingLine {
  key: 'today' | 'week';
  spent: number;
  limit: number; // 0 when no budget is set
  percent: number; // how full the line is, 0 to 100
  status: LineStatus;
}

const NEAR = 0.8; // amber from 80% of the limit

/**
 * Today and this week, each measured against its share of the monthly budget (the month has its own budget card):
 * the month's budget spread evenly over its days, so a day gets budget/days and a week 7 of those.
 */
export function spendingLines(spent: { today: number; week: number; month: number }, budget: number, now = new Date()): SpendingLine[] {
  const perDay = budget > 0 ? budget / getDaysInMonth(now) : 0;
  const limits = { today: perDay, week: perDay * 7 };
  return (['today', 'week'] as const).map(key => {
    const limit = Math.round(limits[key]);
    const ratio = limit > 0 ? spent[key] / limit : 0;
    return {
      key,
      spent: spent[key],
      limit,
      percent: Math.min(100, Math.round(ratio * 100)),
      status: ratio > 1 ? 'over' : ratio >= NEAR ? 'near' : 'ok',
    };
  });
}
