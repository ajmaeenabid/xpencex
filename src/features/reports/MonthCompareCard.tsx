import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { categoryLabel, useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Expense } from '../../shared/types';
import { compareByCategory } from '../home/insights';
import { useStartDay } from '../../app/useStartDay';
import YearCompareView from './YearCompareView';

/** Reports: this month so far against last month, or against the same month last year */
export default function MonthCompareCard({ uid, expenses, symbol }: { uid: string; expenses: Expense[]; symbol: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'month' | 'year'>('month');
  const rows = compareByCategory(expenses, new Date(), useStartDay());
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border">
      <h3 className="text-lg font-bold text-foreground">{t(tab === 'month' ? 'compare.title' : 'compare.yearTitle')}</h3>
      <p className="text-xs text-muted font-medium mb-4">{t(tab === 'month' ? 'compare.hint' : 'compare.yearHint')}</p>
      <div role="tablist" className="grid grid-cols-2 p-1 mb-4 rounded-xl bg-background/50 border border-card-border">
        {(['month', 'year'] as const).map(id => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('py-2 rounded-lg text-xs font-bold transition-colors', tab === id ? 'bg-indigo-600 text-white' : 'text-muted')}>
            {t(id === 'month' ? 'compare.tabMonth' : 'compare.tabYear')}
          </button>
        ))}
      </div>
      {tab === 'year' ? (
        <YearCompareView uid={uid} expenses={expenses} symbol={symbol} />
      ) : rows.length === 0 ? (
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
