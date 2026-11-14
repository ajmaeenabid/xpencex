import { useMemo } from 'react';
import { format } from 'date-fns';
import { Receipt } from 'lucide-react';
import { Expense } from '../../shared/types';
import { useI18n, TKey } from '../../shared/i18n';
import { FEE_PROVIDERS, FeeProvider, feeSummary } from './fees';

const PROVIDER_NAME: Record<FeeProvider, TKey> = {
  bkash: 'fees.bkash',
  nagad: 'fees.nagad',
  rocket: 'fees.rocket',
  bank: 'fees.bank',
};

/** Fees paid to bKash, Nagad, Rocket and banks: this month by service, and the last 6 months */
export default function FeesCard({ expenses, symbol }: { expenses: Expense[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const summary = useMemo(() => feeSummary(expenses), [expenses]);
  const highest = Math.max(...summary.months.map(m => m.total), 0);
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const anyFees = summary.months.some(m => m.total > 0);

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border transition-colors space-y-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <Receipt size={20} />
        </span>
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('fees.title')}</h3>
          <p className="text-xs text-muted font-medium">{t('fees.hint')}</p>
        </div>
      </div>

      {!anyFees ? (
        <p className="text-sm text-muted font-medium">{t('fees.none')}</p>
      ) : (
        <>
          <div>
            <p className="text-[12px] text-muted font-semibold">{t('fees.thisMonth')}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{money(summary.thisMonth)}</p>
          </div>

          {summary.thisMonth > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {FEE_PROVIDERS.filter(p => summary.byProvider[p] > 0).map(p => (
                <li key={p} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-background/50">
                  <span className="text-xs font-semibold text-muted">{t(PROVIDER_NAME[p])}</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">{money(summary.byProvider[p])}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="text-[12px] text-muted font-semibold mb-2">{t('fees.lastMonths')}</p>
            <div className="flex items-end gap-2 h-24" role="list">
              {summary.months.map(m => (
                <div key={m.month} role="listitem" className="flex-1 flex flex-col items-center gap-1 h-full justify-end" aria-label={`${format(new Date(`${m.month}-01T00:00:00`), 'MMMM', { locale: dateLocale })}: ${money(m.total)}`}>
                  <div
                    className="w-full rounded-md bg-indigo-500/80 dark:bg-indigo-400/80"
                    style={{ height: `${highest > 0 ? Math.max(m.total > 0 ? 6 : 2, (m.total / highest) * 100) : 2}%` }}
                  />
                  <span className="text-[11px] font-semibold text-muted">{format(new Date(`${m.month}-01T00:00:00`), 'MMM', { locale: dateLocale })}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
