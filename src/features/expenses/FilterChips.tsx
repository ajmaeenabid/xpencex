import { format } from 'date-fns';
import { X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import type { Account } from '../../shared/types';
import { accountDisplayName } from '../accounts/accounts';
import { NO_FILTERS, TransactionFilters } from './transactionFilters';

/** The filters that are on, under the search box. Tapping one turns just that filter off. */
export default function FilterChips({ filters, setFilters, accounts, symbol }: {
  filters: TransactionFilters;
  setFilters: (f: TransactionFilters) => void;
  accounts: Account[];
  symbol: string;
}) {
  const { t, dateLocale } = useI18n();
  const day = (d?: string) => (d ? format(new Date(`${d}T12:00:00`), 'd MMM yyyy', { locale: dateLocale }) : '');
  const chips: { key: string; label: string; off: Partial<TransactionFilters> }[] = [];

  if (filters.type !== 'all') chips.push({ key: 'type', label: t(filters.type === 'income' ? 'filters.income' : 'filters.expenses'), off: { type: 'all' } });
  if (filters.accountId) {
    const a = accounts.find(x => x.id === filters.accountId);
    chips.push({ key: 'account', label: a ? (a.type === 'cash' ? t('accounts.cash') : accountDisplayName(a)) : t('filters.account'), off: { accountId: null } });
  }
  if (filters.date) {
    const label = filters.date.preset === 'custom'
      ? `${day(filters.date.from)} - ${day(filters.date.to)}`
      : t(({ thisMonth: 'filters.thisMonth', lastMonth: 'filters.lastMonth', last3: 'filters.last3', thisYear: 'filters.thisYear' } as const)[filters.date.preset]);
    chips.push({ key: 'date', label, off: { date: null } });
  }
  if (filters.minAmount !== null || filters.maxAmount !== null) {
    const from = filters.minAmount !== null ? `${symbol}${filters.minAmount.toLocaleString()}` : '';
    const to = filters.maxAmount !== null ? `${symbol}${filters.maxAmount.toLocaleString()}` : '';
    chips.push({ key: 'amount', label: from && to ? `${from} - ${to}` : from ? t('filters.atLeast', { amount: from }) : t('filters.atMost', { amount: to }), off: { minAmount: null, maxAmount: null } });
  }
  if (filters.receiptOnly) chips.push({ key: 'receipt', label: t('filters.withReceipt'), off: { receiptOnly: false } });
  if (filters.feeling) chips.push({ key: 'feeling', label: t(filters.feeling === 'worth' ? 'regret.worth' : 'regret.regret'), off: { feeling: null } });

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1">
      {chips.map(c => (
        <button key={c.key} onClick={() => setFilters({ ...filters, ...c.off })} aria-label={t('filters.remove', { name: c.label })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 text-xs font-bold">
          {c.label} <X size={13} />
        </button>
      ))}
      {chips.length > 1 && (
        <button onClick={() => setFilters(NO_FILTERS)} className="px-2 py-1.5 text-xs font-bold text-muted">{t('filters.clear')}</button>
      )}
    </div>
  );
}
