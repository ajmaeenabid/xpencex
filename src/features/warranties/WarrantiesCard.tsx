import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Receipt as ReceiptIcon, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../app/App';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Expense } from '../../shared/types';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import FullWindow from '../../shared/components/FullWindow';
import { card as cardClass } from '../accounts/ui';
import { TONE_CLASS } from '../home/TapCard';
import ReceiptViewer from '../receipts/ReceiptViewer';
import { splitWarranties, warrantyDaysLeft } from './warranties';
import { removeWarranty, useWarranties } from './warrantyService';

/** Expenses side panel: one row that opens every warranty */
export default function WarrantiesCard() {
  const { user, profile } = useAuth();
  const { t, dateLocale } = useI18n();
  const warranties = useWarranties(user?.uid);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const { active, ended } = splitWarranties(warranties);
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const day = (iso: string) => format(new Date(iso), 'd MMM yyyy', { locale: dateLocale });

  const remove = async (expense: Expense) => {
    if (!(await confirmDialog(t('warranty.confirmRemove', { name: expense.title }), { danger: true, okLabel: t('common.remove') }))) return;
    try {
      await removeWarranty(expense.id);
    } catch (err) {
      console.error('Could not remove the warranty:', err);
      alertDialog(t('warranty.error'));
    }
  };

  const row = (expense: Expense & { warrantyUntil: string }) => {
    const left = warrantyDaysLeft(expense.warrantyUntil);
    const tone = left < 0 ? 'bg-background text-muted border border-card-border' : TONE_CLASS[left <= 30 ? 'warning' : 'good'];
    const status = left < 0 ? t('warranty.endedOn', { date: day(expense.warrantyUntil) })
      : left === 0 ? t('warranty.lastDay')
      : t('warranty.daysLeft', { days: left, date: day(expense.warrantyUntil) });
    return (
      <div key={expense.id} className={cn(cardClass, 'p-4 space-y-2')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-foreground truncate">{expense.title}</p>
            <p className="text-xs font-medium text-muted">{t('warranty.bought', { date: day(expense.date), amount: `${symbol}${expense.amount.toLocaleString()}` })}</p>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {expense.receiptId && (
              <button onClick={() => setViewing(expense.receiptId!)} aria-label={t('receipt.view')} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"><ReceiptIcon size={16} /></button>
            )}
            <button onClick={() => remove(expense)} aria-label={t('warranty.remove', { name: expense.title })} className="p-1.5 rounded-lg text-muted hover:text-rose-500"><X size={16} /></button>
          </div>
        </div>
        <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[12px] font-bold', tone)}>{status}</span>
      </div>
    );
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full bg-card p-5 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left">
        <span className="w-10 h-10 shrink-0 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400"><ShieldCheck size={20} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-foreground">{t('warranty.title')}</span>
          <span className="block text-xs text-muted font-medium">{t('warranty.activeCount', { count: active.length })}</span>
        </span>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </button>

      <FullWindow
        open={open}
        above
        atRoot
        onClose={() => setOpen(false)}
        onBack={() => setOpen(false)}
        pageKey="warranties"
        icon={<ShieldCheck size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
        title={t('warranty.title')}
      >
        {warranties.length === 0 && (
          <div className={cn(cardClass, 'p-8 text-center space-y-2')}>
            <p className="text-lg font-bold text-foreground">{t('warranty.emptyTitle')}</p>
            <p className="text-sm text-muted font-medium leading-relaxed">{t('warranty.emptyBody')}</p>
          </div>
        )}
        {active.length > 0 && <section className="space-y-3"><h3 className="px-1 text-sm font-bold text-muted">{t('warranty.active')}</h3>{active.map(row)}</section>}
        {ended.length > 0 && <section className="space-y-3"><h3 className="px-1 text-sm font-bold text-muted">{t('warranty.ended')}</h3>{ended.map(row)}</section>}
      </FullWindow>
      {viewing && <ReceiptViewer receiptId={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
