import { useState } from 'react';
import { format } from 'date-fns';
import { Bar, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Repeat, TrendingUp, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { confirmDialog, alertDialog } from '../../shared/components/Dialog';
import FullWindow from '../../shared/components/FullWindow';
import type { Account, Deposit, Expense } from '../../shared/types';
import { monthlySeries, savingsSummary, thisMonth } from './income';
import { stopIncomeRule, useIncome, useIncomeRules } from './incomeService';
import { incomeCategoryLabel } from './incomeText';
import { windowStart } from '../expenses/expenseQueries';
import IncomeForm from './IncomeForm';
import { useStartDay } from '../../app/useStartDay';
import { moneyMonth } from '../../shared/lib/moneyMonth';

const card = 'bg-card p-6 rounded-3xl shadow-sm border border-card-border';

/** Home: this month's earned, spent and saved */
export function EarnedCard({ uid, expenses, symbol }: { uid: string; expenses: Pick<Expense, 'amount' | 'date'>[]; symbol: string }) {
  const { t } = useI18n();
  const startDay = useStartDay();
  const incomes = useIncome(uid, moneyMonth(new Date(), startDay).start.toISOString());
  const { earned, spent, saved } = thisMonth(incomes, expenses, new Date(), startDay);
  const money = (n: number) => `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString()}`;
  return (
    <div className={card}>
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><TrendingUp size={20} /></span>
        <div>
          <h3 className="font-bold text-foreground">{t('income.monthTitle')}</h3>
          <p className="text-xs text-muted font-medium">{t('income.monthHint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['income.earned', earned, 'text-emerald-600 dark:text-emerald-400'], ['income.spent', spent, 'text-foreground'], ['income.saved', saved, saved < 0 ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400']] as const).map(([label, value, tone]) => (
          <div key={label} className="p-3 rounded-2xl bg-background/50">
            <p className="text-[12px] text-muted font-semibold">{t(label)}</p>
            <p className={cn('font-bold text-sm mt-1 break-words', tone)}>{money(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Checked for colour blindness and contrast against each theme's card
const TREND_COLOURS = {
  light: { earned: '#00897B', spent: '#D4561C', saved: '#7F5EC4' },
  dark: { earned: '#10978A', spent: '#E2622B', saved: '#9B7BD4' },
};

/** Reports: earned, spent and saved for the last 6 or 12 months. `expenses` must reach back 12 months. */
export function EarnedChart({ uid, expenses, symbol }: { uid: string; expenses: Pick<Expense, 'amount' | 'date'>[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const { isDarkMode } = useAuth();
  const startDay = useStartDay();
  const [months, setMonths] = useState<6 | 12>(6);
  const incomes = useIncome(uid, windowStart(12, new Date(), startDay));
  const series = monthlySeries(incomes, expenses, months, new Date(), startDay);
  const summary = savingsSummary(series);
  const colours = TREND_COLOURS[isDarkMode ? 'dark' : 'light'];
  const money = (n: number) => `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString()}`;
  const monthName = (month: string, pattern: string) => format(new Date(`${month}-01T12:00:00`), pattern, { locale: dateLocale });
  const data = series.map(m => ({
    name: monthName(m.month, 'MMM'),
    [t('income.earned')]: m.earned,
    [t('income.spent')]: m.spent,
    [t('income.saved')]: Math.round((m.earned - m.spent) * 100) / 100,
  }));
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-foreground">{t('income.chartTitle')}</h3>
          <p className="text-xs text-muted font-medium">{t('income.chartHint')}</p>
        </div>
        <div role="radiogroup" aria-label={t('income.chartMonths')} className="shrink-0 flex p-1 rounded-xl bg-background/50 border border-card-border">
          {([6, 12] as const).map(n => (
            <button key={n} type="button" role="radio" aria-checked={months === n} onClick={() => setMonths(n)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-bold transition-colors', months === n ? 'bg-indigo-600 text-white' : 'text-muted')}>
              {t('income.chartMonthCount', { count: n })}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={months === 12 ? 1 : 0} />
            <YAxis hide />
            <ReferenceLine y={0} stroke="#9A8478" strokeWidth={1} />
            <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: 'transparent' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={t('income.earned')} fill={colours.earned} radius={[4, 4, 0, 0]} />
            <Bar dataKey={t('income.spent')} fill={colours.spent} radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey={t('income.saved')} stroke={colours.saved} strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="p-3 rounded-2xl bg-background/50">
            <p className="text-[12px] text-muted font-semibold">{t('income.avgSaved')}</p>
            <p className={cn('font-bold text-sm mt-1 tabular-nums', summary.average < 0 ? 'text-rose-500' : 'text-foreground')}>{money(summary.average)}</p>
          </div>
          <div className="p-3 rounded-2xl bg-background/50">
            <p className="text-[12px] text-muted font-semibold">{t('income.bestMonth', { month: monthName(summary.best.month, 'MMM yyyy') })}</p>
            <p className={cn('font-bold text-sm mt-1 tabular-nums', summary.best.saved < 0 ? 'text-rose-500' : 'text-foreground')}>{money(summary.best.saved)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** An account's window: the income that went into it, with add and edit */
export function AccountIncomeSection({ account, symbol }: { account: Account; symbol: string }) {
  const { user } = useAuth();
  const { t, dateLocale } = useI18n();
  const incomes = useIncome(user?.uid, null).filter(d => d.accountId === account.id);
  const [open, setOpen] = useState<{ income: Deposit | null } | null>(null);
  const monthStart = moneyMonth(new Date(), useStartDay()).start.toISOString();
  const monthTotal = incomes.filter(d => d.date >= monthStart).reduce((s, d) => s + d.amount, 0);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="font-bold text-foreground">{t('income.accountTitle')}</h3>
          <p className="text-xs text-muted font-medium">{t('income.accountMonth', { amount: money(monthTotal) })}</p>
        </div>
        <button onClick={() => setOpen({ income: null })} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
          <Plus size={15} /> {t('income.add')}
        </button>
      </div>
      {incomes.length === 0 ? (
        <p className="text-center py-4 text-sm text-muted font-medium">{t('income.accountNone')}</p>
      ) : (
        <div className="space-y-2">
          {incomes.slice(0, 20).map(d => (
            <button key={d.id} onClick={() => setOpen({ income: d })} className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-card-border text-left">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground truncate">{d.title || t('income.untitled')}</span>
                <span className="block text-[12px] text-muted font-medium">
                  {[d.category && incomeCategoryLabel(t, d.category), format(new Date(d.date), 'd MMM yyyy', { locale: dateLocale })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">+{money(d.amount)}</span>
            </button>
          ))}
        </div>
      )}
      <FullWindow
        open={!!open}
        above
        atRoot
        onClose={() => setOpen(null)}
        onBack={() => setOpen(null)}
        pageKey="income"
        icon={<Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />}
        title={t(open?.income ? 'income.editTitle' : 'income.title')}
      >
        {open && <IncomeForm income={open.income} presetAccountId={account.id} onComplete={() => setOpen(null)} />}
      </FullWindow>
    </section>
  );
}

/** Profile: monthly income that repeats, each with Stop */
export function RepeatingIncomeList({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const { t, dateLocale } = useI18n();
  const rules = useIncomeRules(user?.uid);
  if (rules.length === 0) return null;
  const stop = async (id: string, title: string) => {
    if (!(await confirmDialog(t('income.stopConfirm', { title }), { danger: true }))) return;
    try {
      await stopIncomeRule(id);
    } catch (err) {
      console.error('Could not stop the income:', err);
      alertDialog(t('income.errorSave'));
    }
  };
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs font-bold text-muted flex items-center gap-1.5"><Repeat size={13} /> {t('income.repeating')}</p>
      {rules.map(rule => (
        <div key={rule.id} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{rule.title}</p>
            <p className="text-[12px] text-muted font-medium">
              +{symbol}{rule.amount.toLocaleString()} · {rule.accountName || t('income.noAccount')} · {t('profile.next', { date: format(new Date(rule.nextDate), 'd MMM', { locale: dateLocale }) })}
            </p>
          </div>
          <button onClick={() => stop(rule.id, rule.title)} aria-label={t('profile.stop', { title: rule.title })} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

