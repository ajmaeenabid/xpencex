import { differenceInCalendarDays, format } from 'date-fns';
import type { Locale } from 'date-fns';
import type { TFunction, TKey } from '../../shared/i18n';
import type { PlannedRepeat } from './planned';

export const REPEAT_TEXT: Record<PlannedRepeat, TKey> = {
  once: 'planned.repeat.once',
  weekly: 'planned.repeat.weekly',
  monthly: 'planned.repeat.monthly',
  yearly: 'planned.repeat.yearly',
};

/** "Today", "Tomorrow", "Overdue by 2 days", "In 5 days" or a date */
export function dueText(t: TFunction, iso: string, locale: Locale, now = new Date()): string {
  const date = new Date(iso);
  const days = differenceInCalendarDays(date, now);
  if (days < 0) return t('planned.overdue', { days: -days });
  if (days === 0) return t('planned.today');
  if (days === 1) return t('planned.tomorrow');
  if (days <= 14) return t('planned.inDays', { days });
  return format(date, 'd MMM yyyy', { locale });
}
