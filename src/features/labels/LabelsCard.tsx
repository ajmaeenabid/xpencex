import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Pencil, Tag, Trash2 } from 'lucide-react';
import { useStartDay } from '../../app/useStartDay';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Deposit, Expense } from '../../shared/types';
import DetailSheet, { DetailLine } from '../../shared/components/DetailSheet';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { btnPrimary, btnSecondary, inputClass } from '../accounts/ui';
import { REPORTS_MONTHS, windowStart } from '../expenses/expenseQueries';
import { IconBox } from '../home/TapCard';
import { useIncome } from '../income/incomeService';
import { LabelTotal, MAX_LABEL_LENGTH, cleanLabel, hasLabel, labelTotals, sameLabel } from './labels';
import { changeLabelEverywhere } from './labelService';

/** Reports: what each label cost and brought in. Tap one to see its entries, rename it or remove it. */
export default function LabelsCard({ uid, expenses, symbol }: { uid: string; expenses: Expense[]; symbol: string }) {
  const { t } = useI18n();
  const incomes = useIncome(uid, windowStart(REPORTS_MONTHS, new Date(), useStartDay()));
  const totals = labelTotals(expenses, incomes);
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const open = openLabel ? totals.find(x => sameLabel(x.label, openLabel)) : undefined;
  const money = (n: number) => `${n < 0 ? '-' : ''}${symbol}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border">
      <h3 className="text-lg font-bold text-foreground">{t('labels.title')}</h3>
      <p className="text-xs text-muted font-medium mb-4">{t('reports.last12Months')}</p>
      {totals.length === 0 ? (
        <p className="text-sm text-muted font-medium text-center py-4">{t('labels.empty')}</p>
      ) : (
        <div className="space-y-2">
          {totals.map(total => (
            <button key={total.label} onClick={() => setOpenLabel(total.label)} className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50 text-left">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground truncate">{total.label}</span>
                <span className="block text-[12px] text-muted font-medium">{t('labels.entries', { count: total.count })}</span>
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <span className="text-right">
                  <span className="block text-sm font-bold text-foreground tabular-nums">{money(total.spent)}</span>
                  {total.received > 0 && <span className="block text-[12px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{money(total.received)}</span>}
                </span>
                <ChevronRight size={18} className="text-muted" />
              </span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <LabelSheet key={open.label} uid={uid} total={open} expenses={expenses} incomes={incomes} money={money} onClose={() => setOpenLabel(null)} onRenamed={setOpenLabel} />
      )}
    </div>
  );
}

function LabelSheet({ uid, total, expenses, incomes, money, onClose, onRenamed }: {
  uid: string;
  total: LabelTotal;
  expenses: Expense[];
  incomes: Deposit[];
  money: (n: number) => string;
  onClose: () => void;
  onRenamed: (label: string) => void;
}) {
  const { t, dateLocale } = useI18n();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const entries = [
    ...expenses.filter(e => hasLabel(e.labels, total.label)).map(e => ({ id: e.id, title: e.title, date: e.date, amount: -e.amount })),
    ...incomes.filter(d => hasLabel(d.labels, total.label)).map(d => ({ id: d.id, title: d.title || t('income.untitled'), date: d.date, amount: d.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const change = async (to: string | null) => {
    setBusy(true);
    try {
      await changeLabelEverywhere(uid, total.spellings, to);
      if (to) { onRenamed(to); setName(null); } else onClose();
    } catch (err) {
      console.error('Could not change the label:', err);
      alertDialog(t('labels.error'));
    } finally {
      setBusy(false);
    }
  };

  const rename = () => {
    const next = cleanLabel(name);
    if (!next) { setError(t('secret.warning')); return; }
    setError('');
    if (next === total.label) setName(null);
    else change(next);
  };

  const remove = async () => {
    if (await confirmDialog(t('labels.confirmRemove', { name: total.label }), { danger: true })) change(null);
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<IconBox Icon={Tag} size="lg" />}
      title={total.label}
      about={t('reports.last12Months')}
      footer={name === null ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setName(total.label)} disabled={busy} className={btnSecondary}><Pencil size={15} /> {t('labels.rename')}</button>
          <button onClick={remove} disabled={busy} className={cn(btnSecondary, 'text-rose-600 dark:text-rose-400')}><Trash2 size={15} /> {t('labels.removeAll')}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input autoFocus maxLength={MAX_LABEL_LENGTH} aria-label={t('labels.newName')} placeholder={t('labels.newName')} className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          {error && <p role="alert" className="text-xs font-semibold text-rose-500">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setName(null); setError(''); }} disabled={busy} className={btnSecondary}>{t('common.cancel')}</button>
            <button onClick={rename} disabled={busy || !name.trim()} className={btnPrimary}>{t(busy ? 'common.saving' : 'common.save')}</button>
          </div>
        </div>
      )}
    >
      <DetailLine label={t('labels.spent')} value={money(total.spent)} />
      <DetailLine label={t('labels.received')} value={money(total.received)} />
      <DetailLine label={t('labels.net')} value={money(total.net)} tone={total.net < 0 ? 'bad' : undefined} />
      <div className="divide-y divide-card-border rounded-xl border border-card-border">
        {entries.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-foreground truncate">{e.title}</span>
              <span className="block text-xs text-muted font-medium">{format(new Date(e.date), 'd MMM yyyy', { locale: dateLocale })}</span>
            </span>
            <span className={cn('shrink-0 text-sm font-bold tabular-nums', e.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
              {e.amount > 0 ? '+' : ''}{money(e.amount)}
            </span>
          </div>
        ))}
      </div>
    </DetailSheet>
  );
}
