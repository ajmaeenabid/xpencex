// Planned payments (chosen 2026-11-18): future bills and money you expect, once or repeating.
// Nothing is recorded by itself: when the day comes the person marks it as paid or received, or skips it.
// Plain rules, no database calls, so they can be tested (the saves are in plannedService.ts).

import { addWeeks, format } from 'date-fns';
import { containsSecret } from '../../shared/lib/sensitiveData';

export const PLANNED_REPEATS = ['once', 'weekly', 'monthly', 'yearly'] as const;
export type PlannedRepeat = (typeof PLANNED_REPEATS)[number];
export type PlannedKind = 'expense' | 'income';

export const MAX_PLANNED = 50;

export interface Planned {
  id: string;
  uid: string;
  kind: PlannedKind;
  title: string;
  amount: number;
  category: string;
  accountId?: string;
  repeat: PlannedRepeat;
  date: string; // ISO: the next time it is due
  day: number; // the day of the month chosen, so the 31st comes back after a shorter month
  createdAt: string;
}

/** Midday on a day (yyyy-MM-dd), so a time zone can never tip it into the day before or after */
export const dateFromDay = (day: string) => new Date(`${day}T12:00:00`).toISOString();

const onDay = (year: number, month: number, day: number) =>
  new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()), 12);

/** The next due date after this one, or null when it happens only once */
export function nextPlannedDate(plan: Pick<Planned, 'date' | 'repeat' | 'day'>): string | null {
  const d = new Date(plan.date);
  switch (plan.repeat) {
    case 'weekly': return addWeeks(d, 1).toISOString();
    case 'monthly': return onDay(d.getFullYear(), d.getMonth() + 1, plan.day).toISOString();
    case 'yearly': return onDay(d.getFullYear() + 1, d.getMonth(), plan.day).toISOString();
    default: return null;
  }
}

/** Every due date from the next one up to `until`, for the forecast */
export function plannedDates(plan: Pick<Planned, 'date' | 'repeat' | 'day'>, until: Date, max = 60): string[] {
  const dates: string[] = [];
  let next: string | null = plan.date;
  while (next && new Date(next).getTime() <= until.getTime() && dates.length < max) {
    dates.push(next);
    next = nextPlannedDate({ ...plan, date: next });
  }
  return dates;
}

/** Soonest first */
export const sortPlanned = <T extends Pick<Planned, 'date'>>(list: T[]): T[] =>
  [...list].sort((a, b) => a.date.localeCompare(b.date));

export type PlannedProblem = 'full' | 'title' | 'secret' | 'amount' | 'date';

/** Why a new or changed plan can't be saved yet, or null. `existing` is how many are saved now. */
export function plannedProblem(
  input: { title: string; amount: number; day: string },
  existing: number,
  isNew = true,
  now = new Date(),
): PlannedProblem | null {
  if (isNew && existing >= MAX_PLANNED) return 'full';
  if (!input.title.trim()) return 'title';
  if (containsSecret(input.title)) return 'secret';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'amount';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(input.day) && !Number.isNaN(new Date(`${input.day}T12:00:00`).getTime());
  if (!valid || (isNew && input.day < format(now, 'yyyy-MM-dd'))) return 'date';
  return null;
}
