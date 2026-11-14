import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { SlidersHorizontal } from 'lucide-react';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import DetailSheet from '../../shared/components/DetailSheet';
import DateField from '../../shared/components/DateField';
import Select from '../../shared/components/Select';
import type { Account } from '../../shared/types';
import { accountDisplayName } from '../accounts/accounts';
import { DatePreset, NO_FILTERS, TransactionFilters } from './transactionFilters';

const chip = (on: boolean) => cn('px-3 py-2 rounded-xl text-xs font-bold border transition-colors',
  on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-background/50 text-muted border-card-border');
const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';

const PRESETS: { id: DatePreset; label: TKey }[] = [
  { id: 'thisMonth', label: 'filters.thisMonth' },
  { id: 'lastMonth', label: 'filters.lastMonth' },
  { id: 'last3', label: 'filters.last3' },
  { id: 'thisYear', label: 'filters.thisYear' },
  { id: 'custom', label: 'filters.custom' },
];

/** The Transactions filter sheet: changes apply only on Apply; Clear turns every filter off */
export default function FilterSheet({ open, onClose, value, onApply, accounts }: {
  open: boolean;
  onClose: () => void;
  value: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
  accounts: Account[];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setMin(value.minAmount === null ? '' : String(value.minAmount));
    setMax(value.maxAmount === null ? '' : String(value.maxAmount));
  }, [open]);

  const set = (changes: Partial<TransactionFilters>) => setDraft(d => ({ ...d, ...changes }));
  const today = format(new Date(), 'yyyy-MM-dd');
  const amount = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) && n >= 0 ? n : null; };

  const apply = () => {
    let date = draft.date;
    if (date?.preset === 'custom' && (!date.from || !date.to)) date = null; // an unfinished custom range is ignored
    onApply({ ...draft, date, minAmount: amount(min), maxAmount: amount(max) });
    onClose();
  };

  return (
    <DetailSheet
      open={open}
      onClose={onClose}
      icon={<SlidersHorizontal size={20} className="text-indigo-600 dark:text-indigo-400" />}
      title={t('filters.title')}
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { onApply(NO_FILTERS); onClose(); }} className="h-11 rounded-xl text-sm font-bold bg-card text-muted border border-card-border">{t('filters.clear')}</button>
          <button onClick={apply} className="h-11 rounded-xl text-sm font-bold bg-indigo-600 text-white">{t('filters.apply')}</button>
        </div>
      )}
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('filters.type')}</p>
          <div className="flex flex-wrap gap-2">
            {(['all', 'expense', 'income'] as const).map(type => (
              <button key={type} type="button" onClick={() => set({ type })} aria-pressed={draft.type === type} className={chip(draft.type === type)}>
                {t(type === 'all' ? 'filters.both' : type === 'expense' ? 'filters.expenses' : 'filters.income')}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('filters.account')}</p>
          <Select
            ariaLabel={t('filters.account')}
            value={draft.accountId || ''}
            onChange={v => set({ accountId: v || null })}
            options={[{ value: '', label: t('filters.anyAccount') }, ...accounts.map(a => ({ value: a.id, label: a.type === 'cash' ? t('accounts.cash') : accountDisplayName(a) }))]}
          />
        </section>

        <section className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('filters.date')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => set({ date: null })} aria-pressed={!draft.date} className={chip(!draft.date)}>{t('filters.recent')}</button>
            {PRESETS.map(p => (
              <button key={p.id} type="button"
                onClick={() => set({ date: p.id === 'custom' ? { preset: 'custom', from: draft.date?.from || format(new Date(), 'yyyy-MM-01'), to: draft.date?.to || today } : { preset: p.id } })}
                aria-pressed={draft.date?.preset === p.id} className={chip(draft.date?.preset === p.id)}>
                {t(p.label)}
              </button>
            ))}
          </div>
          {draft.date?.preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <DateField ariaLabel={t('filters.from')} className={field} value={draft.date.from || today}
                onChange={from => set({ date: { preset: 'custom', from, to: draft.date?.to } })} />
              <DateField ariaLabel={t('filters.to')} className={field} value={draft.date.to || today}
                onChange={to => set({ date: { preset: 'custom', from: draft.date?.from, to } })} />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('filters.amount')}</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" inputMode="decimal" min="0" placeholder={t('filters.min')} aria-label={t('filters.min')} className={field} value={min} onChange={e => setMin(e.target.value)} />
            <input type="number" inputMode="decimal" min="0" placeholder={t('filters.max')} aria-label={t('filters.max')} className={field} value={max} onChange={e => setMax(e.target.value)} />
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('filters.more')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => set({ receiptOnly: !draft.receiptOnly })} aria-pressed={draft.receiptOnly} className={chip(draft.receiptOnly)}>{t('filters.withReceipt')}</button>
            <button type="button" onClick={() => set({ feeling: draft.feeling === 'worth' ? null : 'worth' })} aria-pressed={draft.feeling === 'worth'} className={chip(draft.feeling === 'worth')}>{t('regret.worth')}</button>
            <button type="button" onClick={() => set({ feeling: draft.feeling === 'regret' ? null : 'regret' })} aria-pressed={draft.feeling === 'regret'} className={chip(draft.feeling === 'regret')}>{t('regret.regret')}</button>
          </div>
        </section>
      </div>
    </DetailSheet>
  );
}
