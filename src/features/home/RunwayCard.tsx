import { useMemo } from 'react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Hourglass } from 'lucide-react';
import { Account, Expense } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { HIDDEN } from '../accounts/ui';
import { ROUGH_BELOW_DAYS, runway } from './runway';

/** How long the money in your accounts lasts at your recent spending, and whether it reaches the next deposit */
export default function RunwayCard({ accounts, expenses, symbol, userSince, shown }: {
  accounts: Account[];
  expenses: Expense[]; // Home's expenses, which start at the beginning of last month
  symbol: string;
  userSince?: Date;
  shown: boolean; // balances revealed on Home
}) {
  const { t, dateLocale } = useI18n();
  const r = useMemo(
    () => runway({ accounts, expenses, userSince, dataSince: startOfMonth(subMonths(new Date(), 1)) }),
    [accounts, expenses, userSince],
  );
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString()}`;
  const day = (d: Date) => format(d, 'd MMM', { locale: dateLocale });

  return (
    <div className="p-5 bg-card rounded-[2rem] shadow-soft border border-card-border space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Hourglass size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-muted text-xs font-bold">{t('runway.title')}</p>
          <p className={cn('font-bold text-lg text-foreground', r.days === 0 && 'text-rose-500')}>
            {r.money <= 0 ? t('runway.empty') : r.days === null ? t('runway.noSpending') : t('runway.days', { days: r.days })}
          </p>
        </div>
      </div>

      {r.money > 0 && r.days !== null && (
        <p className="text-xs text-muted font-medium leading-relaxed">
          {t('runway.detail', { money: shown ? money(r.money) : `${symbol}${HIDDEN}`, perDay: money(r.perDay) })}
          {r.runsOutOn && r.days > 0 && <> {t('runway.runsOut', { date: day(r.runsOutOn) })}</>}
        </p>
      )}

      {r.nextDeposit && r.money > 0 && (
        <p className={cn('text-xs font-semibold leading-relaxed p-3 rounded-xl', r.nextDeposit.lasts
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300')}>
          {r.nextDeposit.lasts
            ? t('runway.lasts', { date: day(r.nextDeposit.date), safe: money(r.nextDeposit.safePerDay) })
            : t('runway.short', { days: r.nextDeposit.shortByDays, date: day(r.nextDeposit.date), safe: money(r.nextDeposit.safePerDay) })}
        </p>
      )}

      {r.days !== null && r.basedOnDays < ROUGH_BELOW_DAYS && (
        <p className="text-[11px] text-muted font-medium">{t('runway.rough', { days: r.basedOnDays })}</p>
      )}
    </div>
  );
}
