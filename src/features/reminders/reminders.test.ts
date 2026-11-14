import { describe, it, expect } from 'vitest';
import { DEFAULT_REMINDERS, ReminderData, budgetAlert, planReminders, reminderSettings, streakDays } from './reminders';

const now = new Date(2026, 10, 11, 15, 0); // Wednesday 11 Nov 2026, 3 PM
const day = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
const base: ReminderData = { now, expenseDates: [], weekSpent: 0, lastWeekSpent: 0, loans: [], samityRounds: [], goals: [] };

describe('settings', () => {
  it('fills missing switches from the defaults (all on, 9 PM)', () => {
    const s = reminderSettings({ on: { weekly: false } as never });
    expect(s.on.weekly).toBe(false);
    expect(s.on.daily).toBe(true);
    expect(s.time).toBe('21:00');
    expect(reminderSettings({ time: 'bad' }).time).toBe('21:00');
  });
});

describe('daily reminder', () => {
  it('is set for each of the next days at the chosen time', () => {
    const daily = planReminders(DEFAULT_REMINDERS, base).filter(r => r.kind === 'daily');
    expect(daily).toHaveLength(7);
    expect(daily[0].at).toEqual(new Date(2026, 10, 11, 21, 0));
  });

  it('skips today when something was already added', () => {
    const daily = planReminders(DEFAULT_REMINDERS, { ...base, expenseDates: [day(11, 9)] }).filter(r => r.kind === 'daily');
    expect(daily[0].at).toEqual(new Date(2026, 10, 12, 21, 0));
  });

  it('becomes the streak message tonight after 3 days in a row', () => {
    const plan = planReminders(DEFAULT_REMINDERS, { ...base, expenseDates: [day(8), day(9), day(10)] });
    expect(plan[0]).toMatchObject({ kind: 'streak', text: { key: 'streak', days: 3 } });
  });

  it('can be switched off', () => {
    const off = { ...DEFAULT_REMINDERS, on: { ...DEFAULT_REMINDERS.on, daily: false, streak: false } };
    expect(planReminders(off, base).some(r => r.kind === 'daily' || r.kind === 'streak')).toBe(false);
  });
});

describe('streakDays', () => {
  it('counts days in a row ending today or yesterday', () => {
    expect(streakDays([day(9), day(10), day(11)], now)).toBe(3);
    expect(streakDays([day(9), day(10)], now)).toBe(2); // nothing yet today: still counts to yesterday
    expect(streakDays([day(8), day(10)], now)).toBe(1);
    expect(streakDays([], now)).toBe(0);
  });
});

describe('other reminders', () => {
  it('reminds the evening before a loan installment', () => {
    const plan = planReminders(DEFAULT_REMINDERS, { ...base, loans: [{ id: 'l1', name: 'Bike loan', installment: 5000, nextDueDate: day(15) }] });
    expect(plan.find(r => r.kind === 'loan')!.at).toEqual(new Date(2026, 10, 14, 20, 0));
  });

  it('reminds on a samity payment day', () => {
    const plan = planReminders(DEFAULT_REMINDERS, { ...base, samityRounds: [{ id: 's1', name: 'Office samity', amount: 2000, date: new Date(2026, 10, 13) }] });
    expect(plan.find(r => r.kind === 'samity')!.at).toEqual(new Date(2026, 10, 13, 9, 0));
  });

  it('sends the weekly summary on Sunday evening with the change', () => {
    const weekly = planReminders(DEFAULT_REMINDERS, { ...base, weekSpent: 1100, lastWeekSpent: 1000 }).find(r => r.kind === 'weekly')!;
    expect(weekly.at).toEqual(new Date(2026, 10, 15, 20, 0));
    expect(weekly.text).toEqual({ key: 'weekly', spent: 1100, change: 0.1 });
  });

  it('sends the monthly report on the 1st', () => {
    const monthly = planReminders(DEFAULT_REMINDERS, base).find(r => r.kind === 'monthly')!;
    expect(monthly.at).toEqual(new Date(2026, 11, 1, 10, 0));
  });

  it('nudges about dated goals before the day, never for ones already reached or past', () => {
    const plan = planReminders(DEFAULT_REMINDERS, { ...base, goals: [
      { id: 'g1', name: 'Eid', dueDate: day(28), progress: 0.6 },
      { id: 'g2', name: 'Done', dueDate: day(28), progress: 1 },
      { id: 'g3', name: 'Bike', progress: 0.2 },
    ] }).filter(r => r.kind === 'goal');
    expect(plan.map(r => r.at)).toEqual([new Date(2026, 10, 14, 19, 0), new Date(2026, 10, 25, 19, 0)]);
    expect(plan[0].text).toEqual({ key: 'goal', name: 'Eid', days: 14, percent: 60 });
  });

  it('never schedules anything in the past', () => {
    const plan = planReminders(DEFAULT_REMINDERS, { ...base, loans: [{ id: 'l1', name: 'Loan', installment: 1, nextDueDate: day(11) }] });
    expect(plan.every(r => r.at > now)).toBe(true);
  });
});

describe('budgetAlert', () => {
  it('sends 80% and 100% once each', () => {
    expect(budgetAlert(700, 1000, [])).toBeNull();
    expect(budgetAlert(850, 1000, [])).toBe(80);
    expect(budgetAlert(850, 1000, [80])).toBeNull();
    expect(budgetAlert(1200, 1000, [80])).toBe(100);
    expect(budgetAlert(1200, 1000, [80, 100])).toBeNull();
    expect(budgetAlert(500, 0, [])).toBeNull();
  });
});
