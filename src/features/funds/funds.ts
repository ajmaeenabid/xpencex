// Festival funds: a savings goal for an occasion. Money is only set aside, never moved between accounts.

export interface Fund {
  id: string;
  uid: string;
  name: string;
  target: number;
  dueDate: string; // ISO; the festival day, set by you
  saved: number; // set aside so far
  createdAt: string;
}

export const FESTIVALS = ['eidFitr', 'eidAdha', 'durgaPuja', 'boishakh', 'christmas', 'buddhaPurnima'] as const;
export type Festival = (typeof FESTIVALS)[number];

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FundPlan {
  left: number; // still to set aside
  daysLeft: number; // until the festival (0 on the day, negative after)
  perWeek: number;
  perMonth: number;
  progress: number; // 0 to 1
  reached: boolean;
  passed: boolean;
}

/** How much to set aside each week and month to reach the goal by the festival */
export function fundPlan(fund: Pick<Fund, 'target' | 'saved' | 'dueDate'>, now = new Date()): FundPlan {
  const left = round2(Math.max(0, fund.target - fund.saved));
  const daysLeft = Math.ceil((new Date(fund.dueDate).getTime() - now.getTime()) / DAY);
  const days = Math.max(1, daysLeft);
  return {
    left,
    daysLeft,
    perWeek: left > 0 ? round2(left / Math.max(1, days / 7)) : 0,
    perMonth: left > 0 ? round2(left / Math.max(1, days / 30)) : 0,
    progress: fund.target > 0 ? Math.min(1, fund.saved / fund.target) : 0,
    reached: left === 0,
    passed: daysLeft < 0,
  };
}

/** Upcoming funds first (soonest first), then the ones whose day has passed */
export function sortFunds(funds: Fund[], now = new Date()): Fund[] {
  const t = now.getTime();
  return [...funds].sort((a, b) => {
    const pa = new Date(a.dueDate).getTime() < t - DAY, pb = new Date(b.dueDate).getTime() < t - DAY;
    if (pa !== pb) return pa ? 1 : -1;
    return a.dueDate.localeCompare(b.dueDate) * (pa ? -1 : 1);
  });
}
