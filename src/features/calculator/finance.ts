import type { TKey } from '../../shared/i18n';

// Loan and investment sums, kept free of React so they can be tested.

const MAX_MONTHS = 600; // 50 years
const round2 = (n: number) => Math.round(n * 100) / 100;

export type FinanceMode = 'loan' | 'investment';
export type InvestmentKind = 'once' | 'monthly';

export interface FinanceForm {
  mode: FinanceMode;
  amount: string;
  rate: string;
  years: string;
  months: string;
  kind: InvestmentKind;
}

export const emptyFinanceForm: FinanceForm = { mode: 'loan', amount: '', rate: '', years: '1', months: '0', kind: 'once' };

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.' | 'DEL' | 'C';
export type FieldRules = { decimals: number; maxWhole: number };

export const FIELD_RULES: Record<'amount' | 'rate' | 'years' | 'months', FieldRules> = {
  amount: { decimals: 2, maxWhole: 13 },
  rate: { decimals: 2, maxWhole: 3 },
  years: { decimals: 0, maxWhole: 2 },
  months: { decimals: 0, maxWhole: 3 },
};

/**
 * One key press on a number field. `fresh` means the field was just tapped, so the first digit
 * replaces what's there instead of adding to it, the way a phone's calculator behaves.
 */
export function applyPadKey(value: string, key: PadKey, rules: FieldRules, fresh = false): string {
  if (key === 'C') return '';
  if (key === 'DEL') return value.slice(0, -1);
  const base = fresh ? '' : value;
  const [whole, fraction] = base.split('.');
  if (key === '.') {
    if (!rules.decimals || fraction !== undefined) return value;
    return base === '' ? '0.' : `${base}.`;
  }
  if (fraction !== undefined) {
    const room = rules.decimals - fraction.length;
    return room > 0 ? base + key.slice(0, room) : value;
  }
  if (whole === '0' || whole === '') {
    const typed = key === '00' ? '0' : key;
    return typed;
  }
  return whole.length + key.length > rules.maxWhole ? value : base + key;
}

/** A typed amount with commas, keeping an unfinished decimal point */
export function formatTyped(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole ? Number(whole).toLocaleString('en-US') : '';
  return fraction !== undefined ? `${grouped || '0'}.${fraction}` : grouped;
}

export const totalMonths = (form: Pick<FinanceForm, 'years' | 'months'>) =>
  (parseInt(form.years, 10) || 0) * 12 + (parseInt(form.months, 10) || 0);

/** First problem with the form, as a message key; null when it can be calculated */
export function financeFormError(form: FinanceForm): TKey | null {
  const amount = parseFloat(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'fin.errAmount';
  const rate = parseFloat(form.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 'fin.errRate';
  const months = totalMonths(form);
  if (months < 1 || months > MAX_MONTHS) return 'fin.errDuration';
  return null;
}

export interface LoanResult {
  principal: number;
  monthly: number;
  total: number;
  interest: number;
  months: number;
}

/**
 * Reducing balance (EMI): each month's interest is only on what is still owed. The monthly payment is
 * rounded up to the paisa, so the loan never needs one extra tiny installment. The last installment is
 * then slightly smaller, which loans already handle (nextAmount in accounts/loans.ts).
 */
export function calculateLoan(principal: number, yearlyRate: number, months: number): LoanResult {
  const r = yearlyRate / 100 / 12;
  const exact = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const monthly = Math.ceil(exact * 100 - 1e-7) / 100;
  const total = round2(exact * months);
  return { principal, monthly, total, interest: round2(total - principal), months };
}

export interface ScheduleRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/**
 * Month by month, matching calculateLoan: payments add up to its total exactly, and the balance ends
 * at 0. The last payment takes up the rounding, as the last installment of a real loan does.
 */
export function loanSchedule(principal: number, yearlyRate: number, months: number): ScheduleRow[] {
  const { monthly, total } = calculateLoan(principal, yearlyRate, months);
  const r = yearlyRate / 100 / 12;
  const rows: ScheduleRow[] = [];
  let balance = principal;
  let paid = 0;
  for (let month = 1; month <= months; month++) {
    if (month === months) {
      const payment = round2(total - paid);
      rows.push({ month, payment, interest: round2(Math.max(0, payment - balance)), principal: balance, balance: 0 });
      break;
    }
    const interest = round2(balance * r);
    const repaid = round2(monthly - interest);
    balance = round2(balance - repaid);
    paid = round2(paid + monthly);
    rows.push({ month, payment: monthly, interest, principal: repaid, balance });
  }
  return rows;
}

export interface InvestmentResult {
  invested: number;
  profit: number;
  finalValue: number;
}

/** Interest is added monthly. A monthly deposit is made at the end of each month. */
export function calculateInvestment(amount: number, yearlyRate: number, months: number, kind: InvestmentKind): InvestmentResult {
  const r = yearlyRate / 100 / 12;
  const invested = kind === 'once' ? amount : amount * months;
  let finalValue: number;
  if (kind === 'once') finalValue = amount * (1 + r) ** months;
  else finalValue = r === 0 ? invested : (amount * ((1 + r) ** months - 1)) / r;
  return { invested: round2(invested), profit: round2(finalValue - invested), finalValue: round2(finalValue) };
}
