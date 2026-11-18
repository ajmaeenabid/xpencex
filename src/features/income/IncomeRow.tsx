import { format } from 'date-fns';
import { Calendar, TrendingUp, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../../shared/i18n';
import type { Deposit } from '../../shared/types';
import { incomeCategoryLabel } from './incomeText';
import { EntryLabels } from '../labels/LabelField';

/** An income in the Transactions list: green, with "+". Tapping it opens it to edit or delete. */
export function IncomeRow({ income, symbol, onOpen }: { income: Deposit; symbol: string; onOpen: () => void }) {
  const { t, dateLocale } = useI18n();
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onOpen}
      className="w-full bg-card p-4 rounded-[2rem] shadow-soft border border-card-border flex items-center justify-between text-left"
    >
      <span className="flex items-center gap-4 min-w-0">
        <span className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <TrendingUp size={24} />
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-foreground truncate">{income.title || t('income.untitled')}</span>
          <span className="flex items-center gap-2 mt-1 text-xs font-semibold text-muted">
            {income.category ? incomeCategoryLabel(t, income.category) : t('income.chip')}
            <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
            <span className="flex items-center gap-1"><Calendar size={10} />{format(new Date(income.date), 'MMM d, yyyy', { locale: dateLocale })}</span>
          </span>
          {income.accountName && (
            <span className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-muted"><Wallet size={10} /> {income.accountName}</span>
          )}
          <EntryLabels labels={income.labels} />
        </span>
      </span>
      <span className="shrink-0 font-bold text-lg text-emerald-600 dark:text-emerald-400">+{symbol}{income.amount.toLocaleString()}</span>
    </motion.button>
  );
}
