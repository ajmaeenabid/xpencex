// Warranties (chosen 2026-11-18): an optional end date on an expense, with or without a receipt. The phone reminds
// the person 30 and 7 days before it ends. Plain rules, no database calls, so they can be tested.

import { addMonths, differenceInCalendarDays, format } from 'date-fns';

export const WARRANTY_PRESETS = [6, 12, 24] as const;
export const MAX_WARRANTY_MONTHS = 120;
export const WARRANTY_REMINDER_DAYS = [30, 7] as const;

const midday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();

/** Midday on a day (yyyy-MM-dd) */
export const warrantyOnDay = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/** The end of a warranty that lasts this many months from the day of purchase */
export const warrantyEnd = (purchase: string, months: number) => midday(addMonths(new Date(purchase), months));

/** True when the warranty ends on or before the day of purchase */
export const warrantyTooEarly = (until: string, purchaseDay: string) => format(new Date(until), 'yyyy-MM-dd') <= purchaseDay;

/** The end date the AI reported for a purchase, only when the user mentioned one */
export function warrantyFromAi(raw: { warrantyMonths?: unknown; warrantyUntil?: unknown }, purchase: string): string | undefined {
  const months = Number(raw.warrantyMonths);
  if (Number.isInteger(months) && months >= 1 && months <= MAX_WARRANTY_MONTHS) return warrantyEnd(purchase, months);
  const day = typeof raw.warrantyUntil === 'string' ? raw.warrantyUntil.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00`).getTime())) return undefined;
  return warrantyTooEarly(warrantyOnDay(day), format(new Date(purchase), 'yyyy-MM-dd')) ? undefined : warrantyOnDay(day);
}

/** Days until it ends: 0 on the last day, below zero once it has ended */
export const warrantyDaysLeft = (until: string, now = new Date()) => differenceInCalendarDays(new Date(until), now);

/** Active ones first (soonest to end first), then ended ones (latest to end first) */
export function splitWarranties<T extends { warrantyUntil?: string }>(list: T[], now = new Date()) {
  const dated = list.filter((e): e is T & { warrantyUntil: string } => !!e.warrantyUntil);
  return {
    active: dated.filter(e => warrantyDaysLeft(e.warrantyUntil, now) >= 0).sort((a, b) => a.warrantyUntil.localeCompare(b.warrantyUntil)),
    ended: dated.filter(e => warrantyDaysLeft(e.warrantyUntil, now) < 0).sort((a, b) => b.warrantyUntil.localeCompare(a.warrantyUntil)),
  };
}
