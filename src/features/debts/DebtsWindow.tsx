import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { ArrowLeft, ChevronRight, HandHeart, Plus, Send, Trash2, X } from 'lucide-react';
import { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { copyText } from '../../shared/lib/clipboard';
import { showToast } from '../../shared/lib/toast';
import { alertDialog, confirmDialog, confirmWithTick } from '../../shared/components/Dialog';
import { deleteReceipt, ReceiptError, receiptOfExpense } from '../receipts/receiptService';
import { btnPrimary, btnSecondary, btnSmall, card, iconButton } from '../accounts/ui';
import { Debt, DebtKind, Person, debtTotals, owedChange, people, settleEntry } from './debts';
import { deleteDebt } from './debtService';
import DebtForm, { KIND_TEXT } from './DebtForm';
import { useAuth } from '../../app/App';
import SheetsExportButton from '../connect/SheetsExportButton';
import { debtsTabs } from '../connect/exportTables';

type View =
  | { page: 'list' }
  | { page: 'person'; key: string }
  | { page: 'form'; person?: string; kind?: DebtKind; amount?: number };

/** The full Lend & borrow window: everyone you lend to or borrow from, their entries, settle and remind */
export default function DebtsWindow({ open, onClose, uid, accounts, debts, symbol }: {
  open: boolean;
  onClose: () => void;
  uid: string;
  accounts: Account[];
  debts: Debt[];
  symbol: string;
}) {
  const { t, dateLocale } = useI18n();
  const { profile } = useAuth();
  const currency = profile?.currency || 'BDT';
  const [history, setHistory] = useState<View[]>([{ page: 'list' }]);
  const view = history[history.length - 1];
  const go = (next: View) => setHistory(h => [...h, next]);
  const back = () => setHistory(h => (h.length > 1 ? h.slice(0, -1) : h));
  const close = () => { onClose(); setHistory([{ page: 'list' }]); };
  const money = (n: number) => `${symbol}${Math.abs(n).toLocaleString()}`;

  // Escape goes back a page, or closes; the page behind doesn't scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (history.length > 1) back(); else close();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, history.length]);

  const everyone = people(debts);
  const totals = debtTotals(debts);
  const names = everyone.map(p => p.name);

  const remind = async (p: Person) => {
    const text = t('debts.reminderText', { name: p.name, amount: money(p.net) });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // closed the share sheet
    }
    if (await copyText(text)) showToast('debts.copied');
  };

  const remove = async (d: Debt) => {
    const question = t('debts.confirmDelete', { kind: t(KIND_TEXT[d.kind]), amount: money(d.amount), name: d.person });
    // Its expense may have a receipt: then the same box asks about it too
    const receiptId = await receiptOfExpense(d.expenseId);
    let alsoReceipt = false;
    if (receiptId) {
      const answer = await confirmWithTick(question, t('receipt.alsoDelete'), { danger: true });
      if (!answer.ok) return;
      alsoReceipt = answer.ticked;
    } else if (!(await confirmDialog(question, { danger: true }))) return;
    try {
      await deleteDebt(d, accounts);
      if (receiptId && alsoReceipt) {
        deleteReceipt(receiptId)
          .then(() => showToast('receipt.deleted'))
          .catch(err => showToast(err instanceof ReceiptError && err.code === 'offline' ? 'receipt.deleteLater' : 'receipt.problem.delete'));
      }
    } catch (err) {
      console.error('Error deleting lend or borrow entry:', err);
      alertDialog(t('debts.errorDelete'));
    }
  };

  const netText = (net: number) => (Math.abs(net) < 0.01 ? t('debts.settled') : net > 0 ? t('debts.owesYou', { amount: money(net) }) : t('debts.youOwe', { amount: money(net) }));
  const netClass = (net: number) => (Math.abs(net) < 0.01 ? 'text-muted' : net > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-500');

  let title = t('debts.title');
  let subtitle = t('debts.subtitle');
  let body: React.ReactNode = null;

  if (view.page === 'list') {
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(card, 'p-4')}>
            <p className="text-[12px] text-muted font-semibold">{t('debts.toGet')}</p>
            <p className="text-xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">{money(totals.toGet)}</p>
          </div>
          <div className={cn(card, 'p-4')}>
            <p className="text-[12px] text-muted font-semibold">{t('debts.toGive')}</p>
            <p className="text-xl font-bold text-rose-500 tabular-nums">{money(totals.toGive)}</p>
          </div>
        </div>
        {everyone.length === 0 ? (
          <div className={cn(card, 'p-8 text-center space-y-4')}>
            <p className="text-sm font-bold text-foreground">{t('debts.none')}</p>
            <p className="text-xs text-muted font-medium max-w-xs mx-auto">{t('debts.noneBody')}</p>
            <button onClick={() => go({ page: 'form' })} className={btnPrimary}><Plus size={16} /> {t('debts.add')}</button>
          </div>
        ) : (
          <ul className="space-y-2">
            {everyone.map(p => (
              <li key={p.key}>
                <button onClick={() => go({ page: 'person', key: p.key })} className={cn(card, 'w-full flex items-center gap-3 p-4 text-left')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                    <p className={cn('text-xs font-semibold', netClass(p.net))}>{netText(p.net)}</p>
                  </div>
                  <ChevronRight size={18} className="text-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (view.page === 'person') {
    const p = everyone.find(x => x.key === view.key);
    if (p) {
      title = p.name;
      subtitle = netText(p.net);
      const settle = settleEntry(p.net);
      body = (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => go({ page: 'form', person: p.name })} className={btnSecondary}><Plus size={16} /> {t('debts.addEntry')}</button>
            {settle ? (
              <button onClick={() => go({ page: 'form', person: p.name, kind: settle.kind, amount: settle.amount })} className={btnPrimary}>{t('debts.settle')}</button>
            ) : <span />}
          </div>
          {p.net > 0 && (
            <button onClick={() => remind(p)} className={cn(btnSecondary, 'w-full')}><Send size={16} /> {t('debts.remind')}</button>
          )}
          <ul className={cn(card, 'divide-y divide-card-border')}>
            {p.entries.map(d => (
              <li key={d.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{t(KIND_TEXT[d.kind])}</p>
                  <p className="text-[12px] text-muted font-medium">
                    {format(new Date(d.date), 'd MMM yyyy', { locale: dateLocale })}
                    {d.accountName && ` · ${d.accountName}`}
                    {d.expenseId && ` · ${t('debts.inSpending')}`}
                  </p>
                  {d.note && <p className="text-xs text-muted font-medium mt-0.5">{d.note}</p>}
                </div>
                <p className={cn('text-sm font-bold tabular-nums shrink-0', owedChange(d.kind, d.amount) > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-500')}>{money(d.amount)}</p>
                <button onClick={() => remove(d)} aria-label={t('debts.deleteEntry')} className={cn(btnSmall, 'w-9 px-0 text-muted hover:text-rose-500')}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  } else if (view.page === 'form') {
    title = t('debts.add');
    subtitle = view.person || t('debts.subtitle');
    body = (
      <DebtForm
        key={`${view.person}-${view.kind}-${view.amount}`}
        uid={uid} accounts={accounts} symbol={symbol} names={names}
        person={view.person} kind={view.kind} amount={view.amount}
        onDone={back}
      />
    );
  }
  // That person's last entry was deleted while their page was open
  if (!body) body = <p className="text-center py-16 text-sm text-muted font-medium">{t('debts.gone')}</p>;
  const atRoot = history.length === 1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="debts"
          role="dialog"
          aria-modal="true"
          aria-label={t('debts.title')}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
        >
          <header className="shrink-0 bg-card/80 backdrop-blur-xl border-b border-card-border">
            <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-16">
              <button onClick={atRoot ? close : back} aria-label={t(atRoot ? 'common.close' : 'common.back')} className={iconButton}>
                {atRoot ? <X size={20} /> : <ArrowLeft size={20} />}
              </button>
              <HandHeart size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold truncate">{title}</h2>
                {subtitle && <p className="text-xs text-muted font-medium truncate">{subtitle}</p>}
              </div>
              {view.page === 'list' && everyone.length > 0 && (
                <SheetsExportButton
                  variant="icon"
                  build={() => ({
                    title: t('sheets.titleDebts', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
                    tabs: debtsTabs(debts, currency, t),
                  })}
                />
              )}
              {view.page === 'list' && everyone.length > 0 && (
                <button onClick={() => go({ page: 'form' })} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                  <Plus size={15} /> {t('debts.add')}
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={history.length + view.page}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-12"
              >
                {body}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
