import { describe, expect, it } from 'vitest';
import { Account, Loan } from '../../shared/types';
import { Debt } from '../debts/debts';
import { Fund } from '../funds/funds';
import { Samity } from '../samity/samity';
import { calendarLink } from './calendar';
import { SavedBalanceLine, accountsTabs, debtsTabs, fundsTabs, samityTabs } from './exportTables';

const t = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key) as never;

describe('calendarLink', () => {
  it('makes an all-day Google Calendar event', () => {
    const url = new URL(calendarLink({ title: 'Loan payment', date: new Date(2026, 11, 1), details: 'From bKash' }));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Loan payment');
    expect(url.searchParams.get('dates')).toBe('20261201/20261202');
    expect(url.searchParams.get('details')).toBe('From bKash');
    expect(url.searchParams.get('recur')).toBeNull();
  });

  it('repeats monthly or weekly, only when there is more than one', () => {
    const monthly = new URL(calendarLink({ title: 'x', date: new Date(2026, 0, 31), repeat: { every: 'month', times: 6 } }));
    expect(monthly.searchParams.get('recur')).toBe('RRULE:FREQ=MONTHLY;COUNT=6');
    const weekly = new URL(calendarLink({ title: 'x', date: new Date(2026, 0, 1), repeat: { every: 'week', times: 3 } }));
    expect(weekly.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;COUNT=3');
    const once = new URL(calendarLink({ title: 'x', date: new Date(2026, 0, 1), repeat: { every: 'month', times: 1 } }));
    expect(once.searchParams.get('recur')).toBeNull();
  });
});

describe('accountsTabs', () => {
  const accounts = [{ id: 'a1', uid: 'u', type: 'bkash', name: 'bKash', label: '123', balance: 1500.5, deposit: { amount: 2000, day: 5 } }] as Account[];
  const history: SavedBalanceLine[] = [
    { accountId: 'a1', kind: 'change', amount: -200, reason: 'expense', title: 'Lunch', at: '2026-11-02T08:00:00.000Z' },
    { accountId: 'a1', kind: 'set', amount: 1700, previous: 1000, reason: 'corrected', at: '2026-11-03T08:00:00.000Z' },
    { accountId: 'gone', kind: 'change', amount: 50, reason: 'moneyIn', at: '2026-11-01T08:00:00.000Z' },
  ];
  const loans = [{ id: 'l', uid: 'u', accountId: 'a1', accountName: 'bKash', name: 'Phone', total: 6000, remaining: 3000, installment: 1000, day: 1, nextDueDate: '2026-12-01T00:00:00.000Z', status: 'active', paidCount: 3, createdAt: '2026-08-01T00:00:00.000Z' }] as Loan[];

  it('lists accounts, history newest first, and loans', () => {
    const tabs = accountsTabs(accounts, history, loans, 'BDT', t);
    expect(tabs.map(x => x.title)).toEqual(['sheet.kind.accounts', 'sheet.kind.balanceHistory', 'sheet.kind.loans']);
    expect(tabs[0].rows[1]).toEqual(['bKash ···123', 1500.5, 2000, 5, '']);
    // A set line shows how much it moved and the balance after; a change line only how much it moved
    expect(tabs[1].rows[1]).toEqual(['2026-11-03', 'bKash ···123', 'balance.reason.corrected', '', 700, 1700]);
    expect(tabs[1].rows[2]).toEqual(['2026-11-02', 'bKash ···123', 'balance.reason.expense', 'Lunch', -200, '']);
    expect(tabs[1].rows[3][1]).toBe('sheet.deletedAccount');
    expect(tabs[2].rows[1]).toEqual(['Phone', '', 'bKash', 6000, 3000, 1000, 1, '2026-12-01', 3, 3, 'loans.statusActive']);
  });

  it('leaves out empty history and loan tabs', () => {
    expect(accountsTabs(accounts, [], [], 'BDT', t).map(x => x.title)).toEqual(['sheet.kind.accounts']);
  });
});

describe('debtsTabs', () => {
  it('shows where you stand with each person and every entry', () => {
    const debt = (over: Partial<Debt>): Debt => ({ id: 'd', uid: 'u', person: 'Rahim', kind: 'lent', amount: 500, date: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', ...over });
    const tabs = debtsTabs([
      debt({ id: '1' }),
      debt({ id: '2', kind: 'gotBack', amount: 200, date: '2026-11-04T00:00:00.000Z' }),
      debt({ id: '3', person: 'Karim', kind: 'borrowed', amount: 100 }),
    ], 'BDT', t);
    expect(tabs[0].rows).toContainEqual(['Rahim', 'sheet.theyOwe', 300, '2026-11-04']);
    expect(tabs[0].rows).toContainEqual(['Karim', 'sheet.youOwe', 100, '2026-11-01']);
    expect(tabs[1].rows[1]).toEqual(['2026-11-04', 'Rahim', 'debts.kind.gotBack', 200, '', '']);
  });
});

describe('fundsTabs', () => {
  it('shows each goal with what is left', () => {
    const fund: Fund = { id: 'f', uid: 'u', name: 'Eid', target: 10000, saved: 4000, dueDate: '2027-03-20T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' };
    const [tab] = fundsTabs([fund], 'BDT', t, new Date('2026-11-08T00:00:00.000Z'));
    expect(tab.rows[1].slice(0, 5)).toEqual(['Eid', '2027-03-20', 10000, 4000, 6000]);
    expect(tab.rows[1][8]).toBe('sheet.no');
  });
});

describe('samityTabs', () => {
  it('gives one line per samity and one per round', () => {
    const s: Samity = { id: 's', uid: 'u', name: 'Office', amount: 1000, frequency: 'monthly', members: 3, startDate: '2026-09-01T00:00:00.000Z', myTurn: 2, payments: { '1': '' }, createdAt: '2026-09-01T00:00:00.000Z' };
    const [summary, rounds] = samityTabs([s], 'BDT', t);
    expect(summary.rows[1]).toEqual(['Office', 1000, 'samity.monthly', 3, 2, '2026-10-01', 3000, 1, 'sheet.no']);
    expect(rounds.rows.slice(1)).toEqual([
      ['Office', 1, '2026-09-01', 'sheet.yes', ''],
      ['Office', 2, '2026-10-01', 'sheet.no', 'sheet.yes'],
      ['Office', 3, '2026-11-01', 'sheet.no', ''],
    ]);
  });
});
