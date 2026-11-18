import { describe, it, expect } from 'vitest';
import { MAX_PLANNED, nextPlannedDate, plannedDates, plannedProblem, sortPlanned } from './planned';
import { buildForecast, everydayExpenses, shortfallAlert } from './forecast';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const dayOf = (iso: string) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

describe('planned dates', () => {
  it('happens once, then has no next date', () => {
    expect(nextPlannedDate({ date: at(2026, 12, 10), repeat: 'once', day: 10 })).toBeNull();
  });

  it('repeats weekly, monthly and yearly', () => {
    expect(dayOf(nextPlannedDate({ date: at(2026, 12, 28), repeat: 'weekly', day: 28 })!)).toEqual([2027, 1, 4]);
    expect(dayOf(nextPlannedDate({ date: at(2026, 12, 10), repeat: 'monthly', day: 10 })!)).toEqual([2027, 1, 10]);
    expect(dayOf(nextPlannedDate({ date: at(2026, 12, 10), repeat: 'yearly', day: 10 })!)).toEqual([2027, 12, 10]);
  });

  it('uses the last day of a short month, then returns to the 31st', () => {
    const feb = nextPlannedDate({ date: at(2027, 1, 31), repeat: 'monthly', day: 31 })!;
    expect(dayOf(feb)).toEqual([2027, 2, 28]);
    expect(dayOf(nextPlannedDate({ date: feb, repeat: 'monthly', day: 31 })!)).toEqual([2027, 3, 31]);
  });

  it('handles 29 February in a yearly plan', () => {
    expect(dayOf(nextPlannedDate({ date: at(2028, 2, 29), repeat: 'yearly', day: 29 })!)).toEqual([2029, 2, 28]);
  });

  it('lists every date up to the end of the window', () => {
    const dates = plannedDates({ date: at(2026, 12, 1), repeat: 'weekly', day: 1 }, new Date(2026, 11, 16));
    expect(dates.map(d => dayOf(d)[2])).toEqual([1, 8, 15]);
  });

  it('sorts the soonest first', () => {
    expect(sortPlanned([{ date: at(2027, 1, 1) }, { date: at(2026, 12, 1) }])[0].date).toBe(at(2026, 12, 1));
  });
});

describe('checking a plan', () => {
  const now = new Date(2026, 10, 18, 10);
  const good = { title: 'School fee', amount: 3000, day: '2026-12-10' };

  it('accepts a good plan, including one due today', () => {
    expect(plannedProblem(good, 0, true, now)).toBeNull();
    expect(plannedProblem({ ...good, day: '2026-11-18' }, 0, true, now)).toBeNull();
  });

  it('refuses a missing title, a bad amount or a past date', () => {
    expect(plannedProblem({ ...good, title: ' ' }, 0, true, now)).toBe('title');
    expect(plannedProblem({ ...good, amount: 0 }, 0, true, now)).toBe('amount');
    expect(plannedProblem({ ...good, amount: NaN }, 0, true, now)).toBe('amount');
    expect(plannedProblem({ ...good, day: '2026-11-17' }, 0, true, now)).toBe('date');
  });

  it('lets an overdue plan be edited', () => {
    expect(plannedProblem({ ...good, day: '2026-11-17' }, 1, false, now)).toBeNull();
  });

  it('refuses secret codes in the title', () => {
    expect(plannedProblem({ ...good, title: 'OTP 482913' }, 0, true, now)).toBe('secret');
  });

  it('stops at the most a person can keep, but still allows edits', () => {
    expect(plannedProblem(good, MAX_PLANNED, true, now)).toBe('full');
    expect(plannedProblem(good, MAX_PLANNED, false, now)).toBeNull();
  });
});

describe('balance forecast', () => {
  const now = new Date(2026, 10, 18, 10);
  const plan = (extra = {}) => ({ kind: 'expense' as const, title: 'Rent', amount: 500, date: at(2026, 11, 20), repeat: 'once' as const, day: 20, ...extra });

  it('takes everyday spending from tomorrow, not today', () => {
    const f = buildForecast({ now, balance: 1000, perDay: 10 });
    expect(f.points).toHaveLength(31);
    expect(f.points[0].balance).toBe(1000);
    expect(f.points[1].balance).toBe(990);
    expect(f.points[30].balance).toBe(700);
  });

  it('counts planned money out and in on its day', () => {
    const f = buildForecast({ now, balance: 1000, perDay: 0, planned: [plan(), plan({ kind: 'income', amount: 200, date: at(2026, 11, 22), day: 22 })] });
    expect(f.points[1].balance).toBe(1000);
    expect(f.points[2].balance).toBe(500);
    expect(f.points[4].balance).toBe(700);
  });

  it('counts an overdue payment today', () => {
    const f = buildForecast({ now, balance: 1000, perDay: 0, planned: [plan({ date: at(2026, 11, 10), day: 10 })] });
    expect(f.points[0].balance).toBe(500);
  });

  it('counts each repeat inside the 30 days', () => {
    const f = buildForecast({ now, balance: 1000, perDay: 0, planned: [plan({ amount: 100, repeat: 'weekly' })] });
    expect(f.events).toHaveLength(5);
    expect(f.points[30].balance).toBe(500);
  });

  it('counts repeating expenses, monthly income, deposits and loans', () => {
    const f = buildForecast({
      now, balance: 10000, perDay: 0,
      recurring: [{ title: 'Internet', amount: 1000, frequency: 'monthly', nextDate: at(2026, 11, 25) }],
      incomeRules: [{ title: 'Salary', amount: 5000, day: 1, nextDate: at(2026, 12, 1) }],
      accounts: [{ name: 'Bank', deposit: { amount: 2000, day: 5 }, nextDepositDate: at(2026, 12, 5) }],
      loans: [{ name: 'Bike', status: 'active', remaining: 300, installment: 800, nextDueDate: new Date(2026, 10, 28, 12).toISOString(), day: 28 }],
    });
    expect(f.events.map(e => e.source)).toEqual(['recurring', 'loan', 'income', 'deposit']);
    // The loan's last installment is only what is left of it
    expect(f.points[30].balance).toBe(15700);
  });

  it('leaves out loans that are finished', () => {
    const f = buildForecast({ now, balance: 100, perDay: 0, loans: [{ name: 'Old', status: 'paid', remaining: 0, installment: 50, nextDueDate: at(2026, 11, 28), day: 28 }] });
    expect(f.events).toHaveLength(0);
  });

  it('finds the first day below zero and the lowest point', () => {
    const f = buildForecast({ now, balance: 300, perDay: 0, planned: [plan(), plan({ kind: 'income', amount: 1000, date: at(2026, 11, 25), day: 25 })] });
    expect(f.shortOn?.getDate()).toBe(20);
    expect(f.lowest.balance).toBe(-200);
  });

  it('has no shortfall when the money lasts', () => {
    expect(buildForecast({ now, balance: 1000, perDay: 1 }).shortOn).toBeNull();
  });

  it('keeps dated spending out of the daily average, so nothing counts twice', () => {
    const list = [{ id: 'a' }, { id: 'b', recurringId: 'r' }, { id: 'c', plannedId: 'p' }, { id: 'd', loanId: 'l' }];
    expect(everydayExpenses(list).map(e => e.id)).toEqual(['a']);
  });
});

describe('the low money alert', () => {
  const now = new Date(2026, 10, 18, 10);

  it('sends once when money runs short within a week', () => {
    expect(shortfallAlert(new Date(2026, 10, 25), false, now)).toEqual({ send: true, sent: true });
    expect(shortfallAlert(new Date(2026, 10, 25), true, now)).toEqual({ send: false, sent: true });
  });

  it('waits when the shortfall is more than a week away', () => {
    expect(shortfallAlert(new Date(2026, 10, 26), false, now)).toEqual({ send: false, sent: false });
  });

  it('can warn again after the shortfall has gone', () => {
    expect(shortfallAlert(null, true, now)).toEqual({ send: false, sent: false });
  });
});
