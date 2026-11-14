import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { Loan } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { installmentsLeft, loanProgress, nextAmount } from './loans';
import { btnSmall, card } from './ui';
import AddToCalendarButton from '../connect/AddToCalendarButton';

/** One loan: what is left, the installment, the next date and the last one taken */
export default function LoanCard({ loan, symbol, onEdit }: { loan: Loan; symbol: string; onEdit: () => void }) {
  const { t, dateLocale } = useI18n();
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const date = (iso: string) => format(new Date(iso), 'd MMM yyyy', { locale: dateLocale });
  const progress = loanProgress(loan);
  const active = loan.status === 'active';

  const facts: { label: string; value: string }[] = [
    { label: t('loans.monthly'), value: t('loans.monthlyValue', { amount: money(loan.installment), day: loan.day }) },
    ...(active ? [
      { label: t('loans.nextLabel'), value: t('loans.lastValue', { amount: money(nextAmount(loan)), date: date(loan.nextDueDate) }) },
      { label: t('loans.leftLabel'), value: String(installmentsLeft(loan)) },
    ] : []),
    ...(loan.lastPaidAt && loan.lastPaidAmount !== undefined
      ? [{ label: t('loans.lastLabel'), value: t('loans.lastValue', { amount: money(loan.lastPaidAmount), date: date(loan.lastPaidAt) }) }]
      : []),
  ];

  return (
    <article className={cn(card, 'p-5 space-y-4', !active && 'opacity-75')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-bold text-foreground truncate">{loan.name}</h4>
          {loan.lender && <p className="text-xs text-muted font-medium truncate">{loan.lender}</p>}
        </div>
        <span className={cn(
          'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-bold',
          active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300'
        )}>
          {!active && <CheckCircle2 size={12} />}
          {t(active ? 'loans.statusActive' : loan.status === 'paid' ? 'loans.paidOff' : 'loans.stopped')}
        </span>
      </header>

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] text-muted font-semibold">{t('loans.remainingLabel')}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {money(loan.remaining)} <span className="text-xs text-muted font-semibold">{t('loans.ofTotal', { total: money(loan.total) })}</span>
            </p>
          </div>
          <p className="text-xs text-muted font-bold tabular-nums">{t('loans.paidPercent', { percent: progress })}</p>
        </div>
        <div className="h-2 rounded-full bg-background/80 border border-card-border overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {active && (
        <AddToCalendarButton
          event={{
            title: t('calendar.loanTitle', { loan: loan.name, amount: money(loan.installment) }),
            date: new Date(loan.nextDueDate),
            details: t('calendar.loanDetails', { account: loan.accountName, left: money(loan.remaining) }),
            repeat: { every: 'month', times: installmentsLeft(loan) },
          }}
        />
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map(f => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[12px] text-muted font-semibold">{f.label}</dt>
            <dd className="text-sm font-bold text-foreground tabular-nums truncate">{f.value}</dd>
          </div>
        ))}
      </dl>

      {active && loan.lastPaidNegative && (
        <p className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-xs font-bold text-rose-600 dark:text-rose-400">
          <AlertTriangle size={14} className="shrink-0 mt-px" /> {t('loans.negative')}
        </p>
      )}

      {active && (
        <footer className="flex justify-end pt-1 border-t border-card-border">
          <button onClick={onEdit} aria-label={t('loans.editLabel', { loan: loan.name })} className={cn(btnSmall, 'mt-3 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10')}>
            <Pencil size={14} /> {t('loans.editTitle')}
          </button>
        </footer>
      )}
    </article>
  );
}
