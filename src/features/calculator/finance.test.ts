import { describe, it, expect } from 'vitest';
import { installmentsLeft } from '../accounts/loans';
import { FIELD_RULES, applyPadKey, calculateInvestment, calculateLoan, emptyFinanceForm, loanSchedule, financeFormError, formatTyped, totalMonths } from './finance';

describe('calculateLoan', () => {
  it('matches a known EMI: 100,000 at 10% for 12 months', () => {
    const loan = calculateLoan(100000, 10, 12);
    expect(loan.monthly).toBe(8791.59);
    expect(loan.total).toBe(105499.06);
    expect(loan.interest).toBe(5499.06);
  });
  it('matches another known EMI: 500,000 at 9% for 60 months', () => {
    expect(calculateLoan(500000, 9, 60).monthly).toBe(10379.18);
  });
  it('charges no interest at 0%', () => {
    const loan = calculateLoan(12000, 0, 12);
    expect(loan.monthly).toBe(1000);
    expect(loan.total).toBe(12000);
    expect(loan.interest).toBe(0);
  });
  it('handles a single month', () => {
    expect(calculateLoan(1000, 12, 1).monthly).toBe(1010);
  });
  it('never shows false interest at 0%, however it divides', () => {
    const loan = calculateLoan(50000, 0, 12);
    expect(loan.total).toBe(50000);
    expect(loan.interest).toBe(0);
    expect(loan.monthly).toBe(4166.67);
  });
  it('is repaid in exactly the months asked for, with no tiny extra installment', () => {
    for (const [principal, rate, months] of [[33333, 7.25, 37], [10000, 0, 3], [100000, 10, 12], [777, 13.5, 11], [50000, 0, 12]]) {
      const loan = calculateLoan(principal, rate, months);
      expect(installmentsLeft({ remaining: loan.total, installment: loan.monthly })).toBe(months);
    }
  });
});

describe('calculateInvestment', () => {
  it('grows a one-time amount with interest added monthly', () => {
    const result = calculateInvestment(100000, 12, 12, 'once');
    expect(result.finalValue).toBe(112682.5);
    expect(result.invested).toBe(100000);
    expect(result.profit).toBe(12682.5);
  });
  it('adds up monthly deposits', () => {
    const result = calculateInvestment(1000, 12, 12, 'monthly');
    expect(result.invested).toBe(12000);
    expect(result.finalValue).toBe(12682.5);
  });
  it('shows no profit at 0%', () => {
    expect(calculateInvestment(1000, 0, 12, 'monthly')).toEqual({ invested: 12000, profit: 0, finalValue: 12000 });
    expect(calculateInvestment(1000, 0, 12, 'once').finalValue).toBe(1000);
  });
});

describe('financeFormError', () => {
  const form = (over = {}) => ({ ...emptyFinanceForm, amount: '1000', rate: '10', ...over });
  it('accepts a sensible form, and a 0% rate', () => {
    expect(financeFormError(form())).toBeNull();
    expect(financeFormError(form({ rate: '0' }))).toBeNull();
  });
  it('wants an amount above 0', () => {
    expect(financeFormError(form({ amount: '' }))).toBe('fin.errAmount');
    expect(financeFormError(form({ amount: '0' }))).toBe('fin.errAmount');
    expect(financeFormError(form({ amount: '-5' }))).toBe('fin.errAmount');
  });
  it('wants a rate from 0 to 100', () => {
    expect(financeFormError(form({ rate: '' }))).toBe('fin.errRate');
    expect(financeFormError(form({ rate: '101' }))).toBe('fin.errRate');
    expect(financeFormError(form({ rate: '-1' }))).toBe('fin.errRate');
  });
  it('wants 1 month to 50 years', () => {
    expect(financeFormError(form({ years: '0', months: '0' }))).toBe('fin.errDuration');
    expect(financeFormError(form({ years: '51', months: '0' }))).toBe('fin.errDuration');
    expect(financeFormError(form({ years: '0', months: '1' }))).toBeNull();
    expect(financeFormError(form({ years: '50', months: '0' }))).toBeNull();
  });
});

describe('totalMonths', () => {
  it('adds years and months, treating blanks as none', () => {
    expect(totalMonths({ years: '2', months: '3' })).toBe(27);
    expect(totalMonths({ years: '', months: '3' })).toBe(3);
  });
});

describe('applyPadKey', () => {
  const type = (keys: Parameters<typeof applyPadKey>[1][], rules = FIELD_RULES.amount, from = '') =>
    keys.reduce((value, key) => applyPadKey(value, key, rules), from);
  it('builds a number', () => {
    expect(type(['1', '2', '0', '0'])).toBe('1200');
    expect(type(['1', '00'])).toBe('100');
    expect(type(['1', '.', '5'])).toBe('1.5');
  });
  it('has no leading zeros', () => {
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['00'])).toBe('0');
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['0', '.', '5'])).toBe('0.5');
  });
  it('allows one point, and two decimals', () => {
    expect(type(['1', '.', '.', '5'])).toBe('1.5');
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23');
    expect(type(['1', '.', '2', '00'])).toBe('1.20');
  });
  it('keeps to each field\'s size', () => {
    expect(type(['1', '2', '3', '4'], FIELD_RULES.rate)).toBe('123');
    expect(type(['1', '2', '3'], FIELD_RULES.years)).toBe('12');
    expect(type(['1', '.', '5'], FIELD_RULES.years)).toBe('15');
    expect(type(Array(20).fill('9'))).toHaveLength(13);
  });
  it('replaces the old number on the first digit after tapping a field', () => {
    expect(applyPadKey('1', '2', FIELD_RULES.years, true)).toBe('2');
    expect(applyPadKey('15.5', '.', FIELD_RULES.rate, true)).toBe('0.');
  });
  it('deletes and clears', () => {
    expect(applyPadKey('120', 'DEL', FIELD_RULES.amount)).toBe('12');
    expect(applyPadKey('', 'DEL', FIELD_RULES.amount)).toBe('');
    expect(applyPadKey('120', 'C', FIELD_RULES.amount)).toBe('');
    expect(applyPadKey('120', 'DEL', FIELD_RULES.amount, true)).toBe('12');
  });
});

describe('formatTyped', () => {
  it('adds commas and keeps what is unfinished', () => {
    expect(formatTyped('1250000')).toBe('1,250,000');
    expect(formatTyped('1000.')).toBe('1,000.');
    expect(formatTyped('1000.5')).toBe('1,000.5');
    expect(formatTyped('')).toBe('');
  });
});

describe('loanSchedule', () => {
  const sum = (list: number[]) => Math.round(list.reduce((a, b) => a + b, 0) * 100) / 100;
  it('starts with a known first month: 100,000 at 10%', () => {
    const [first] = loanSchedule(100000, 10, 12);
    expect(first.interest).toBe(833.33);
    expect(first.principal).toBe(7958.26);
    expect(first.balance).toBe(92041.74);
  });
  it('has one row a month, with interest falling and the balance ending at 0', () => {
    const rows = loanSchedule(100000, 10, 12);
    expect(rows).toHaveLength(12);
    expect(rows[11].balance).toBe(0);
    for (let i = 1; i < 12; i++) expect(rows[i].interest).toBeLessThan(rows[i - 1].interest);
  });
  it('adds up to exactly what the calculator showed, for many loans', () => {
    for (const [p, r, m] of [[100000, 10, 12], [500000, 9, 60], [33333, 7.25, 37], [777, 13.5, 11], [50000, 0, 12], [1000, 12, 1], [2500000, 11.5, 240]]) {
      const rows = loanSchedule(p, r, m);
      const loan = calculateLoan(p, r, m);
      expect(sum(rows.map(row => row.payment))).toBe(loan.total);
      expect(sum(rows.map(row => row.principal))).toBe(p);
      expect(rows.at(-1)!.balance).toBe(0);
      expect(rows.every(row => row.payment >= 0 && row.interest >= 0)).toBe(true);
    }
  });
  it('charges no interest at 0%', () => {
    expect(loanSchedule(12000, 0, 12).every(row => row.interest === 0)).toBe(true);
  });
});
