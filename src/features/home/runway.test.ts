import { describe, it, expect } from 'vitest';
import { runway } from './runway';

const now = new Date('2026-11-20T12:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const daysAhead = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe('runway', () => {
  it('divides the money by the average daily spending of the last 30 days', () => {
    const r = runway({
      accounts: [{ balance: 6000 }, { balance: 3000 }],
      expenses: [{ amount: 3000, date: daysAgo(5) }, { amount: 6000, date: daysAgo(20) }, { amount: 9999, date: daysAgo(31) }],
      now,
    });
    expect(r.money).toBe(9000);
    expect(r.perDay).toBe(300); // 9000 over 30 days; the 31-day-old expense is left out
    expect(r.days).toBe(30);
    expect(r.basedOnDays).toBe(30);
  });

  it('averages a new user over their own days only', () => {
    const r = runway({ accounts: [{ balance: 1000 }], expenses: [{ amount: 400, date: daysAgo(1) }], now, userSince: new Date(daysAgo(4)) });
    expect(r.basedOnDays).toBe(4);
    expect(r.perDay).toBe(100);
    expect(r.days).toBe(10);
  });

  it("doesn't count days the loaded expenses don't cover", () => {
    expect(runway({ accounts: [{ balance: 100 }], expenses: [], now, dataSince: new Date(daysAgo(28)) }).basedOnDays).toBe(28);
  });

  it('has no day count when nothing was spent', () => {
    const r = runway({ accounts: [{ balance: 500 }], expenses: [], now });
    expect(r.days).toBeNull();
    expect(r.runsOutOn).toBeNull();
  });

  it('says 0 days with no money left', () => {
    expect(runway({ accounts: [{ balance: -50 }], expenses: [{ amount: 300, date: daysAgo(2) }], now }).days).toBe(0);
  });

  it('checks the money lasts until the next monthly deposit', () => {
    const accounts = [{ balance: 3000, deposit: { amount: 10000, day: 1 }, nextDepositDate: daysAhead(10) }];
    const enough = runway({ accounts, expenses: [{ amount: 6000, date: daysAgo(10) }], now }); // 200 a day, 15 days
    expect(enough.nextDeposit).toMatchObject({ daysUntil: 10, lasts: true, shortByDays: 0, safePerDay: 300 });

    const short = runway({ accounts, expenses: [{ amount: 15000, date: daysAgo(10) }], now }); // 500 a day, 6 days
    expect(short.nextDeposit).toMatchObject({ daysUntil: 10, lasts: false, shortByDays: 4, safePerDay: 300 });
  });

  it('ignores deposits without a future date', () => {
    expect(runway({ accounts: [{ balance: 1, deposit: { amount: 5, day: 1 }, nextDepositDate: daysAgo(1) }], expenses: [], now }).nextDeposit).toBeNull();
  });
});
