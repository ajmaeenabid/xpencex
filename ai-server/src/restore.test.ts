import { describe, it, expect } from 'vitest';
import { cleanLoan } from './restore';

const loan = (extra: Record<string, unknown> = {}) => ({
  id: 'loan1', uid: 'old', accountId: 'acc1', accountName: 'BRAC Bank · Savings', name: 'Laptop',
  total: 60000, remaining: 40000, installment: 5000, day: 10, nextDueDate: '2026-12-10T03:00:00.000Z',
  status: 'active', paidCount: 4, createdAt: '2026-07-01T10:00:00.000Z', lastPaidAt: '2026-11-10T03:00:00.000Z', lastPaidAmount: 5000,
  ...extra,
});

describe('restoring loans', () => {
  it('keeps a good loan, with its payments, and gives it to the current user', () => {
    const r = cleanLoan(loan(), 'me');
    expect(r?.id).toBe('loan1');
    expect(r?.data).toMatchObject({ uid: 'me', remaining: 40000, paidCount: 4, lastPaidAmount: 5000 });
  });

  it('refuses impossible numbers', () => {
    expect(cleanLoan(loan({ remaining: 70000 }), 'me')).toBeNull(); // more left than borrowed
    expect(cleanLoan(loan({ remaining: -1 }), 'me')).toBeNull();
    expect(cleanLoan(loan({ installment: 0 }), 'me')).toBeNull();
    expect(cleanLoan(loan({ day: 32 }), 'me')).toBeNull();
    expect(cleanLoan(loan({ paidCount: 1.5 }), 'me')).toBeNull();
  });

  it('refuses bad ids, dates and statuses', () => {
    expect(cleanLoan(loan({ id: '../loans/x' }), 'me')).toBeNull();
    expect(cleanLoan(loan({ nextDueDate: 'soon' }), 'me')).toBeNull();
    expect(cleanLoan(loan({ status: 'forgiven' }), 'me')).toBeNull();
    expect(cleanLoan(null, 'me')).toBeNull();
  });

  it('drops fields the app never saves', () => {
    expect(cleanLoan(loan({ admin: true, uid: 'someone' }), 'me')?.data).not.toHaveProperty('admin');
  });
});
