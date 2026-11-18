import { useEffect, useRef, useState } from 'react';
import { moneyMonthKey } from '../../shared/lib/moneyMonth';
import { format, startOfWeek, subDays, subWeeks } from 'date-fns';
import { useAuth } from '../../app/App';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import type { Expense, Loan } from '../../shared/types';
import { useFunds } from '../funds/fundService';
import { fundPlan } from '../funds/funds';
import { useSamities } from '../samity/samityService';
import { samityStatus } from '../samity/samity';
import { budgetAlert, planReminders, reminderSettings } from './reminders';
import { isNative } from '../../shared/lib/nativeApp';
import { REMINDERS_ALLOWED, reminderWords, remindersAllowed, scheduleReminders, sendBudgetAlert } from './reminderService';
import { useOwnReminders } from './ownReminderService';
import { usePlanned } from '../planned/plannedService';
import { useWarranties } from '../warranties/warrantyService';

const alertKey = (uid: string, month: string) => `xpences-budget-alert:${uid}:${month}`;
const readSent = (uid: string, month: string): number[] => {
  try { return (localStorage.getItem(alertKey(uid, month)) || '').split(',').filter(Boolean).map(Number); } catch { return []; }
};
const markSent = (uid: string, month: string, sent: number[]) => {
  try { localStorage.setItem(alertKey(uid, month), sent.join(',')); } catch { /* may be sent again */ }
};

/**
 * Keeps the phone's reminders in step with the data (runs on Home, which stays open in the background).
 * `expenses` must reach back at least 15 days (Home's list starts at the beginning of last month).
 */
export function useReminderSync({ expenses, loans, spentThisMonth, budget, startDay = 1 }: {
  startDay?: number; // the money month (Profile > Month starts on): budget alerts and the monthly report follow it
  expenses: Expense[];
  loans: Loan[];
  spentThisMonth: number;
  budget: number;
}) {
  const { user, profile } = useAuth();
  const { t, dateLocale } = useI18n();
  const uid = user?.uid || '';
  const funds = useFunds(uid);
  const samities = useSamities(uid);
  const own = useOwnReminders(uid);
  const planned = usePlanned(uid);
  const warranties = useWarranties(uid);
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const settings = reminderSettings(profile?.reminders);
  const timer = useRef<number | undefined>(undefined);

  // Whether notifications are allowed. Checked again when the person allows them in the app, and each
  // time the app comes back to the front (they may have switched them on or off in the phone's Settings).
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    const check = () => { if (!document.hidden) remindersAllowed(false).then(setAllowed); };
    check();
    window.addEventListener(REMINDERS_ALLOWED, check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener(REMINDERS_ALLOWED, check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  // What decides the plan; when it changes, plan again (a moment later, so a burst of changes plans once)
  const signature = JSON.stringify([
    allowed, settings, expenses.length, expenses[0]?.id, spentThisMonth, loans.map(l => [l.id, l.nextDueDate, l.status]),
    funds.map(f => [f.id, f.saved, f.dueDate]), samities.map(s => [s.id, Object.keys(s.payments || {}).length]), dateLocale.code,
    own.map(r => [r.id, r.at, r.repeat, r.text]), startDay, planned.map(p => [p.id, p.date, p.title, p.amount, p.kind]),
    warranties.map(w => [w.id, w.title, w.warrantyUntil]),
  ]);

  useEffect(() => {
    if (!uid || !allowed) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const now = new Date();
      const money = (n: number) => `${symbol}${n.toLocaleString()}`;
      const monthName = (m: string) => format(new Date(`${m}-01T12:00:00`), 'MMMM', { locale: dateLocale });

      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = subWeeks(weekStart, 1);
      const lastWeekSameTime = subWeeks(now, 1);
      const sum = (from: Date, to: Date) => expenses.filter(e => { const d = new Date(e.date); return d >= from && d < to; }).reduce((s, e) => s + e.amount, 0);
      const plan = planReminders(settings, {
        now,
        startDay,
        expenseDates: expenses.filter(e => new Date(e.date) >= subDays(now, 15)).map(e => e.date),
        weekSpent: sum(weekStart, now),
        lastWeekSpent: sum(lastWeekStart, lastWeekSameTime),
        loans: loans.filter(l => l.status === 'active').map(l => ({ id: l.id, name: l.name, installment: l.installment, nextDueDate: l.nextDueDate })),
        samityRounds: samities.flatMap(s => {
          const next = samityStatus(s, now).nextUnpaid;
          return next ? [{ id: s.id, name: s.name, amount: s.amount, date: next.date }] : [];
        }),
        goals: funds.filter(f => !f.paused).map(f => ({ id: f.id, name: f.name, dueDate: f.dueDate, progress: fundPlan(f, now).progress })),
        planned: planned.map(p => ({ id: p.id, name: p.title, amount: p.amount, date: p.date, income: p.kind === 'income' })),
        warranties: warranties.map(w => ({ id: w.id, name: w.title, until: w.warrantyUntil! })),
        own,
      });
      await scheduleReminders(plan, r => reminderWords(r.text, t, money, monthName));

      // Budget 80% and 100%: sent once each per money month, when it happens
      if (settings.on.budget) {
        const month = moneyMonthKey(now, startDay);
        const sent = readSent(uid, month);
        const due = budgetAlert(spentThisMonth, budget, sent);
        if (due) {
          await sendBudgetAlert(due, reminderWords({ key: 'budget', percent: due }, t, money, monthName));
          markSent(uid, month, due === 100 ? [80, 100] : [...sent, 80]);
        }
      }
    }, 1500);
    return () => window.clearTimeout(timer.current);
  }, [uid, signature]);
}
