import { describe, expect, it } from 'vitest';
import { Expense } from '../../shared/types';
import { backupDue, backupSettings, cellOf, everythingTabs, expenseRows, humanize, oldBackups, recordRows, reportTabs, tabTitle } from './googleApps';

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;
const cat = (c: string) => `cat:${c}`;
const NOW = new Date('2026-11-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const exp = (over: Partial<Expense>): Expense => ({
  id: 'e', uid: 'u', title: 'Tea', amount: 20, category: 'Food', date: '2026-11-05T08:00:00.000Z', ...over,
});

describe('backup settings', () => {
  it('fills in daily automatic backups by default', () => {
    expect(backupSettings(undefined)).toMatchObject({ auto: true, every: 1, unit: 'days' });
  });

  it('keeps the number in range for the unit', () => {
    expect(backupSettings({ every: 500, unit: 'hours' }).every).toBe(72);
    expect(backupSettings({ every: 500, unit: 'days' }).every).toBe(30);
    expect(backupSettings({ every: 0, unit: 'days' }).every).toBe(1);
    expect(backupSettings({ every: 2.6, unit: 'hours' }).every).toBe(3);
  });
});

describe('backupDue', () => {
  it('backs up at once when there is no backup yet', () => {
    expect(backupDue({ auto: true }, NOW)).toBe(true);
  });

  it('never backs up by itself when automatic is off', () => {
    expect(backupDue({ auto: false }, NOW)).toBe(false);
  });

  it('waits for the chosen hours', () => {
    expect(backupDue({ auto: true, every: 6, unit: 'hours', lastAt: hoursAgo(5) }, NOW)).toBe(false);
    expect(backupDue({ auto: true, every: 6, unit: 'hours', lastAt: hoursAgo(6) }, NOW)).toBe(true);
  });

  it('waits for the chosen days', () => {
    expect(backupDue({ auto: true, every: 2, unit: 'days', lastAt: hoursAgo(47) }, NOW)).toBe(false);
    expect(backupDue({ auto: true, every: 2, unit: 'days', lastAt: hoursAgo(48) }, NOW)).toBe(true);
  });
});

describe('oldBackups', () => {
  it('leaves the newest ones and returns the rest', () => {
    const files = Array.from({ length: 12 }, (_, i) => ({ id: String(i), createdTime: hoursAgo(i) }));
    const old = oldBackups(files, 10);
    expect(old.map(f => f.id)).toEqual(['10', '11']);
    expect(oldBackups(files.slice(0, 3), 10)).toEqual([]);
  });
});

describe('sheet tables', () => {
  it('lists expenses newest first, with numbers kept as numbers', () => {
    const rows = expenseRows([
      exp({ id: '1', title: 'Old', date: '2026-10-01T00:00:00.000Z', amount: 10.005 }),
      exp({ id: '2', title: 'New', date: '2026-11-01T00:00:00.000Z', feeling: 'regret', accountName: 'bKash' }),
    ], 'BDT', t as never, cat);
    expect(rows[0][0]).toBe('sheet.date');
    expect(rows[1]).toEqual(['2026-11-01', 'New', 'cat:Food', 20, 'bKash', '', 'sheet.regret']);
    expect(rows[2][3]).toBe(10.01);
  });

  it('keeps text that looks like a formula as plain text', () => {
    const rows = expenseRows([exp({ title: '=HYPERLINK("x")' })], 'BDT', t as never, cat);
    expect(rows[1][1]).toBe('=HYPERLINK("x")'); // sent with valueInputOption RAW, so Sheets shows it as text
  });

  it('makes a summary, categories, months and the expense list for a report', () => {
    const tabs = reportTabs([
      exp({ amount: 30, category: 'Food' }),
      exp({ amount: 10, category: 'Bus', date: '2026-10-03T00:00:00.000Z' }),
    ], 'BDT', t as never, cat, 1000);
    expect(tabs.map(x => x.title)).toEqual(['sheet.tabSummary', 'sheet.tabCategories', 'sheet.tabMonths', 'sheet.tabExpenses']);
    expect(tabs[0].rows).toContainEqual(['sheet.totalSpent(BDT)', 40]);
    expect(tabs[0].rows).toContainEqual(['sheet.monthlyBudget(BDT)', 1000]);
    expect(tabs[1].rows[1]).toEqual(['cat:Food', 30, '75%']);
    expect(tabs[2].rows.slice(1)).toEqual([['2026-11', 30], ['2026-10', 10]]);
  });

  it('turns any records into a table without inside ids', () => {
    const rows = recordRows([
      { id: 'a', uid: 'u', accountId: 'x', name: 'Rahim', amount: 500, createdAt: '2026-11-01T10:00:00.000Z' },
      { id: 'b', uid: 'u', name: 'Karim', deposit: { amount: 100, day: 5 }, tags: ['a', 'b'] },
    ]);
    expect(rows[0]).toEqual(['Name', 'Amount', 'Created at', 'Deposit', 'Tags']);
    expect(rows[1]).toEqual(['Rahim', 500, '2026-11-01', '', '']);
    expect(rows[2]).toEqual(['Karim', '', '', 'Amount: 100, Day: 5', 'a; b']);
  });

  it('skips empty kinds and leaves chats out of "export everything"', () => {
    const tabs = everythingTabs({
      expenses: [exp({})],
      debts: [{ id: 'd', name: 'Rahim', amount: 50 }],
      chats: [{ id: 'c', title: 'Hi' }],
      funds: [],
    } as never, 'BDT', t as never, cat);
    expect(tabs.map(x => x.title)).toEqual(['sheet.kind.expenses', 'sheet.kind.debts']);
  });

  it('cleans tab names and words', () => {
    expect(tabTitle('Food/Bus: [x]?')).toBe('Food Bus   x');
    expect(tabTitle('')).toBe('Sheet');
    expect(humanize('balanceHistory')).toBe('Balance history');
    expect(cellOf(null)).toBe('');
    expect(cellOf(true)).toBe(true);
  });
});
