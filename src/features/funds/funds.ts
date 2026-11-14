// Savings goals (grown from festival funds, 2026-11-11): a goal for an occasion or anything else, with an optional
// end date. Money put in is either only set aside, or moved out of an account (the person chooses each time).

export interface Fund {
  id: string;
  uid: string;
  name: string;
  target: number;
  dueDate?: string; // ISO; the day it's for (a festival, a trip). Missing: no end date
  fromAccounts?: Record<string, number>; // money moved in from each account, so taking it out can put it back
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
  if (!fund.dueDate) {
    // No end date: no weekly plan, and it never "passes"
    const progress = fund.target > 0 ? Math.min(1, fund.saved / fund.target) : 0;
    return { left, daysLeft: Number.POSITIVE_INFINITY, perWeek: 0, perMonth: 0, progress, reached: left === 0, passed: false };
  }
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

/** Upcoming goals first (soonest first), then goals with no end date (newest first), then ones whose day has passed */
export function sortFunds(funds: Fund[], now = new Date()): Fund[] {
  const t = now.getTime();
  const group = (f: Fund) => (!f.dueDate ? 1 : new Date(f.dueDate).getTime() < t - DAY ? 2 : 0);
  return [...funds].sort((a, b) => {
    const ga = group(a), gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 1) return b.createdAt.localeCompare(a.createdAt);
    return a.dueDate!.localeCompare(b.dueDate!) * (ga === 2 ? -1 : 1);
  });
}

/** The account most of a goal's money came from, to suggest when taking money out */
export function mainSource(fund: Pick<Fund, 'fromAccounts'>): string | null {
  const entries = Object.entries(fund.fromAccounts || {}).filter(([, v]) => v > 0);
  return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;
}

/** Rounds to a tidy amount people would type: 1, 2 or 5 times a power of ten */
export function tidyAmount(n: number): number {
  if (!(n > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 5, 10].find(s => n <= s * power * 1.5) ?? 10;
  return step * power;
}

/** Quick "set aside" buttons: about 5%, 10% and 25% of the goal, tidy and different from each other */
export function quickAmounts(target: number): number[] {
  const picks = [0.05, 0.1, 0.25].map(share => Math.max(10, tidyAmount(target * share)));
  return [...new Set(picks)];
}
