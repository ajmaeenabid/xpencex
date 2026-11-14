import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { categoryLabel, useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Expense } from '../../shared/types';
import { compareByCategory } from '../home/insights';

/** Reports: each category this month so far against the same days of last month */
export default function MonthCompareCard({ expenses, symbol }: { expenses: Expense[]; symbol: string }) {
  const { t } = useI18n();
  const rows = compareByCategory(expenses);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border">
      <h3 className="text-lg font-bold text-foreground">{t('compare.title')}</h3>
      <p className="text-xs text-muted font-medium mb-4">{t('compare.hint')}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted font-medium text-center py-4">{t('compare.none')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const up = r.change !== null && r.change > 0.005;
            const down = r.change !== null && r.change < -0.005;
            const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
            return (
              <div key={r.category} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{categoryLabel(t, r.category)}</p>
                  <p className="text-[12px] text-muted font-medium">{t('compare.lastMonth', { amount: money(r.before) })}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{money(r.now)}</p>
                  <p className={cn('text-[12px] font-bold inline-flex items-center gap-0.5', up ? 'text-rose-500' : down ? 'text-teal-600 dark:text-teal-400' : 'text-muted')}>
                    <Icon size={13} />
                    {r.change === null ? t('compare.new') : `${Math.round(Math.abs(r.change) * 100)}%`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
