import { format } from 'date-fns';
import { AccountIncomeSection } from '../income/IncomeCards';
import { Eye, EyeOff, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { Account, Loan } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { accountDisplayName, isMobile } from './accounts';
import AccountIcon from './AccountIcon';
import LoanCard from './LoanCard';
import BalanceHistory from './BalanceHistory';
import { btnDanger, btnPrimary, btnSecondary, btnSmall, card, HIDDEN } from './ui';

interface Props {
  account: Account;
  loans: Loan[]; // this account's loans
  symbol: string;
  shown: boolean;
  onToggleBalance: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddLoan: () => void;
  onEditLoan: (loan: Loan) => void;
}

/** One account: balance, details, and the loans taken against it */
export default function AccountDetail({ account, loans, symbol, shown, onToggleBalance, onEdit, onDelete, onAddLoan, onEditLoan }: Props) {
  const { t, dateLocale } = useI18n();
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const mobile = isMobile(account.type);
  const active = loans.filter(l => l.status === 'active').sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const finished = loans.filter(l => l.status !== 'active');

  const cash = account.type === 'cash';
  const details: { label: string; value: string }[] = cash ? [] : mobile
    ? [{ label: t('accounts.numberEnding'), value: `···${account.label}` }]
    : [
        { label: t('accounts.holder'), value: account.holderName || '' },
        { label: t('accounts.type'), value: account.label },
        {
          label: t('accounts.deposit'),
          value: account.deposit
            ? t('accounts.depositOn', { amount: money(account.deposit.amount), day: account.deposit.day })
            : t('accounts.depositNone'),
        },
        ...(account.deposit && account.nextDepositDate
          ? [{ label: t('accounts.nextDepositLabel'), value: format(new Date(account.nextDepositDate), 'd MMM yyyy', { locale: dateLocale }) }]
          : []),
      ];

  return (
    <div className="space-y-8">
      <AccountIncomeSection account={account} symbol={symbol} />
      <section className={cn(card, 'p-5 space-y-5')}>
        <div className="flex items-center gap-4">
          <AccountIcon type={account.type} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted font-semibold">{t(cash ? 'cash.title' : mobile ? 'accounts.typeMobile' : 'accounts.typeBank')}</p>
            <h3 className="text-lg font-bold text-foreground truncate">{accountDisplayName(account)}</h3>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-background/60 border border-card-border">
          <div>
            <p className="text-[12px] text-muted font-semibold">{t('accounts.balanceLabel')}</p>
            <p className={cn('text-2xl font-bold tabular-nums', shown && account.balance < 0 ? 'text-rose-500' : 'text-foreground')}>
              {symbol}{shown ? account.balance.toLocaleString() : HIDDEN}
            </p>
          </div>
          <button
            onClick={onToggleBalance}
            aria-label={t(shown ? 'accounts.hideBalance' : 'accounts.showBalance', { account: accountDisplayName(account) })}
            aria-pressed={shown}
            className={cn(btnSmall, 'text-muted hover:text-foreground hover:bg-card border border-card-border')}
          >
            {shown ? <EyeOff size={15} /> : <Eye size={15} />} {t(shown ? 'accounts.hide' : 'accounts.show')}
          </button>
        </div>

        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {details.map(d => (
            <div key={d.label} className="min-w-0">
              <dt className="text-[12px] text-muted font-semibold">{d.label}</dt>
              <dd className="text-sm font-bold text-foreground truncate">{d.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={onEdit} className={btnSecondary}><Pencil size={16} /> {t('accounts.edit')}</button>
          <button onClick={onDelete} className={btnDanger}><Trash2 size={16} /> {t('accounts.delete')}</button>
        </div>
      </section>

      <BalanceHistory account={account} symbol={symbol} shown={shown} />

      {!cash && <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <HandCoins size={18} className="text-indigo-600 dark:text-indigo-400" /> {t('loans.section')}
            </h3>
            <p className="text-xs text-muted font-medium">{t('loans.sectionHint')}</p>
          </div>
          {loans.length > 0 && (
            <button onClick={onAddLoan} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
              <Plus size={15} /> {t('loans.add')}
            </button>
          )}
        </div>

        {loans.length === 0 ? (
          <div className={cn(card, 'p-8 text-center space-y-4')}>
            <span className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <HandCoins size={22} />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">{t('loans.none')}</p>
              <p className="text-xs text-muted font-medium max-w-xs mx-auto">{t('loans.emptyBody')}</p>
            </div>
            <button onClick={onAddLoan} className={btnPrimary}><Plus size={16} /> {t('loans.add')}</button>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(loan => <LoanCard key={loan.id} loan={loan} symbol={symbol} onEdit={() => onEditLoan(loan)} />)}
            {finished.length > 0 && (
              <>
                <p className="pt-3 text-xs font-bold text-muted">{t('loans.completed')}</p>
                {finished.map(loan => <LoanCard key={loan.id} loan={loan} symbol={symbol} onEdit={() => onEditLoan(loan)} />)}
              </>
            )}
          </div>
        )}
      </section>}
    </div>
  );
}
