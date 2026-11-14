import { Banknote, Landmark, Smartphone } from 'lucide-react';
import { Account } from '../../shared/types';
import { CASH_ID, CASH_NAME, accountDisplayName, isMobile } from './accounts';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';

interface Props {
  accounts: Account[];
  value: string;
  onChange: (accountId: string) => void;
  symbol: string;
  compact?: boolean; // smaller chips for the chat confirmation card
  includeCash?: boolean; // false for money coming in: cash has no balance to add to
}

/** "Paid from" choice: Cash, or one of the user's bank / mobile banking accounts */
export default function AccountPicker({ accounts, value, onChange, symbol, compact, includeCash = true }: Props) {
  const { t } = useI18n();
  // With a Cash wallet, Cash is that account (with its balance); without one, a plain "Cash" choice
  const wallet = accounts.find(a => a.type === 'cash');
  const options = [
    ...(includeCash && !wallet ? [{ id: CASH_ID, title: t('accounts.cash'), balance: null as number | null, Icon: Banknote }] : []),
    ...[...accounts].sort((a, b) => (a.type === 'cash' ? -1 : b.type === 'cash' ? 1 : 0)).map(a => ({
      id: a.id,
      title: a.type === 'cash' ? t('accounts.cash') : accountDisplayName(a),
      balance: a.balance,
      Icon: a.type === 'cash' ? Banknote : isMobile(a.type) ? Smartphone : Landmark,
    })),
  ];

  return (
    <div role="radiogroup" aria-label={t('add.paidFrom')} className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {options.map(({ id, title, balance, Icon }) => {
        const selected = value === id || (value === CASH_ID && id === wallet?.id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              'shrink-0 flex items-center gap-2 rounded-2xl border-2 text-left transition-all',
              compact ? 'px-3 py-2' : 'px-3.5 py-2.5',
              selected
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-vibrant'
                : 'bg-background/50 text-foreground border-transparent hover:border-card-border'
            )}
          >
            <Icon size={compact ? 14 : 16} className={selected ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'} />
            <span className="flex flex-col">
              <span className={cn('font-bold whitespace-nowrap', compact ? 'text-[12px]' : 'text-xs')}>{title}</span>
              {balance !== null && (
                <span className={cn('text-[11px] font-semibold tabular-nums', selected ? 'text-white/80' : balance < 0 ? 'text-rose-500' : 'text-muted')}>
                  {symbol}{balance.toLocaleString()}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
