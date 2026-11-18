// The balance forecast: where today's money goes over the next 30 days. It counts planned payments, repeating
// expenses, monthly income, account deposits and loan installments, plus the person's everyday spending.
// Plain rules, no database calls, so they can be tested.

import { addDays, differenceInCalendarDays, endOfDay, format, startOfDay } from 'date-fns';
import { duePayments } from '../../../ai-server/src/loanDates';
import type { Account, Expense, Loan, RecurringExpense } from '../../shared/types';
import { dueDeposits } from '../accounts/accounts';
import { dueOccurrences } from '../expenses/recurring';
import type { IncomeRule } from '../income/incomeService';
import { Planned, plannedDates } from './planned';

export const FORECAST_DAYS = 30;
export const ALERT_WITHIN_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ForecastSource = 'planned' | 'recurring' | 'income' | 'deposit' | 'loan';

export interface ForecastEvent {
  date: Date;
  title: string;
  amount: number; // money in is above zero, money out below
  source: ForecastSource;
}

export interface ForecastPoint {
  date: Date;
  balance: number; // at the end of this day
}

export interface Forecast {
  points: ForecastPoint[]; // today, then one for each day ahead
  events: ForecastEvent[]; // soonest first
  lowest: ForecastPoint;
  shortOn: Date | null; // the first day the balance falls below zero
  perDay: number;
}

/** Spending with its own date in the forecast is left out of the daily average, so it isn't counted twice */
export const everydayExpenses = <T extends Pick<Expense, 'recurringId' | 'plannedId' | 'loanId'>>(expenses: T[]): T[] =>
  expenses.filter(e => !e.recurringId && !e.plannedId && !e.loanId);

export function buildForecast({ now = new Date(), days = FORECAST_DAYS, balance, perDay, planned = [], recurring = [], incomeRules = [], accounts = [], loans = [] }: {
  now?: Date;
  days?: number;
  balance: number;
  perDay: number;
  planned?: Pick<Planned, 'kind' | 'title' | 'amount' | 'date' | 'repeat' | 'day'>[];
  recurring?: Pick<RecurringExpense, 'title' | 'amount' | 'frequency' | 'nextDate'>[];
  incomeRules?: Pick<IncomeRule, 'title' | 'amount' | 'day' | 'nextDate'>[];
  accounts?: Pick<Account, 'name' | 'deposit' | 'nextDepositDate'>[];
  loans?: Pick<Loan, 'name' | 'status' | 'remaining' | 'installment' | 'nextDueDate' | 'day'>[];
}): Forecast {
  const today = startOfDay(now);
  const until = endOfDay(addDays(today, days));
  const events: ForecastEvent[] = [];
  // Anything already due and still open counts today
  const add = (iso: string, title: string, amount: number, source: ForecastSource) => {
    const date = new Date(iso);
    events.push({ date: date < today ? today : date, title, amount, source });
  };

  for (const p of planned) {
    for (const date of plannedDates(p, until)) add(date, p.title, p.kind === 'income' ? p.amount : -p.amount, 'planned');
  }
  for (const r of recurring) {
    for (const date of dueOccurrences(r.nextDate, r.frequency, until).due) add(date, r.title, -r.amount, 'recurring');
  }
  for (const r of incomeRules) {
    for (const date of dueDeposits(r.nextDate, r.day, until).due) add(date, r.title, r.amount, 'income');
  }
  for (const a of accounts) {
    if (!a.deposit || !a.nextDepositDate) continue;
    for (const date of dueDeposits(a.nextDepositDate, a.deposit.day, until).due) add(date, a.name, a.deposit.amount, 'deposit');
  }
  for (const l of loans) {
    if (l.status !== 'active') continue;
    for (const p of duePayments(l, until.getTime()).payments) add(p.date, l.name, -p.amount, 'loan');
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const byDay = new Map<string, number>();
  for (const e of events) {
    const key = format(e.date, 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) || 0) + e.amount);
  }

  const points: ForecastPoint[] = [];
  let running = balance;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    // Today's spending is already in the balance, so everyday spending starts tomorrow
    running += (byDay.get(format(date, 'yyyy-MM-dd')) || 0) - (i > 0 ? perDay : 0);
    points.push({ date, balance: round2(running) });
  }

  const lowest = points.reduce((low, p) => (p.balance < low.balance ? p : low), points[0]);
  return { points, events, lowest, shortOn: points.find(p => p.balance < 0)?.date ?? null, perDay };
}

/**
 * One phone alert for each time money starts to run short within a week. `sent` stays true until the
 * shortfall is gone, so the same warning doesn't come back every day.
 */
export function shortfallAlert(shortOn: Date | null, alreadySent: boolean, now = new Date()): { send: boolean; sent: boolean } {
  const soon = !!shortOn && differenceInCalendarDays(shortOn, now) <= ALERT_WITHIN_DAYS;
  return { send: soon && !alreadySent, sent: soon };
}
