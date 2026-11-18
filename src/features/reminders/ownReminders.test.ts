import { describe, it, expect } from 'vitest';
import { DEFAULT_REMINDERS, MAX_OWN_REMINDERS, OwnReminder, ReminderData, ownOccurrences, ownReminderProblem, planReminders, reminderStart } from './reminders';
import { readAction } from '../chat/agent/actions';

const now = new Date(2026, 10, 16, 15, 0); // Monday 16 Nov 2026, 3 PM
const own = (at: Date, repeat: OwnReminder['repeat'], text = 'Pay rent'): OwnReminder =>
  ({ id: text, uid: 'u', text, at: at.toISOString(), repeat, createdAt: '2026-11-16T00:00:00.000Z' });

describe('ownOccurrences', () => {
  it('rings once if still ahead, never if past', () => {
    expect(ownOccurrences(own(new Date(2026, 10, 20, 9), 'once'), now)).toEqual([new Date(2026, 10, 20, 9)]);
    expect(ownOccurrences(own(new Date(2026, 10, 10, 9), 'once'), now)).toEqual([]);
  });

  it('repeats weekly from the first time, skipping what has passed', () => {
    expect(ownOccurrences(own(new Date(2026, 10, 2, 9), 'weekly'), now)).toEqual([new Date(2026, 10, 23, 9), new Date(2026, 10, 30, 9)]);
  });

  it('repeats monthly, on the last day when a month is shorter', () => {
    const r = own(new Date(2026, 0, 31, 9), 'monthly');
    expect(ownOccurrences(r, now, 4)).toEqual([
      new Date(2026, 10, 30, 9), new Date(2026, 11, 31, 9), new Date(2027, 0, 31, 9), new Date(2027, 1, 28, 9),
    ]);
  });
});

describe('ownReminderProblem', () => {
  it('needs words, a future time for one-off reminders, and room for one more', () => {
    const later = new Date(2026, 10, 20, 9);
    expect(ownReminderProblem('Rent', later, 'once', 0, now)).toBeNull();
    expect(ownReminderProblem('  ', later, 'once', 0, now)).toBe('text');
    expect(ownReminderProblem('Rent', new Date(2026, 10, 1), 'once', 0, now)).toBe('time');
    expect(ownReminderProblem('Rent', new Date(2026, 10, 1), 'monthly', 0, now)).toBeNull();
    expect(ownReminderProblem('Rent', later, 'yearly', 0, now)).toBe('repeat');
    expect(ownReminderProblem('Rent', later, 'once', MAX_OWN_REMINDERS, now)).toBe('full');
  });
});

describe('planReminders with own reminders', () => {
  it('plans the next two times, even with every automatic one off and weeks ahead', () => {
    const off = { ...DEFAULT_REMINDERS, on: Object.fromEntries(Object.keys(DEFAULT_REMINDERS.on).map(k => [k, false])) as typeof DEFAULT_REMINDERS.on };
    const data: ReminderData = { now, expenseDates: [], weekSpent: 0, lastWeekSpent: 0, loans: [], samityRounds: [], goals: [], own: [own(new Date(2026, 11, 1, 9), 'monthly')] };
    const plan = planReminders(off, data);
    expect(plan.map(r => r.at)).toEqual([new Date(2026, 11, 1, 9), new Date(2027, 0, 1, 9)]);
    expect(plan[0]).toMatchObject({ kind: 'own', text: { key: 'own', text: 'Pay rent' } });
    expect(new Set(plan.map(r => r.id)).size).toBe(2);
    expect(plan.every(r => r.id >= 10000)).toBe(true);
  });
});

describe('reminder from chat', () => {
  const data = { accounts: [], expenses: [], incomes: [], categories: [] };
  it('reads the words, day, time and repeat, with 9 AM when no time is given', () => {
    expect(readAction({ kind: 'reminder', text: 'Pay rent', date: '2026-12-01', repeat: 'monthly' }, data))
      .toEqual({ kind: 'reminder', text: 'Pay rent', at: reminderStart('2026-12-01', '09:00').toISOString(), repeat: 'monthly' });
    expect(readAction({ kind: 'reminder', text: 'Call Rahim', date: '2026-11-17', time: '18:30' }, data))
      .toMatchObject({ at: reminderStart('2026-11-17', '18:30').toISOString(), repeat: 'once' });
  });

  it('refuses codes, missing days and empty words, and hides phone numbers', () => {
    expect(readAction({ kind: 'reminder', text: 'OTP is 482913', date: '2026-12-01' }, data)).toBeNull();
    expect(readAction({ kind: 'reminder', text: 'Rent', date: 'next week' }, data)).toBeNull();
    expect(readAction({ kind: 'reminder', text: ' ', date: '2026-12-01' }, data)).toBeNull();
    const call = readAction({ kind: 'reminder', text: 'Call 01712345678', date: '2026-12-01' }, data);
    expect(call && 'text' in call && call.text).not.toContain('01712345678');
  });
});
