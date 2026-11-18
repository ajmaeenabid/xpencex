import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, CalendarClock, CheckCircle2, Plus } from 'lucide-react';
import { ForecastChart } from '../../app/lazyParts';
import { useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Account } from '../../shared/types';
import { DetailLine } from '../../shared/components/DetailSheet';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import LazyPart, { LoadingSpot } from '../../shared/components/LazyPart';
import { HIDDEN, btnPrimary, btnSecondary, btnSmall, card } from '../accounts/ui';
import { EmptyState } from '../funds/FundsWindow';
import { TONE_CLASS } from '../home/TapCard';
import { FORECAST_DAYS, Forecast, ForecastSource } from './forecast';
import MarkPaidSheet from './MarkPaidSheet';
import type { Planned } from './planned';
import PlannedForm from './PlannedForm';
import { skipPlanned } from './plannedService';
import { REPEAT_TEXT, dueText } from './plannedText';

type Page = { page: 'list' } | { page: 'form'; id?: string };

const SOURCE_TEXT: Record<Exclude<ForecastSource, 'planned'>, TKey> = {
  recurring: 'planned.source.recurring',
  income: 'planned.source.income',
  deposit: 'planned.source.deposit',
  loan: 'planned.source.loan',
};

/** Upcoming payments: the 30-day forecast, what is due, and what else the forecast counts */
export default function PlannedWindow({ open, onClose, uid, planned, forecast, accounts, symbol, shown }: {
  open: boolean;
  onClose: () => void;
  uid: string;
  planned: Planned[]; // soonest first
  forecast: Forecast | null; // null until there is an account to forecast from
  accounts: Account[];
  symbol: string;
  shown: boolean; // balances revealed on Home
}) {
  const { t, dateLocale } = useI18n();
  const nav = usePages<Page>({ page: 'list' });
  const [paying, setPaying] = useState<Planned | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${symbol}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const signed = (n: number) => `${n < 0 ? '-' : '+'}${money(n)}`;
  const balance = (n: number) => (shown ? `${n < 0 ? '-' : ''}${money(n)}` : `${symbol}${HIDDEN}`);
  const day = (d: Date) => format(d, 'd MMM', { locale: dateLocale });
  const close = () => { onClose(); nav.reset(); };

  const skip = async (plan: Planned) => {
    if (plan.repeat === 'once' && !(await confirmDialog(t('planned.confirmSkipOnce', { name: plan.title })))) return;
    setBusy(true);
    try { await skipPlanned(plan); }
    catch (err) { console.error('Could not skip the planned payment:', err); alertDialog(t('planned.error')); }
    finally { setBusy(false); }
  };

  const row = (plan: Planned) => {
    const income = plan.kind === 'income';
    const late = differenceInCalendarDays(new Date(plan.date), new Date()) < 0;
    return (
      <div key={plan.id} className={cn(card, 'p-4 space-y-3')}>
        <button onClick={() => nav.go({ page: 'form', id: plan.id })} className="w-full flex items-start justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block font-bold text-foreground truncate">{plan.title}</span>
            <span className={cn('block text-xs font-semibold', late ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>
              {dueText(t, plan.date, dateLocale)} · {t(REPEAT_TEXT[plan.repeat])}
            </span>
          </span>
          <span className={cn('shrink-0 font-bold tabular-nums', income ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
            {income ? '+' : '-'}{money(plan.amount)}
          </span>
        </button>
        <div className="flex gap-2">
          <button onClick={() => setPaying(plan)} disabled={busy} className={cn(btnPrimary, 'flex-1 h-10')}>{t(income ? 'planned.markReceived' : 'planned.markPaid')}</button>
          <button onClick={() => skip(plan)} disabled={busy} className={cn(btnSecondary, 'h-10')}>{t('planned.skip')}</button>
        </div>
      </div>
    );
  };

  let title = t('planned.title');
  let body: React.ReactNode;
  let action: React.ReactNode = null;

  if (nav.page.page === 'form') {
    const id = nav.page.id;
    const plan = planned.find(p => p.id === id);
    title = t(plan ? 'planned.edit' : 'planned.new');
    body = <PlannedForm key={id || 'new'} uid={uid} plan={plan} count={planned.length} accounts={accounts} symbol={symbol} onDone={nav.back} />;
  } else {
    const dueNow = planned.filter(p => differenceInCalendarDays(new Date(p.date), new Date()) <= 0);
    const later = planned.filter(p => differenceInCalendarDays(new Date(p.date), new Date()) > 0);
    const others = (forecast?.events || []).filter(e => e.source !== 'planned');
    if (planned.length > 0) {
      action = (
        <button onClick={() => nav.go({ page: 'form' })} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
          <Plus size={15} /> {t('funds.newShort')}
        </button>
      );
    }
    body = (
      <>
        {forecast && (
          <div className={cn(card, 'p-5 space-y-3')}>
            <p className="font-bold text-foreground">{t('planned.forecastTitle', { days: FORECAST_DAYS })}</p>
            <p className={cn('flex items-start gap-2 p-3 rounded-xl text-sm font-semibold', TONE_CLASS[forecast.shortOn ? 'danger' : 'good'])}>
              {forecast.shortOn ? <AlertTriangle size={16} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={16} className="shrink-0 mt-0.5" />}
              {forecast.shortOn ? t('planned.shortOn', { date: day(forecast.shortOn) }) : t('planned.lasts', { days: FORECAST_DAYS })}
            </p>
            {shown
              ? <LazyPart fallback={<LoadingSpot className="h-52 py-0" />}><ForecastChart points={forecast.points} symbol={symbol} /></LazyPart>
              : <p className="text-xs text-muted font-medium">{t('planned.chartHidden')}</p>}
            <DetailLine label={t('planned.lineToday')} value={balance(forecast.points[0].balance)} />
            <DetailLine label={t('planned.lineLowest', { date: day(forecast.lowest.date) })} value={balance(forecast.lowest.balance)} tone={shown && forecast.lowest.balance < 0 ? 'bad' : undefined} />
            <DetailLine label={t('planned.linePerDay')} value={t('runway.perDay', { amount: money(forecast.perDay) })} />
            <p className="text-xs text-muted font-medium leading-relaxed">{t('planned.estimate')}</p>
          </div>
        )}

        {planned.length === 0 ? (
          <EmptyState
            title={t('planned.emptyTitle')}
            text={t('planned.emptyBody')}
            button={<button onClick={() => nav.go({ page: 'form' })} className={btnPrimary}><Plus size={16} /> {t('planned.new')}</button>}
          />
        ) : (
          <>
            {dueNow.length > 0 && <section className="space-y-3"><h3 className="px-1 text-sm font-bold text-muted">{t('planned.dueNow')}</h3>{dueNow.map(row)}</section>}
            {later.length > 0 && <section className="space-y-3"><h3 className="px-1 text-sm font-bold text-muted">{t('planned.comingUp')}</h3>{later.map(row)}</section>}
          </>
        )}

        {others.length > 0 && (
          <section className="space-y-2">
            <h3 className="px-1 text-sm font-bold text-muted">{t('planned.alsoCounted')}</h3>
            <div className={cn(card, 'divide-y divide-card-border')}>
              {others.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground truncate">{e.title}</span>
                    <span className="block text-xs font-medium text-muted">{day(e.date)} · {t(SOURCE_TEXT[e.source as keyof typeof SOURCE_TEXT])}</span>
                  </span>
                  <span className={cn('shrink-0 text-sm font-bold tabular-nums', e.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>{signed(e.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <FullWindow
        open={open}
        atRoot={nav.atRoot}
        onClose={close}
        onBack={nav.back}
        pageKey={nav.depth + nav.page.page}
        icon={<CalendarClock size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
        title={title}
        action={action}
      >
        {body}
      </FullWindow>
      {paying && <MarkPaidSheet key={paying.id} plan={paying} accounts={accounts} symbol={symbol} onClose={() => setPaying(null)} />}
    </>
  );
}
