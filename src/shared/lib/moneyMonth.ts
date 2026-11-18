// The person's own "money month": it starts on the day they choose (Profile > Month starts on), for example
// the 25th, when the salary comes. Every "this month" in the app (Home, budgets and their alerts, Reports, the
// widget, the runway card, the AI) uses these helpers, so all the totals agree. Owner's choices (2026-11-16):
// any day 1 to 31; in a shorter month, 29, 30 or 31 falls on that month's last day.
import { format } from 'date-fns';

export const DEFAULT_MONTH_START = 1;

/** A saved start day, or 1 when there is none or it isn't a whole number from 1 to 31 */
export function cleanStartDay(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31 ? value : DEFAULT_MONTH_START;
}

const daysIn = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate();

/** Midnight on the start day in that calendar month (the 31st becomes the 30th, or the 28th in February) */
export function startIn(year: number, monthIndex: number, startDay: number): Date {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return new Date(y, m, Math.min(startDay, daysIn(y, m)));
}

/** The first moment of the money month that `date` falls in */
export function moneyMonthStart(date: Date, startDay = DEFAULT_MONTH_START): Date {
  const here = startIn(date.getFullYear(), date.getMonth(), startDay);
  return date.getTime() >= here.getTime() ? here : startIn(date.getFullYear(), date.getMonth() - 1, startDay);
}

/**
 * The money month `offset` months away from the one `date` is in (0 = this one, -1 = the one before),
 * as [start, end): `end` is the next month's start, so a record belongs when start <= its time < end.
 */
export function moneyMonth(date: Date, startDay = DEFAULT_MONTH_START, offset = 0): { start: Date; end: Date } {
  // A money month is named after the calendar month it starts in (a 31st that falls on Feb 28 still starts in
  // February), and moving by whole months is done from there
  const current = moneyMonthStart(date, startDay);
  const year = current.getFullYear(), month = current.getMonth();
  return { start: startIn(year, month + offset, startDay), end: startIn(year, month + offset + 1, startDay) };
}

/** 'yyyy-MM' of the calendar month the money month starts in, for "once a month" notes like budget alerts */
export function moneyMonthKey(date: Date, startDay = DEFAULT_MONTH_START): string {
  return format(moneyMonthStart(date, startDay), 'yyyy-MM');
}

/** Which day of its money month `date` is (1 = the start day), and how many days that money month has */
export function moneyMonthDay(date: Date, startDay = DEFAULT_MONTH_START): { day: number; length: number } {
  const { start, end } = moneyMonth(date, startDay);
  const dayMs = 24 * 60 * 60 * 1000;
  // Rounded, so a clock change (none in Bangladesh, but elsewhere) can't make a day count twice
  const day = Math.floor(Math.round((startOfDay(date).getTime() - start.getTime()) / dayMs)) + 1;
  const length = Math.round((end.getTime() - start.getTime()) / dayMs);
  return { day, length };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whether `time` (ms or ISO) is inside the money month `offset` away from `now` */
export function inMoneyMonth(time: number | string, now: Date, startDay = DEFAULT_MONTH_START, offset = 0): boolean {
  const t = typeof time === 'number' ? time : new Date(time).getTime();
  const { start, end } = moneyMonth(now, startDay, offset);
  return t >= start.getTime() && t < end.getTime();
}

/** The last `count` money months up to and including the one `now` is in, oldest first */
export function lastMoneyMonths(count: number, now: Date, startDay = DEFAULT_MONTH_START): { start: Date; end: Date }[] {
  return Array.from({ length: count }, (_, i) => moneyMonth(now, startDay, i - (count - 1)));
}
