import { format } from 'date-fns';
import { Expense } from '../../shared/types';
import { lastMoneyMonths, moneyMonthKey } from '../../shared/lib/moneyMonth';

// Fees paid on bKash, Nagad, Rocket and bank transactions, read from the SMS when the expense was saved

export type FeeProvider = 'bkash' | 'nagad' | 'rocket' | 'bank';
export const FEE_PROVIDERS: FeeProvider[] = ['bkash', 'nagad', 'rocket', 'bank'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fee on one expense: its `fee`, or for older expenses the "Fee ৳x" the SMS reader wrote in the notes */
export function feeOf(expense: Pick<Expense, 'fee' | 'notes'>): number {
  if (typeof expense.fee === 'number' && expense.fee > 0) return expense.fee;
  const match = expense.notes?.match(/Fee ৳(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

/** Which service charged it, from the title the SMS reader gave the expense ("bKash Send Money to ...") */
export function feeProvider(expense: Pick<Expense, 'title'>): FeeProvider {
  const title = expense.title.toLowerCase();
  if (title.startsWith('bkash')) return 'bkash';
  if (title.startsWith('nagad')) return 'nagad';
  if (title.startsWith('rocket')) return 'rocket';
  return 'bank';
}

export interface FeeSummary {
  thisMonth: number;
  byProvider: Record<FeeProvider, number>; // this month
  months: { month: string; total: number }[]; // the last 6 months, oldest first, 'yyyy-MM'
}

export function feeSummary(expenses: Pick<Expense, 'fee' | 'notes' | 'title' | 'date'>[], now = new Date(), startDay = 1): FeeSummary {
  // Money months (Profile > Month starts on), each keyed by the calendar month it starts in
  const thisMonthKey = moneyMonthKey(now, startDay);
  const months = lastMoneyMonths(6, now, startDay).map(m => format(m.start, 'yyyy-MM'));
  const totals = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>;
  const byProvider = { bkash: 0, nagad: 0, rocket: 0, bank: 0 };

  for (const expense of expenses) {
    const fee = feeOf(expense);
    if (!fee) continue;
    const month = moneyMonthKey(new Date(expense.date), startDay);
    if (month in totals) totals[month] += fee;
    if (month === thisMonthKey) byProvider[feeProvider(expense)] += fee;
  }

  return {
    thisMonth: round2(totals[thisMonthKey]),
    byProvider: Object.fromEntries(FEE_PROVIDERS.map(p => [p, round2(byProvider[p])])) as Record<FeeProvider, number>,
    months: months.map(month => ({ month, total: round2(totals[month]) })),
  };
}
