import { differenceInCalendarDays } from 'date-fns';

// Which cards are on Home (chosen 2026-11-19/20, demo https://claude.ai/artifact/YWQi3seEoDi3J1futxZYWj).
// Home shows the daily cards; the others wait in Home's side panel, where tapping one opens its window and a
// switch adds it to Home. A panel card also comes to Home by itself while it needs you (smart alerts).
// The choice is kept on the account (users.layout.homeCards), so every phone matches. Plain functions for tests.

/** On Home unless switched off */
export const DAILY_CARDS = ['budget', 'accounts', 'earned', 'spending', 'planned', 'charts', 'recent'] as const;
/** In the side panel unless switched on */
export const PANEL_CARDS = ['runway', 'funds', 'debts', 'samity', 'loan', 'shopping', 'calculator', 'insights', 'categoryBudgets'] as const;
/** Never in the panel: they appear on Home only while they have something to say */
export const AUTO_CARDS = ['saveNudge', 'unsorted'] as const;

export type HomeCard = (typeof DAILY_CARDS)[number] | (typeof PANEL_CARDS)[number];
export type AlertCard = 'loan' | 'samity' | 'funds';
const CHOOSABLE: readonly string[] = [...DAILY_CARDS, ...PANEL_CARDS];

export const LOAN_ALERT_DAYS = 3;
export const GOAL_ALERT_DAYS = 7;

/** The cards switched on, from what the account saved (nothing saved yet: the daily cards) */
export function cardsOnHome(saved: string[] | undefined): Set<string> {
  return new Set(saved ? saved.filter(id => CHOOSABLE.includes(id)) : DAILY_CARDS);
}

/** The saved list after a card is switched on or off */
export function toggleCard(saved: string[] | undefined, id: string): string[] {
  const on = cardsOnHome(saved);
  if (on.has(id)) on.delete(id); else on.add(id);
  return CHOOSABLE.filter(c => on.has(c));
}

/**
 * Panel cards that need you now: a loan installment due within 3 days, a samity payment due today (or missed),
 * or a savings goal date within a week that isn't reached or paused.
 */
export function smartAlerts({ loans, samityDates, goals, now }: {
  loans: { nextDueDate: string }[];
  samityDates: Date[]; // the next unpaid round of each samity
  goals: { dueDate?: string; progress: number; paused?: boolean }[];
  now: Date;
}): Set<AlertCard> {
  const days = (d: Date | string) => differenceInCalendarDays(new Date(d), now);
  const alerts = new Set<AlertCard>();
  if (loans.some(l => { const d = days(l.nextDueDate); return d >= 0 && d <= LOAN_ALERT_DAYS; })) alerts.add('loan');
  if (samityDates.some(d => days(d) <= 0)) alerts.add('samity');
  if (goals.some(g => !g.paused && g.progress < 1 && g.dueDate && days(g.dueDate) >= 0 && days(g.dueDate) <= GOAL_ALERT_DAYS)) alerts.add('funds');
  return alerts;
}

/** Whether a card is on Home: always for the cards that only appear when needed */
export function onHome(id: string, on: Set<string>, alerts: Set<string>): boolean {
  return (AUTO_CARDS as readonly string[]).includes(id) || on.has(id) || alerts.has(id);
}
