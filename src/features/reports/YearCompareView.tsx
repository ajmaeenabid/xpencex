import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useStartDay } from '../../app/useStartDay';
import { db } from '../../shared/firebase';
import { categoryLabel, useI18n } from '../../shared/i18n';
import { moneyMonth } from '../../shared/lib/moneyMonth';
import { cn } from '../../shared/lib/utils';
import type { Deposit, Expense } from '../../shared/types';
import { LoadingSpot } from '../../shared/components/LazyPart';
import { useIncome } from '../income/incomeService';
import { YearMode, compareYears, lastYearMonth } from './yearCompare';
import { CHOICE_ON } from '../../shared/lib/choice';

type Loaded = { expenses: Expense[]; incomes: Deposit[] } | 'loading' | 'failed';

/** Last year's month, read once when this tab opens (Firestore counts every read) */
function useLastYear(uid: string, startIso: string, endIso: string): Loaded {
  const [loaded, setLoaded] = useState<Loaded>('loading');
  useEffect(() => {
    let alive = true;
    setLoaded('loading');
    const read = (name: 'expenses' | 'deposits') =>
      getDocs(query(collection(db, name), where('uid', '==', uid), where('date', '>=', startIso), where('date', '<', endIso), orderBy('date', 'desc')));
    Promise.all([read('expenses'), read('deposits')])
      .then(([spent, received]) => {
        if (!alive) return;
        setLoaded({
          expenses: spent.docs.map(d => ({ id: d.id, ...d.data() } as Expense)),
          incomes: received.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)),
        });
      })
      .catch(err => {
        console.error('Could not read last year', err);
        if (alive) setLoaded('failed');
      });
    return () => { alive = false; };
  }, [uid, startIso, endIso]);
  return loaded;
}

/** How much something moved: green when the move is good news, red when it is not */
function Change({ now, before, upIsGood }: { now: number; before: number; upIsGood: boolean }) {
  const { t } = useI18n();
  const change = before > 0 ? (now - before) / before : null;
  const up = change !== null && change > 0.005;
  const down = change !== null && change < -0.005;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
  const good = up ? upIsGood : down ? !upIsGood : null;
  return (
    <span className={cn('text-[12px] font-bold inline-flex items-center gap-0.5', good === null ? 'text-muted' : good ? 'text-teal-600 dark:text-teal-400' : 'text-rose-500')}>
      <Icon size={13} />
      {change === null ? t('compare.new') : `${Math.round(Math.abs(change) * 100)}%`}
    </span>
  );
}

/** Reports: this month against the same month last year */
export default function YearCompareView({ uid, expenses, symbol }: { uid: string; expenses: Expense[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const startDay = useStartDay();
  const now = new Date();
  const [mode, setMode] = useState<YearMode>('sameDays');
  const whole = lastYearMonth(now, startDay);
  const last = useLastYear(uid, whole.start.toISOString(), whole.end.toISOString());
  const incomes = useIncome(uid, moneyMonth(now, startDay).start.toISOString());
  const money = (n: number) => `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  if (last === 'loading') return <LoadingSpot className="py-8" />;
  if (last === 'failed') return <p role="alert" className="text-sm text-muted font-medium text-center py-4">{t('compare.yearError')}</p>;

  const r = compareYears({ expenses, incomes, lastExpenses: last.expenses, lastIncomes: last.incomes, now, startDay, mode });
  if (!r.hasHistory) return <p className="text-sm text-muted font-medium text-center py-4">{t('compare.yearNone')}</p>;

  const day = (d: Date) => format(d, 'd MMM yyyy', { locale: dateLocale });
  const lastDay = new Date(r.window.end.getTime() - 1);
  const totals = [
    { label: t('income.spent'), now: r.current.spent, before: r.before.spent, upIsGood: false },
    { label: t('income.earned'), now: r.current.earned, before: r.before.earned, upIsGood: true },
    { label: t('income.saved'), now: r.current.saved, before: r.before.saved, upIsGood: true },
  ];

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('compare.compareWith')} className="grid grid-cols-2 gap-2">
        {(['sameDays', 'wholeMonth'] as const).map(m => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={cn('h-9 rounded-xl text-xs font-bold border transition-colors', mode === m ? CHOICE_ON : 'bg-background/50 text-muted border-card-border')}>
            {t(m === 'sameDays' ? 'compare.sameDays' : 'compare.wholeMonth')}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted font-medium">{t('compare.yearRange', { from: day(r.window.start), to: day(lastDay) })}</p>

      <div className="space-y-2">
        {totals.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{row.label}</p>
              <p className="text-[12px] text-muted font-medium">{t('compare.lastYear', { amount: money(row.before) })}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-foreground tabular-nums">{money(row.now)}</p>
              <Change now={row.now} before={row.before} upIsGood={row.upIsGood} />
            </div>
          </div>
        ))}
      </div>

      {r.categories.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 pt-1 text-xs font-bold text-muted">{t('compare.byCategory')}</p>
          {r.categories.map(row => (
            <div key={row.category} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{categoryLabel(t, row.category)}</p>
                <p className="text-[12px] text-muted font-medium">{t('compare.lastYear', { amount: money(row.before) })}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-foreground tabular-nums">{money(row.now)}</p>
                <Change now={row.now} before={row.before} upIsGood={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
