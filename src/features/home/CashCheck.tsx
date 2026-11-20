import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { Account, Expense } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { findWallet, shouldAskCashCount, unrecordedSpending } from '../accounts/cash';
import { confirmCash, countCash, createWallet } from '../accounts/cashService';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';

const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';
const smallBtn = 'h-10 px-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50';

/**
 * The Cash wallet's two questions, shown inside Home's Total balance card only when needed (chosen 2026-11-19;
 * it used to be a card of its own that mostly repeated the Cash balance). Before the wallet exists: "How much
 * cash do you have now?". After: once a week, when cash spending has gone quiet, "Do you still have ৳X in cash?".
 * The rest of the time it shows nothing; the cash itself is in the balance card, and is changed in My Accounts.
 * `framed` gives it a card of its own, for when there is no balance card yet (no accounts).
 */
export default function CashCheck({ uid, accounts, expenses, symbol, framed = false }: {
  uid: string;
  accounts: Account[];
  expenses: Expense[]; // Home's recent expenses
  symbol: string;
  framed?: boolean;
}) {
  const { t } = useI18n();
  const wallet = findWallet(accounts);
  const [amount, setAmount] = useState('');
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setAmount('');
      setCounting(false);
    } catch (err) {
      console.error('Cash wallet change failed:', err);
      setError(t('cash.error'));
    } finally {
      setBusy(false);
    }
  };

  const typed = parseFloat(amount);
  const valid = Number.isFinite(typed) && typed >= 0;

  const header = (line: React.ReactNode) => (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
        <Banknote size={20} />
      </div>
      <div className="min-w-0">
        <p className={CARD_TITLE}>{t('cash.title')}</p>
        <p className={CARD_SUB}>{line}</p>
      </div>
    </div>
  );

  const box = (content: React.ReactNode) => (
    <div className={framed ? 'p-5 bg-card rounded-[2rem] shadow-soft border border-card-border space-y-3' : 'pt-3 border-t border-card-border space-y-3'}>
      {content}
    </div>
  );

  // Not started yet: ask once how much cash there is (Skip starts at 0)
  if (!wallet) {
    return box(
      <>
        {header(t('cash.startQuestion'))}
        <p className="text-xs text-muted font-medium leading-relaxed">{t('cash.startHint')}</p>
        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={`${symbol} 0`} aria-label={t('cash.startQuestion')} className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
        {error && <p role="alert" className="text-xs font-semibold text-rose-500">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => run(() => createWallet(uid, 0))} className={cn(smallBtn, 'flex-1 bg-background/60 text-muted border border-card-border')}>{t('cash.skip')}</button>
          <button disabled={busy || !valid} onClick={() => run(() => createWallet(uid, typed))} className={cn(smallBtn, 'flex-1 bg-indigo-600 text-white')}>{t('cash.start')}</button>
        </div>
      </>
    );
  }

  const lastCashSpendAt = expenses.filter(e => e.accountId === wallet.id).map(e => e.createdAt || e.date).sort().pop();
  const ask = shouldAskCashCount({ wallet, lastCashSpendAt });
  const missing = valid ? unrecordedSpending(wallet.balance, typed) : 0;

  // Nothing to ask this week
  if (!ask && !counting) return null;

  return box(
    <>
      {header(t('cash.sub'))}
      {(
        <div className="p-3 rounded-xl bg-background/50 space-y-3">
          {!counting ? (
            <>
              <p className="text-sm font-semibold text-foreground">{t('cash.checkQuestion', { amount: money(wallet.balance) })}</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => run(() => confirmCash(wallet))} className={cn(smallBtn, 'flex-1 bg-indigo-600 text-white')}>{t('cash.yes')}</button>
                <button disabled={busy} onClick={() => setCounting(true)} className={cn(smallBtn, 'flex-1 bg-card text-foreground border border-card-border')}>{t('cash.countIt')}</button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-muted" htmlFor="cash-count">{t('cash.countLabel')}</label>
              <input id="cash-count" type="number" min="0" step="0.01" inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {missing > 0 && <p className="text-xs text-muted font-medium">{t('cash.countMissing', { amount: money(missing) })}</p>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => { setCounting(false); setAmount(''); }} className={cn(smallBtn, 'flex-1 bg-background/60 text-muted border border-card-border')}>{t('common.cancel')}</button>
                <button disabled={busy || !valid} onClick={() => run(() => countCash(wallet, typed))} className={cn(smallBtn, 'flex-1 bg-indigo-600 text-white')}>{t('debts.save')}</button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-xs font-semibold text-rose-500">{error}</p>}
    </>
  );
}
