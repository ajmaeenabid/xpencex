import { addMonths, addWeeks } from 'date-fns';
import { RecurringFrequency } from '../../shared/types';

export function advanceDate(iso: string, frequency: RecurringFrequency): string {
  const d = new Date(iso);
  return (frequency === 'weekly' ? addWeeks(d, 1) : addMonths(d, 1)).toISOString();
}

/** Every occurrence date that is due (<= now), plus the next future date. Capped so a long absence can't flood the database. */
export function dueOccurrences(nextDate: string, frequency: RecurringFrequency, now: Date = new Date(), max = 24) {
  const due: string[] = [];
  let next = nextDate;
  while (new Date(next).getTime() <= now.getTime() && due.length < max) {
    due.push(next);
    next = advanceDate(next, frequency);
  }
  return { due, next };
}
