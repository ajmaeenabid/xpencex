import { describe, it, expect } from 'vitest';
import { findDuplicate, firstDepositDate, dueDeposits, depositDate, accountDisplayName } from './accounts';

const accounts = [
  { id: 'a', type: 'bank' as const, name: 'BRAC Bank', label: 'Savings' },
  { id: 'b', type: 'bkash' as const, name: 'bKash', label: '123' },
];

describe('findDuplicate', () => {
  it('matches the same bank and account type, ignoring case and spaces', () => {
    expect(findDuplicate(accounts, { type: 'bank', name: ' brac  bank ', label: 'SAVINGS' })?.id).toBe('a');
  });

  it('allows another account type at the same bank', () => {
    expect(findDuplicate(accounts, { type: 'bank', name: 'BRAC Bank', label: 'Salary' })).toBeUndefined();
  });

  it('matches the same mobile provider and last 3 digits only', () => {
    expect(findDuplicate(accounts, { type: 'bkash', name: 'bKash', label: '123' })?.id).toBe('b');
    expect(findDuplicate(accounts, { type: 'nagad', name: 'Nagad', label: '123' })).toBeUndefined();
  });

  it('ignores the account being edited', () => {
    expect(findDuplicate(accounts, { type: 'bank', name: 'BRAC Bank', label: 'Savings' }, 'a')).toBeUndefined();
  });
});

describe('deposit dates', () => {
  it('uses the last day of shorter months', () => {
    expect(depositDate(2026, 1, 31).getDate()).toBe(28); // February 2026
    expect(depositDate(2026, 10, 31).getDate()).toBe(30); // November
  });

  it('first deposit is later this month, or next month when the day has passed or is today', () => {
    const now = new Date(2026, 9, 24, 15, 0); // 24 Oct 2026
    expect(new Date(firstDepositDate(28, now)).getMonth()).toBe(9);
    expect(new Date(firstDepositDate(24, now)).getMonth()).toBe(10);
    expect(new Date(firstDepositDate(5, now)).getMonth()).toBe(10);
  });

  it('catches up every missed month and keeps the original day', () => {
    const start = depositDate(2026, 0, 31).toISOString(); // 31 Jan
    const { due, next } = dueDeposits(start, 31, new Date(2026, 3, 1)); // 1 Apr
    expect(due.map(d => new Date(d).getDate())).toEqual([31, 28, 31]); // Jan, Feb, Mar
    expect(new Date(next).getMonth()).toBe(3);
    expect(new Date(next).getDate()).toBe(30);
  });
});

describe('accountDisplayName', () => {
  it('formats banks and wallets', () => {
    expect(accountDisplayName(accounts[0])).toBe('BRAC Bank · Savings');
    expect(accountDisplayName(accounts[1])).toBe('bKash ···123');
  });
});
