import { moneyMonth, moneyMonthKey } from '../../shared/lib/moneyMonth';
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, getDay, getDaysInMonth, setHours, setMinutes, startOfDay, startOfMonth, subDays } from 'date-fns';

// Phone reminders (chosen 2026-11-11), worked out as a list the phone schedules ahead (reminderService.ts).
// Plain functions, so they are tested. On by default; each kind has its own switch in Profile.
// - daily: "add today's spending" at the chosen time, skipped on a day something was already added;
//   with a 3+ day streak it becomes the streak message
// - loan installment tomorrow, samity payment day, festival goals coming up
// - budget at 80% and 100% (sent when it happens, once each per month)
// - weekly summary (Sunday evening) and monthly report ready (the 1st)

export const REMINDER_KINDS = ['daily', 'streak', 'loan', 'samity', 'budget', 'weekly', 'monthly', 'goal', 'planned', 'warranty'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface ReminderSettings {
  on: Record<ReminderKind, boolean>;
  time: string; // 'HH:mm', the daily reminder
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  on: { daily: true, streak: true, loan: true, samity: true, budget: true, weekly: true, monthly: true, goal: true, planned: true, warranty: true },
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
  | { key: 'planned'; name: string; amount: number; income: boolean; today: boolean }
  | { key: 'warranty'; name: string; days: number }
  | { key: 'weekly'; spent: number; change: number | null }
  | { key: 'monthly'; month: string }
  | { key: 'budget'; percent: 80 | 100 }
  | { key: 'own'; text: string };

export interface PlannedReminder {
  id: number; // stable per reminder, so planning again replaces it
  at: Date;
  kind: ReminderKind | 'own';
  text: ReminderText;
  tab: 'add' | 'home' | 'reports' | 'profile' | 'expenses';
}

export interface ReminderData {
  startDay?: number; // the day the money month starts (Profile > Month starts on); the monthly report follows it
  now: Date;
  expenseDates: string[]; // ISO dates of expenses from at least the last 15 days
  weekSpent: number; // since this Monday
  lastWeekSpent: number; // the same days of last week
  loans: { id: string; name: string; installment: number; nextDueDate: string }[];
  samityRounds: { id: string; name: string; amount: number; date: Date }[]; // unpaid rounds coming up
  goals: { id: string; name: string; dueDate?: string; progress: number }[];
  planned?: { id: string; name: string; amount: number; date: string; income: boolean }[]; // the next date of each
  warranties?: { id: string; name: string; until: string }[];
  own?: OwnReminder[]; // the person's own reminders (always planned, whatever the switches say)
}

// ---------------------------------------------------------------------------
// Your own reminders (chosen 2026-11-16): your text, a date and time, once or repeating weekly or monthly.
// Kept in the account (the reminders collection), at most 20. Made by hand in Profile > Reminders or from chat.

export type OwnRepeat = 'once' | 'weekly' | 'monthly';
export const OWN_REPEATS: OwnRepeat[] = ['once', 'weekly', 'monthly'];
export const MAX_OWN_REMINDERS = 20;
export const MAX_REMINDER_TEXT = 100;
export const DEFAULT_REMINDER_TIME = '09:00';

export interface OwnReminder {
  id: string;
  uid: string;
  text: string;
  at: string; // ISO: the first time it rings
  repeat: OwnRepeat;
  createdAt: string;
}

/** The first moment for a day (YYYY-MM-DD) and time (HH:mm) on this phone */
export const reminderStart = (day: string, time: string) => new Date(`${day}T${time}:00`);

/**
 * The next `count` times it rings after `now`. Monthly keeps its day of the month, and in a shorter
 * month rings on the last day instead (the 31st becomes the 30th, or the 28th in February).
 */
export function ownOccurrences(r: Pick<OwnReminder, 'at' | 'repeat'>, now: Date, count = 2): Date[] {
  const first = new Date(r.at);
  if (Number.isNaN(first.getTime())) return [];
  if (r.repeat === 'once') return first > now ? [first] : [];
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < 2000; i++) {
    let next: Date;
    if (r.repeat === 'weekly') next = addWeeks(first, i);
    else {
      const month = addMonths(startOfMonth(first), i);
      next = new Date(month.getFullYear(), month.getMonth(), Math.min(first.getDate(), getDaysInMonth(month)), first.getHours(), first.getMinutes());
    }
    if (next > now) out.push(next);
  }
  return out;
}

/** Why a reminder can't be saved yet, or null */
export function ownReminderProblem(text: string, at: Date, repeat: string, existing: number, now = new Date()): 'text' | 'time' | 'repeat' | 'full' | null {
  if (existing >= MAX_OWN_REMINDERS) return 'full';
  if (!text.trim() || text.trim().length > MAX_REMINDER_TEXT) return 'text';
  if (!OWN_REPEATS.includes(repeat as OwnRepeat)) return 'repeat';
  if (Number.isNaN(at.getTime()) || (repeat === 'once' && at <= now)) return 'time';
  return null;
}

const DAYS_AHEAD = 7;
const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return setMinutes(setHours(startOfDay(day), h), m);
};
// A fixed id range per kind. Every plan replaces all pending reminders, so ids only need to be different within
// one plan: each kind counts up from the start of its range. (Ids made from a short hash used to clash, and the
// second reminder silently replaced the first.) Warranties sit apart, because 9000-9999 holds the alerts sent at once.
const WARRANTY_ID_START = 12000;
const rangeStart = (kind: ReminderKind) => (kind === 'warranty' ? WARRANTY_ID_START : REMINDER_KINDS.indexOf(kind) * 1000);

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
  const used: Partial<Record<ReminderKind, number>> = {};
  const idFor = (kind: ReminderKind) => {
    const n = used[kind] ?? 0;
    used[kind] = n + 1;
    return rangeStart(kind) + (n % 1000);
  };
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
      future({ id: idFor('daily'), at: at(day, s.time), kind: useStreak ? 'streak' : 'daily', text: useStreak ? { key: 'streak', days: streak } : { key: 'daily' }, tab: 'add' });
    }
  }

  // Loan installment tomorrow: the evening before, at 8 PM
  if (s.on.loan) {
    for (const loan of d.loans) {
      const due = new Date(loan.nextDueDate);
      future({ id: idFor('loan'), at: at(subDays(due, 1), '20:00'), kind: 'loan', text: { key: 'loan', name: loan.name, amount: loan.installment }, tab: 'home' });
    }
  }

  // Samity payment day: that morning, at 9 AM
  if (s.on.samity) {
    for (const r of d.samityRounds.filter(r => differenceInCalendarDays(r.date, now) <= DAYS_AHEAD)) {
      future({ id: idFor('samity'), at: at(r.date, '09:00'), kind: 'samity', text: { key: 'samity', name: r.name, amount: r.amount }, tab: 'home' });
    }
  }

  // Goals with a date: 30, 14 and 3 days before, at 7 PM, while not reached
  if (s.on.goal) {
    for (const g of d.goals.filter(g => g.dueDate && g.progress < 1)) {
      const due = new Date(g.dueDate!);
      for (const before of [30, 14, 3]) {
        future({ id: idFor('goal'), at: at(subDays(due, before), '19:00'), kind: 'goal', text: { key: 'goal', name: g.name, days: before, percent: Math.round(g.progress * 100) }, tab: 'home' });
      }
    }
  }

  // Planned payments: the day before and on the day, at 9 AM
  if (s.on.planned) {
    for (const p of d.planned || []) {
      for (const before of [1, 0]) {
        future({
          id: idFor('planned'),
          at: at(subDays(new Date(p.date), before), '09:00'),
          kind: 'planned',
          text: { key: 'planned', name: p.name, amount: p.amount, income: p.income, today: before === 0 },
          tab: 'home',
        });
      }
    }
  }

  // Warranties: 30 and 7 days before they end, at 9 AM
  if (s.on.warranty) {
    for (const w of d.warranties || []) {
      for (const before of [30, 7]) {
        future({ id: idFor('warranty'), at: at(subDays(new Date(w.until), before), '09:00'), kind: 'warranty', text: { key: 'warranty', name: w.name, days: before }, tab: 'expenses' });
      }
    }
  }

  // Weekly summary: the coming Sunday at 8 PM (or today, if it's Sunday and not yet 8 PM)
  if (s.on.weekly) {
    const daysToSunday = (7 - getDay(now)) % 7;
    const sunday = at(addDays(now, daysToSunday), '20:00');
    const change = d.lastWeekSpent > 0 ? (d.weekSpent - d.lastWeekSpent) / d.lastWeekSpent : null;
    future({ id: idFor('weekly'), at: sunday, kind: 'weekly', text: { key: 'weekly', spent: d.weekSpent, change }, tab: 'reports' });
  }

  // Monthly report ready: the first day of the next money month at 10 AM, about the month that just ended
  if (s.on.monthly) {
    const next = moneyMonth(now, d.startDay, 1).start;
    future({ id: idFor('monthly'), at: at(next, '10:00'), kind: 'monthly', text: { key: 'monthly', month: moneyMonthKey(now, d.startDay) }, tab: 'reports' });
  }

  // Your own reminders: the next two times each one rings, however far ahead (rent on the 1st...)
  const own = [...(d.own || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  own.forEach((r, i) => ownOccurrences(r, now).forEach((when, n) => {
    out.push({ id: OWN_ID_START + i * 2 + n, at: when, kind: 'own', text: { key: 'own', text: r.text }, tab: 'home' });
  }));

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// Own reminders get ids above the kinds' ranges (0-8999) and the alerts sent at once (9080, 9100, 9200),
// and stay below the warranties (12000 and up)
const OWN_ID_START = 10000;

/** The budget alert to send now (80% or 100%), if one is due and wasn't sent yet this month */
export function budgetAlert(spent: number, budget: number, alreadySent: number[]): 80 | 100 | null {
  if (!(budget > 0)) return null;
  const pct = (spent / budget) * 100;
  if (pct >= 100 && !alreadySent.includes(100)) return 100;
  if (pct >= 80 && pct < 100 && !alreadySent.includes(80)) return 80;
  return null;
}
