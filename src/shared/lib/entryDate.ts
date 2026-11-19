import { format } from 'date-fns';

/**
 * The saved time of an entry picked as a day ("2026-11-19"). Today gets the current time, so it sorts above what
 * was added earlier today; another day gets midday, so no time zone can move it to the day before.
 * A full date and time is kept as it is, and no day at all means now.
 */
export function entryDate(day: string | undefined, now = new Date()): string {
  if (!day) return now.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return (day === format(now, 'yyyy-MM-dd') ? now : new Date(`${day}T12:00:00`)).toISOString();
}
