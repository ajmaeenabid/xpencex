import { addMonths, startOfDay } from 'date-fns';
import { Account, AccountType } from '../../shared/types';

export const CASH_ID = 'cash';
export const CASH_NAME = 'Cash';

export const MOBILE_PROVIDERS: { type: Exclude<AccountType, 'bank'>; name: string; color: string }[] = [
  { type: 'bkash', name: 'bKash', color: '#E2136E' },
  { type: 'nagad', name: 'Nagad', color: '#F7941D' },
  { type: 'rocket', name: 'Rocket', color: '#8C3494' },
];

// Suggestions only: users can type any bank name
export const BANGLADESH_BANKS = [
  'AB Bank', 'Agrani Bank', 'Al-Arafah Islami Bank', 'Bank Asia', 'Bangladesh Krishi Bank', 'BRAC Bank',
  'City Bank', 'Dhaka Bank', 'Dutch-Bangla Bank', 'Eastern Bank', 'EXIM Bank', 'First Security Islami Bank',
  'IFIC Bank', 'Islami Bank Bangladesh', 'Jamuna Bank', 'Janata Bank', 'Mercantile Bank', 'Midland Bank',
  'Mutual Trust Bank', 'National Bank', 'NCC Bank', 'NRB Bank', 'One Bank', 'Premier Bank', 'Prime Bank',
  'Pubali Bank', 'Rupali Bank', 'Shahjalal Islami Bank', 'Social Islami Bank', 'Sonali Bank', 'Southeast Bank',
  'Standard Bank', 'Standard Chartered', 'Trust Bank', 'United Commercial Bank', 'Uttara Bank',
];

export const isMobile = (type: AccountType) => type !== 'bank';

/** "BRAC Bank · Savings" or "bKash ···123" */
export function accountDisplayName(a: Pick<Account, 'type' | 'name' | 'label'>) {
  return a.type === 'bank' ? `${a.name} · ${a.label}` : `${a.name} ···${a.label}`;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Same bank + same account type, or same mobile provider + same last 3 digits */
export function findDuplicate(
  accounts: Pick<Account, 'id' | 'type' | 'name' | 'label'>[],
  candidate: Pick<Account, 'type' | 'name' | 'label'>,
  ignoreId?: string,
) {
  return accounts.find(a =>
    a.id !== ignoreId &&
    a.type === candidate.type &&
    norm(a.name) === norm(candidate.name) &&
    norm(a.label) === norm(candidate.label)
  );
}

/** The deposit day in a given month, moved to the month's last day when it's shorter (e.g. 31 → 30 Nov) */
export function depositDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 9, 0, 0);
}

/** First deposit strictly after today, so a balance entered today isn't topped up again the same day */
export function firstDepositDate(day: number, now: Date = new Date()): string {
  const thisMonth = depositDate(now.getFullYear(), now.getMonth(), day);
  if (startOfDay(thisMonth) > startOfDay(now)) return thisMonth.toISOString();
  const next = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1);
  return depositDate(next.getFullYear(), next.getMonth(), day).toISOString();
}

/** Every deposit date that has arrived (<= now), plus the next future one. Capped like recurring expenses. */
export function dueDeposits(nextDate: string, day: number, now: Date = new Date(), max = 24) {
  const due: string[] = [];
  let next = new Date(nextDate);
  while (next.getTime() <= now.getTime() && due.length < max) {
    due.push(next.toISOString());
    next = depositDate(next.getFullYear(), next.getMonth() + 1, day);
  }
  return { due, next: next.toISOString() };
}
