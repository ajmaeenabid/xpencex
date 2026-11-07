import { describe, it, expect } from 'vitest';
import { LoanForm, activeLoans, installmentsLeft, loanFormError, loanProgress, nextAmount } from './loans';
// The server's own date and payment logic, shared with the app
import { duePayments, firstInstallmentDate, installmentDate, nextInstallmentDate } from '../../../ai-server/src/loanDates';
import { Loan } from '../../shared/types';

const bd = (iso: string) => Date.parse(iso); // times below are written in UTC; Bangladesh is UTC+6

describe('installment dates (Bangladesh time, 9:00)', () => {
  it('falls at 9:00 Bangladesh time, moving to the last day of short months', () => {
    expect(installmentDate(2026, 10, 5).toISOString()).toBe('2026-11-05T03:00:00.000Z');
    expect(installmentDate(2026, 10, 31).toISOString()).toBe('2026-11-30T03:00:00.000Z');
    expect(installmentDate(2027, 1, 30).toISOString()).toBe('2027-02-28T03:00:00.000Z');
  });

  it('starts after today, using the Bangladesh date', () => {
    // 30 Oct, 10:00 in Bangladesh
    const now = bd('2026-10-30T04:00:00Z');
    expect(firstInstallmentDate(31, now)).toBe('2026-10-31T03:00:00.000Z');
    expect(firstInstallmentDate(30, now)).toBe('2026-11-30T03:00:00.000Z'); // today is too soon
    expect(firstInstallmentDate(5, now)).toBe('2026-11-05T03:00:00.000Z');
    // 31 Dec, 23:30 in Bangladesh (17:30 UTC): the 1st is tomorrow there, so January
    expect(firstInstallmentDate(1, bd('2026-12-31T17:30:00Z'))).toBe('2027-01-01T03:00:00.000Z');
    // 1 Jan, 01:00 in Bangladesh (still 31 Dec in UTC): the 1st is today there, so February
    expect(firstInstallmentDate(1, bd('2026-12-31T19:00:00Z'))).toBe('2027-02-01T03:00:00.000Z');
  });

  it('keeps the chosen day after a short month', () => {
    const feb = nextInstallmentDate('2027-01-31T03:00:00.000Z', 31);
    expect(feb).toBe('2027-02-28T03:00:00.000Z');
    expect(nextInstallmentDate(feb, 31)).toBe('2027-03-31T03:00:00.000Z');
  });
});

describe('due installments', () => {
  const loan = { remaining: 12000, installment: 5000, nextDueDate: '2026-11-05T03:00:00.000Z', day: 5 };

  it('takes nothing before the date', () => {
    expect(duePayments(loan, bd('2026-11-05T02:59:00Z')).payments).toEqual([]);
  });

  it('takes every missed month, and only what is left at the end', () => {
    const { payments, remaining, next, paidOff } = duePayments(loan, bd('2027-02-01T00:00:00Z'));
    expect(payments).toEqual([
      { date: '2026-11-05T03:00:00.000Z', amount: 5000 },
      { date: '2026-12-05T03:00:00.000Z', amount: 5000 },
      { date: '2027-01-05T03:00:00.000Z', amount: 2000 },
    ]);
    expect(remaining).toBe(0);
    expect(paidOff).toBe(true);
    expect(next).toBe('2027-02-05T03:00:00.000Z');
  });

  it('handles paisa without rounding drift', () => {
    const { payments, remaining } = duePayments({ ...loan, remaining: 100.3, installment: 33.43 }, bd('2027-06-01T00:00:00Z'));
    expect(payments.map(p => p.amount)).toEqual([33.43, 33.43, 33.43, 0.01]);
    expect(remaining).toBe(0);
  });
});

describe('loan form and list', () => {
  const form: LoanForm = { name: 'Car loan', lender: '', total: '60000', installment: '5000', day: '5', addMoney: true, receiveInto: 'acc1' };

  it('checks the form', () => {
    expect(loanFormError(form, { needsLender: false })).toBeNull();
    expect(loanFormError(form, { needsLender: true })).toBe('loans.errorLender');
    expect(loanFormError({ ...form, name: ' ' }, { needsLender: false })).toBe('loans.errorName');
    expect(loanFormError({ ...form, installment: '70000' }, { needsLender: false })).toBe('loans.errorTooBig');
    expect(loanFormError({ ...form, receiveInto: '' }, { needsLender: false })).toBe('loans.errorReceive');
    // After the first installment the total is locked, so only the installment is checked
    expect(loanFormError({ ...form, total: '', addMoney: false }, { needsLender: false, editingPaidLoan: true })).toBeNull();
  });

  it('works out progress, installments left and the next amount', () => {
    expect(loanProgress({ total: 60000, remaining: 45000 })).toBe(25);
    expect(installmentsLeft({ remaining: 12000, installment: 5000 })).toBe(3);
    expect(nextAmount({ remaining: 2000, installment: 5000 })).toBe(2000);
  });

  it('lists active loans soonest first', () => {
    const l = (id: string, status: Loan['status'], nextDueDate: string) => ({ id, status, nextDueDate }) as Loan;
    const list = [l('a', 'active', '2026-12-05'), l('b', 'paid', '2026-11-01'), l('c', 'active', '2026-11-10')];
    expect(activeLoans(list).map(x => x.id)).toEqual(['c', 'a']);
  });
});
