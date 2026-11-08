// "Add to Google Calendar" links. Google Calendar opens a filled-in event the person saves themselves,
// so this needs no Google permission and no linking.
import { addDays, format } from 'date-fns';

export interface CalendarEvent {
  title: string;
  date: Date; // an all-day event on this day
  details?: string;
  // Repeats, e.g. one event per loan installment still to pay
  repeat?: { every: 'week' | 'month'; times: number };
}

const MAX_REPEATS = 400;

export function calendarLink({ title, date, details, repeat }: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title.slice(0, 200),
    // All-day events end on the next day in Google's format
    dates: `${format(date, 'yyyyMMdd')}/${format(addDays(date, 1), 'yyyyMMdd')}`,
  });
  if (details) params.set('details', details.slice(0, 1000));
  if (repeat && repeat.times > 1) {
    const times = Math.min(Math.floor(repeat.times), MAX_REPEATS);
    params.set('recur', `RRULE:FREQ=${repeat.every === 'week' ? 'WEEKLY' : 'MONTHLY'};COUNT=${times}`);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
