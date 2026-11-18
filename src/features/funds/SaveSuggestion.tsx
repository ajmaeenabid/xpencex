import { useState } from 'react';
import { PiggyBank, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import type { Expense } from '../../shared/types';
import { lastMonth } from '../income/income';
import { useIncome } from '../income/incomeService';
import { goalStage, sortFunds } from './funds';
import { useFunds } from './fundService';
import FundsWindow from './FundsWindow';
import { useStartDay } from '../../app/useStartDay';
import { moneyMonth, moneyMonthDay, moneyMonthKey } from '../../shared/lib/moneyMonth';

const SHOW_DAYS = 7; // shown in the first week of a month
const keyFor = (uid: string, month: string) => `xpences-save-nudge:${uid}:${month}`;

function dismissed(uid: string, month: string) {
  try { return localStorage.getItem(keyFor(uid, month)) === '1'; } catch { return false; }
}

/**
 * Home, first week of a month: "You saved X last month. Put some into your Bike goal?" Shown only when last month's
 * earned minus spent was above zero and a goal is still open. "Not now" hides it until next month.
 * `expenses` must reach back to the start of last month (Home's list does).
 */
export default function SaveSuggestion({ uid, expenses, symbol }: { uid: string; expenses: Pick<Expense, 'amount' | 'date'>[]; symbol: string }) {
  const { t } = useI18n();
  const now = new Date();
  // Money months (Profile > Month starts on): shown in the first days after the start day, about the month before
  const startDay = useStartDay();
  const month = moneyMonthKey(now, startDay);
  const incomes = useIncome(uid, moneyMonth(now, startDay, -1).start.toISOString());
  const goal = sortFunds(useFunds(uid)).find(f => goalStage(f) === 'active');
  const [hidden, setHidden] = useState(() => dismissed(uid, month));
  const [open, setOpen] = useState(false);
  const { saved } = lastMonth(incomes, expenses, now, startDay);

  if (hidden || !goal || saved <= 0 || moneyMonthDay(now, startDay).day > SHOW_DAYS) return null;

  const notNow = () => {
    try { localStorage.setItem(keyFor(uid, month), '1'); } catch { /* shows again next time */ }
    setHidden(true);
  };

  return (
    <div className="bg-card p-5 rounded-3xl shadow-sm border border-amber-200/70 dark:border-amber-500/20 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center"><PiggyBank size={20} /></span>
        <p className="flex-1 text-sm font-semibold text-foreground leading-relaxed">
          {t('funds.suggest', { amount: `${symbol}${saved.toLocaleString()}`, goal: goal.name })}
        </p>
        <button onClick={notNow} aria-label={t('funds.notNow')} className="p-1 text-muted hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setOpen(true)} className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-bold">{t('funds.suggestAdd')}</button>
        <button onClick={notNow} className="h-10 px-4 rounded-xl bg-background/60 text-muted text-sm font-bold border border-card-border">{t('funds.notNow')}</button>
      </div>
      <FundsWindow open={open} onClose={() => setOpen(false)} uid={uid} funds={sortFunds([goal])} symbol={symbol} startFundId={goal.id} />
    </div>
  );
}
