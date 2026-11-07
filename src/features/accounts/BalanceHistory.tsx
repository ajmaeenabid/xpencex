import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, QueryDocumentSnapshot, startAfter, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertTriangle, ChevronDown, History, Loader2 } from 'lucide-react';
import { db } from '../../shared/firebase';
import { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import { BalanceLine, BalanceReason, balanceCheck } from '../../../ai-server/src/balanceLines';
import { startHistory } from './accountService';
import { card, HIDDEN } from './ui';

const PAGE = 30;

const REASON_TEXT: Record<BalanceReason, TKey> = {
  start: 'balance.reason.start',
  created: 'balance.reason.created',
  corrected: 'balance.reason.corrected',
  smsBalance: 'balance.reason.smsBalance',
  expense: 'balance.reason.expense',
  expenseEdit: 'balance.reason.expenseEdit',
  expenseDelete: 'balance.reason.expenseDelete',
  moneyIn: 'balance.reason.moneyIn',
  monthlyDeposit: 'balance.reason.monthlyDeposit',
  recurring: 'balance.reason.recurring',
  loanReceived: 'balance.reason.loanReceived',
  loanPayment: 'balance.reason.loanPayment',
};

type Line = BalanceLine & { id: string };

/** Where an account's balance came from: every change, newest first, and a warning if it doesn't add up */
export default function BalanceHistory({ account, symbol, shown }: { account: Account; symbol: string; shown: boolean }) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [last, setLast] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const check = balanceCheck(account);
  // A size without its sign (changes show + or −), and a balance with its sign
  const money = (n: number) => (shown ? `${symbol}${Math.abs(n).toLocaleString()}` : `${symbol}${HIDDEN}`);
  const balance = (n: number) => (shown ? `${n < 0 ? '−' : ''}${symbol}${Math.abs(n).toLocaleString()}` : `${symbol}${HIDDEN}`);

  const load = async (after: QueryDocumentSnapshot | null = null) => {
    setStatus('loading');
    try {
      const q = query(
        collection(db, 'balanceHistory'),
        where('uid', '==', account.uid),
        where('accountId', '==', account.id),
        orderBy('at', 'desc'),
        ...(after ? [startAfter(after)] : []),
        limit(PAGE),
      );
      const snap = await getDocs(q);
      const page = snap.docs.map(d => ({ id: d.id, ...d.data() } as Line));
      setLines(prev => (after ? [...prev, ...page] : page));
      setLast(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE);
      setStatus('idle');
    } catch (err) {
      console.error('Could not load the balance history:', err);
      setStatus('error');
    }
  };

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    // Accounts made before balance history existed start it now, with today's balance
    if (typeof account.historySum !== 'number') {
      await startHistory(account.id).catch(err => console.error('Could not start the balance history:', err));
    }
    load();
  };

  // While open, a new change to the balance shows straight away
  useEffect(() => {
    if (open) load();
  }, [account.balance, account.historySum]);

  return (
    <section className="space-y-3">
      {check && !check.ok && (
        <p role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs font-semibold leading-relaxed text-rose-700 dark:text-rose-300">
          <AlertTriangle size={15} className="shrink-0 mt-px" />
          {t('balance.mismatch', { amount: money(check.difference) })}
        </p>
      )}

      <button
        onClick={toggle}
        aria-expanded={open}
        className={cn(card, 'w-full flex items-center gap-3 p-4 text-left')}
      >
        <History size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-foreground">{t('balance.history')}</span>
          <span className="block text-xs text-muted font-medium">{t('balance.hint')}</span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(card, 'p-2')}>
          {lines.length === 0 && status === 'loading' && (
            <p className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-indigo-600 dark:text-indigo-400" /></p>
          )}
          {lines.length === 0 && status === 'idle' && <p className="py-6 text-center text-xs text-muted font-medium">{t('balance.none')}</p>}
          <ul className="divide-y divide-card-border">
            {lines.map(line => (
              <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{t(REASON_TEXT[line.reason] ?? 'balance.reason.expense')}</p>
                  {line.title && <p className="text-xs text-muted font-medium truncate">{line.title}</p>}
                  <p className="text-[11px] text-muted font-medium">{format(new Date(line.at), 'd MMM yyyy, h:mm a', { locale: dateLocale })}</p>
                </div>
                <div className="shrink-0 text-right">
                  {line.kind === 'change' ? (
                    <p className={cn('text-sm font-bold tabular-nums', line.amount < 0 ? 'text-rose-500' : 'text-teal-600 dark:text-teal-400')}>
                      {line.amount < 0 ? '−' : '+'}{money(line.amount)}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-bold tabular-nums text-foreground">{t('balance.setTo', { amount: balance(line.amount) })}</p>
                      {line.previous !== undefined && <p className="text-[11px] text-muted font-medium tabular-nums">{t('balance.was', { amount: balance(line.previous) })}</p>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {status === 'error' && (
            <div className="py-3 text-center space-y-2">
              <p className="text-xs text-muted font-medium">{t('balance.loadError')}</p>
              <button onClick={() => load(lines.length ? last : null)} className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{t('balance.retry')}</button>
            </div>
          )}
          {hasMore && status !== 'error' && (
            <button onClick={() => load(last)} disabled={status === 'loading'} className="w-full py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400 disabled:opacity-50">
              {t('balance.more')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
