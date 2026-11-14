import type { TFunction, TKey } from '../../shared/i18n';
import { INCOME_CATEGORIES } from './income';

const KEYS: Record<(typeof INCOME_CATEGORIES)[number], TKey> = {
  Salary: 'income.cat.salary',
  Business: 'income.cat.business',
  Freelance: 'income.cat.freelance',
  Tuition: 'income.cat.tuition',
  Gift: 'income.cat.gift',
  'Rent received': 'income.cat.rent',
  Other: 'income.cat.other',
};

/** A fixed income category in the app's language; the person's own categories show as they typed them */
export const incomeCategoryLabel = (t: TFunction, name: string) =>
  name in KEYS ? t(KEYS[name as keyof typeof KEYS]) : name;
