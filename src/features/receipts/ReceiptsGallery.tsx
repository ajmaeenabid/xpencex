import { useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, Receipt as ReceiptIcon, Trash2 } from 'lucide-react';
import { useAuth } from '../../app/App';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { confirmDialog } from '../../shared/components/Dialog';
import { showToast } from '../../shared/lib/toast';
import { cn } from '../../shared/lib/utils';
import type { Expense, Receipt } from '../../shared/types';
import { RECEIPT_FILTERS, ReceiptFilter, filterReceipts, hasExpense, usage } from './receiptGallery';
import { deleteReceipt, ReceiptError } from './receiptService';
import { receiptProblemKey } from './receiptFile';
import { useReceiptExpenses } from './useReceipts';
import ReceiptThumb from './ReceiptThumb';
import ReceiptViewer, { ReceiptDetails } from './ReceiptViewer';
import ReceiptsBackupSwitch from './ReceiptsBackupSwitch';

/**
 * Every receipt, like a phone gallery: how many of the 100 are used, filter chips, a 3-column grid,
 * one receipt full screen with its expense, and a Select mode to delete several at once.
 * Shown in the chat drawer's Receipts tab and in a window from Transactions.
 */
export default function ReceiptsGallery({ receipts, expenses, onOpenExpense }: {
  receipts: Receipt[] | null;
  expenses?: Expense[]; // the screen's own full list, when it has one, so nothing extra is read
  onOpenExpense?: (expense: Expense) => void; // left out where opening an expense would lose work (Add Expense)
}) {
  const { profile, user } = useAuth();
  const uid = user?.uid;
  const { t, dateLocale } = useI18n();
  const [filter, setFilter] = useState<ReceiptFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const expenseOf = useReceiptExpenses(receipts, expenses);
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  if (!receipts) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted" size={22} /></div>;

  const exists = (id: string) => { const e = expenseOf(id); return e === undefined ? undefined : e !== null; };
  const shown = filterReceipts(receipts, filter, exists);
  const bar = usage(receipts.length);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const opened = receipts.find(r => r.id === openId);

  const detailsOf = (r: Receipt): ReceiptDetails | undefined => {
    if (!hasExpense(r, exists)) return 'none';
    const e = expenseOf(r.expenseId);
    if (!e) return undefined; // still loading
    return { title: e.title, amount: money(e.amount), date: format(new Date(e.date), 'd MMM yyyy', { locale: dateLocale }) };
  };

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };

  const removeOne = async (id: string) => {
    if (!(await confirmDialog(t('receipt.deleteConfirm'), { danger: true }))) return;
    try {
      await deleteReceipt(id);
      setOpenId(null);
      showToast('receipt.deleted');
    } catch (err) {
      showToast(receiptProblemKey(err instanceof ReceiptError ? err.code : undefined));
    }
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!(await confirmDialog(t('receipts.deleteMany', { count: ids.length }), { danger: true }))) return;
    setDeleting(true);
    let failed = 0;
    // One after another, so the server's count stays right
    for (const id of ids) {
      try { await deleteReceipt(id); } catch { failed += 1; }
    }
    setDeleting(false);
    stopSelecting();
    showToast(failed ? 'receipts.someNotDeleted' : 'receipts.deletedMany');
  };

  return (
    <div className="space-y-4">
      {uid && <ReceiptsBackupSwitch uid={uid} />}

      {/* How full the 100 is */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-xs font-bold', bar.nearlyFull ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
            {t('receipts.used', { used: bar.used, max: bar.max })}
          </p>
          {receipts.length > 0 && (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
            >
              {selecting ? t('common.cancel') : t('receipts.select')}
            </button>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-card-border/60 overflow-hidden" role="progressbar" aria-valuenow={bar.used} aria-valuemin={0} aria-valuemax={bar.max}>
          <div className={cn('h-full rounded-full', bar.nearlyFull ? 'bg-amber-500' : 'bg-indigo-600')} style={{ width: `${bar.percent}%` }} />
        </div>
      </div>

      {/* Filters, always visible */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {RECEIPT_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors',
              filter === f.id ? 'bg-indigo-600 text-white' : 'bg-background/60 text-muted border border-card-border',
            )}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
          <ReceiptIcon size={28} />
          <p className="text-xs font-medium px-6 leading-relaxed">{t(receipts.length === 0 ? 'receipts.empty' : 'receipts.emptyFilter')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shown.map(r => {
            const e = hasExpense(r, exists) ? expenseOf(r.expenseId) : null;
            const ticked = selected.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => (selecting ? toggle(r.id) : setOpenId(r.id))}
                aria-pressed={selecting ? ticked : undefined}
                className="relative text-left"
              >
                <ReceiptThumb receipt={r} />
                {selecting && (
                  <span className={cn(
                    'absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center',
                    ticked ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-black/30 border-white',
                  )}>
                    {ticked && <Check size={14} />}
                  </span>
                )}
                <p className="mt-1 text-xs font-bold text-foreground truncate">
                  {e ? money(e.amount) : e === null ? t('receipts.noExpenseShort') : ' '}
                </p>
                <p className="text-[12px] font-medium text-muted truncate">
                  {format(new Date(e ? e.date : r.createdAt), 'd MMM', { locale: dateLocale })}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selecting && (
        <div className="sticky bottom-0 flex items-center gap-3 p-3 rounded-2xl bg-[var(--card-solid)] border border-card-border shadow-soft">
          <p className="flex-1 text-sm font-bold text-foreground">{t('receipts.selected', { count: selected.size })}</p>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selected.size === 0 || deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-bold disabled:opacity-40"
          >
            {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} {t('common.delete')}
          </button>
        </div>
      )}

      {opened && (
        <ReceiptViewer
          receiptId={opened.id}
          onClose={() => setOpenId(null)}
          onDelete={() => removeOne(opened.id)}
          details={detailsOf(opened)}
          onOpenExpense={onOpenExpense && (() => {
            const e = expenseOf(opened.expenseId);
            if (!e) return;
            setOpenId(null);
            onOpenExpense(e);
          })}
        />
      )}
    </div>
  );
}
