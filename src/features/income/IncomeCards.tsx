import { useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Repeat, TrendingUp, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { confirmDialog, alertDialog } from '../../shared/components/Dialog';
import FullWindow from '../../shared/components/FullWindow';
import type { Account, Deposit, Expense } from '../../shared/types';
import { monthlySeries, thisMonth } from './income';
import { stopIncomeRule, useIncome, useIncomeRules } from './incomeService';
import { incomeCategoryLabel } from './incomeText';
import { windowStart } from '../expenses/expenseQueries';
import IncomeForm from './IncomeForm';

const card = 'bg-card p-6 rounded-3xl shadow-sm border border-card-border';

/** Home: this month's earned, spent and saved */
export function EarnedCard({ uid, expenses, symbol }: { uid: string; expenses: Pick<Expense, 'amount' | 'date'>[]; symbol: string }) {
  const { t } = useI18n();
  const incomes = useIncome(uid, startOfMonth(new Date()).toISOString());
  const { earned, spent, saved } = thisMonth(incomes, expenses);
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

/** Reports: earned against spent for the last 6 months */
export function EarnedChart({ uid, expenses, symbol }: { uid: string; expenses: Pick<Expense, 'amount' | 'date'>[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const incomes = useIncome(uid, windowStart(6));
  const data = monthlySeries(incomes, expenses, 6).map(m => ({
    name: format(new Date(`${m.month}-01T12:00:00`), 'MMM', { locale: dateLocale }),
    [t('income.earned')]: m.earned,
    [t('income.spent')]: m.spent,
  }));
  return (
    <div className={card}>
      <h3 className="text-lg font-bold text-foreground">{t('income.chartTitle')}</h3>
      <p className="text-xs text-muted font-medium mb-4">{t('income.chartHint')}</p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis hide />
            <Tooltip formatter={(v: number) => `${symbol}${v.toLocaleString()}`} cursor={{ fill: 'transparent' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={t('income.earned')} fill="#14b8a6" radius={[6, 6, 0, 0]} />
            <Bar dataKey={t('income.spent')} fill="#F97C45" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** An account's window: the income that went into it, with add and edit */
export function AccountIncomeSection({ account, symbol }: { account: Account; symbol: string }) {
  const { user } = useAuth();
  const { t, dateLocale } = useI18n();
  const incomes = useIncome(user?.uid, null).filter(d => d.accountId === account.id);
  const [open, setOpen] = useState<{ income: Deposit | null } | null>(null);
  const monthStart = startOfMonth(new Date()).toISOString();
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

