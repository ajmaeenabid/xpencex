import { addDays, differenceInCalendarDays, format, getDay, setHours, setMinutes, startOfDay, startOfMonth, subDays } from 'date-fns';

// Phone reminders (chosen 2026-11-11), worked out as a list the phone schedules ahead (reminderService.ts).
// Plain functions, so they are tested. On by default; each kind has its own switch in Profile.
// - daily: "add today's spending" at the chosen time, skipped on a day something was already added;
//   with a 3+ day streak it becomes the streak message
// - loan installment tomorrow, samity payment day, festival goals coming up
// - budget at 80% and 100% (sent when it happens, once each per month)
// - weekly summary (Sunday evening) and monthly report ready (the 1st)

export const REMINDER_KINDS = ['daily', 'streak', 'loan', 'samity', 'budget', 'weekly', 'monthly', 'goal'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface ReminderSettings {
  on: Record<ReminderKind, boolean>;
  time: string; // 'HH:mm', the daily reminder
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  on: { daily: true, streak: true, loan: true, samity: true, budget: true, weekly: true, monthly: true, goal: true },
  time: '21:00',
};

/** Settings saved on the profile, with anything missing filled from the defaults */
export function reminderSettings(saved: { on?: Partial<Record<string, boolean>>; time?: string } | undefined): ReminderSettings {
  const time = typeof saved?.time === 'string' && /^\d{2}:\d{2}$/.test(saved.time) ? saved.time : DEFAULT_REMINDERS.time;
  const on = { ...DEFAULT_REMINDERS.on };
  for (const kind of REMINDER_KINDS) if (typeof saved?.on?.[kind] === 'boolean') on[kind] = saved.on[kind]!;
  return { on, time };
}

/** What a reminder says. The text is filled in by the app in the person's language. */
export type ReminderText =
  | { key: 'daily' }
  | { key: 'streak'; days: number }
  | { key: 'loan'; name: string; amount: number }
  | { key: 'samity'; name: string; amount: number }
  | { key: 'goal'; name: string; days: number; percent: number }
  | { key: 'weekly'; spent: number; change: number | null }
  | { key: 'monthly'; month: string }
  | { key: 'budget'; percent: 80 | 100 };

export interface PlannedReminder {
  id: number; // stable per reminder, so planning again replaces it
  at: Date;
  kind: ReminderKind;
  text: ReminderText;
  tab: 'add' | 'home' | 'reports' | 'profile';
}

export interface ReminderData {
  now: Date;
  expenseDates: string[]; // ISO dates of expenses from at least the last 15 days
  weekSpent: number; // since this Monday
  lastWeekSpent: number; // the same days of last week
  loans: { id: string; name: string; installment: number; nextDueDate: string }[];
  samityRounds: { id: string; name: string; amount: number; date: Date }[]; // unpaid rounds coming up
  goals: { id: string; name: string; dueDate?: string; progress: number }[];
}

const DAYS_AHEAD = 7;
const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return setMinutes(setHours(startOfDay(day), h), m);
};
// Small fixed id ranges per kind, so the same reminder always gets the same id
const idFor = (kind: ReminderKind, n: number) => REMINDER_KINDS.indexOf(kind) * 1000 + (n % 1000);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 500;

/** Days in a row, ending today or yesterday, that have at least one expense */
export function streakDays(expenseDates: string[], now: Date): number {
  const days = new Set(expenseDates.map(d => format(new Date(d), 'yyyy-MM-dd')));
  let day = days.has(format(now, 'yyyy-MM-dd')) ? now : subDays(now, 1);
  let count = 0;
  while (days.has(format(day, 'yyyy-MM-dd'))) { count++; day = subDays(day, 1); }
  return count;
}

/** Everything to schedule for the next week (budget alerts are separate: budgetAlert) */
export function planReminders(s: ReminderSettings, d: ReminderData): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const { now } = d;
  const future = (r: PlannedReminder) => { if (r.at.getTime() > now.getTime()) out.push(r); };
  const today = format(now, 'yyyy-MM-dd');
  const addedToday = d.expenseDates.some(x => format(new Date(x), 'yyyy-MM-dd') === today);

  // Daily (or the streak message instead), skipping today if something was added
  if (s.on.daily || s.on.streak) {
    const streak = streakDays(d.expenseDates, now);
    for (let i = addedToday ? 1 : 0; i < DAYS_AHEAD; i++) {
      const day = addDays(now, i);
      // A streak only holds for tonight (the next days depend on what gets added)
      const useStreak = s.on.streak && i === 0 && streak >= 3;
      if (!useStreak && !s.on.daily) continue;
      future({ id: idFor('daily', i), at: at(day, s.time), kind: useStreak ? 'streak' : 'daily', text: useStreak ? { key: 'streak', days: streak } : { key: 'daily' }, tab: 'add' });
    }
  }

  // Loan installment tomorrow: the evening before, at 8 PM
  if (s.on.loan) {
    for (const loan of d.loans) {
      const due = new Date(loan.nextDueDate);
      future({ id: idFor('loan', hash(loan.id)), at: at(subDays(due, 1), '20:00'), kind: 'loan', text: { key: 'loan', name: loan.name, amount: loan.installment }, tab: 'home' });
    }
  }

  // Samity payment day: that morning, at 9 AM
  if (s.on.samity) {
    for (const r of d.samityRounds.filter(r => differenceInCalendarDays(r.date, now) <= DAYS_AHEAD)) {
      future({ id: idFor('samity', hash(`${r.id}${r.date.toISOString()}`)), at: at(r.date, '09:00'), kind: 'samity', text: { key: 'samity', name: r.name, amount: r.amount }, tab: 'home' });
    }
  }

  // Goals with a date: 30, 14 and 3 days before, at 7 PM, while not reached
  if (s.on.goal) {
    for (const g of d.goals.filter(g => g.dueDate && g.progress < 1)) {
      const due = new Date(g.dueDate!);
      for (const before of [30, 14, 3]) {
        future({ id: idFor('goal', hash(`${g.id}${before}`)), at: at(subDays(due, before), '19:00'), kind: 'goal', text: { key: 'goal', name: g.name, days: before, percent: Math.round(g.progress * 100) }, tab: 'home' });
      }
    }
  }

  // Weekly summary: the coming Sunday at 8 PM (or today, if it's Sunday and not yet 8 PM)
  if (s.on.weekly) {
    const daysToSunday = (7 - getDay(now)) % 7;
    const sunday = at(addDays(now, daysToSunday), '20:00');
    const change = d.lastWeekSpent > 0 ? (d.weekSpent - d.lastWeekSpent) / d.lastWeekSpent : null;
    future({ id: idFor('weekly', 0), at: sunday, kind: 'weekly', text: { key: 'weekly', spent: d.weekSpent, change }, tab: 'reports' });
  }

  // Monthly report ready: the 1st of next month at 10 AM, about the month that just ended
  if (s.on.monthly) {
    const first = startOfMonth(addDays(startOfMonth(now), 32));
    future({ id: idFor('monthly', 0), at: at(first, '10:00'), kind: 'monthly', text: { key: 'monthly', month: format(now, 'yyyy-MM') }, tab: 'reports' });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The budget alert to send now (80% or 100%), if one is due and wasn't sent yet this month */
export function budgetAlert(spent: number, budget: number, alreadySent: number[]): 80 | 100 | null {
  if (!(budget > 0)) return null;
  const pct = (spent / budget) * 100;
  if (pct >= 100 && !alreadySent.includes(100)) return 100;
  if (pct >= 80 && pct < 100 && !alreadySent.includes(80)) return 80;
  return null;
}
