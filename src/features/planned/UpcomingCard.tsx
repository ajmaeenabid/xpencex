import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import { moneyMonth } from '../../shared/lib/moneyMonth';
import type { Account, Expense, Loan } from '../../shared/types';
import TapCard from '../home/TapCard';
import { runway } from '../home/runway';
import { useIncomeRules } from '../income/incomeService';
import { reminderSettings } from '../reminders/reminders';
import { remindersAllowed, sendShortfallAlert } from '../reminders/reminderService';
import { buildForecast, everydayExpenses, shortfallAlert } from './forecast';
import { sortPlanned } from './planned';
import { usePlanned, useRecurringRules } from './plannedService';
import { dueText } from './plannedText';
import PlannedWindow from './PlannedWindow';

// Waits for the lists to arrive, so a half-loaded forecast can't send a wrong alert
const ALERT_WAIT_MS = 5000;
const alertKey = (uid: string) => `xpences-short-alert:${uid}`;

/** Home: the next planned payment, and a warning when the forecast says money will run short */
export default function UpcomingCard({ uid, accounts, expenses, loans, symbol, shown, startDay, userSince }: {
  uid: string;
  accounts: Account[];
  expenses: Expense[]; // Home's expenses, which start at the beginning of last money month
  loans: Loan[];
  symbol: string;
  shown: boolean;
  startDay: number;
  userSince?: Date;
}) {
  const { t, dateLocale } = useI18n();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const planned = sortPlanned(usePlanned(uid));
  const recurring = useRecurringRules(uid);
  const incomeRules = useIncomeRules(uid);
  const alertsOn = reminderSettings(profile?.reminders).on.planned;

  const forecast = useMemo(() => {
    if (accounts.length === 0) return null;
    const { perDay, money } = runway({ accounts, expenses: everydayExpenses(expenses), userSince, dataSince: moneyMonth(new Date(), startDay, -1).start });
    return buildForecast({ balance: money, perDay, planned, recurring, incomeRules, accounts, loans });
  }, [accounts, expenses, userSince, startDay, JSON.stringify(planned), recurring, incomeRules, loans]);

  const shortDay = forecast?.shortOn ? format(forecast.shortOn, 'yyyy-MM-dd') : '';
  const ready = !!forecast;
  useEffect(() => {
    if (!ready || !alertsOn) return;
    const timer = window.setTimeout(async () => {
      let sent = false;
      try { sent = localStorage.getItem(alertKey(uid)) === '1'; } catch { /* treated as not sent */ }
      const shortOn = shortDay ? new Date(`${shortDay}T12:00:00`) : null;
      const next = shortfallAlert(shortOn, sent);
      if (next.send) {
        if (!(await remindersAllowed(false))) return;
        await sendShortfallAlert({
          title: t('planned.alert.title'),
          body: t('planned.alert.body', { date: format(shortOn!, 'd MMM', { locale: dateLocale }) }),
        });
      }
      try {
        if (next.sent) localStorage.setItem(alertKey(uid), '1');
        else localStorage.removeItem(alertKey(uid));
      } catch { /* may be sent again */ }
    }, ALERT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [uid, ready, alertsOn, shortDay]);

  const next = planned[0];
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const short = forecast?.shortOn;
  const dueNow = !!next && differenceInCalendarDays(new Date(next.date), new Date()) <= 0;

  return (
    <>
      <TapCard
        Icon={short ? AlertTriangle : CalendarClock}
        iconTone={short ? 'danger' : 'info'}
        label={t('planned.title')}
        headline={next ? t('planned.nextLine', { name: next.title, amount: money(next.amount) }) : t('planned.emptyCard')}
        chip={short ? t('planned.shortOn', { date: format(short, 'd MMM', { locale: dateLocale }) }) : next ? dueText(t, next.date, dateLocale) : undefined}
        chipTone={short ? 'danger' : dueNow ? 'warning' : 'info'}
        chipIcon={short ? AlertTriangle : CalendarClock}
        onOpen={() => setOpen(true)}
      />
      <PlannedWindow open={open} onClose={() => setOpen(false)} uid={uid} planned={planned} forecast={forecast} accounts={accounts} symbol={symbol} shown={shown} />
    </>
  );
}
