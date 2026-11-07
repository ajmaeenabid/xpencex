import { ChevronRight, Eye, EyeOff, Landmark, Plus } from 'lucide-react';
import { Account, Loan } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { accountDisplayName } from './accounts';
import { ACCOUNT_TYPES } from './AccountForm';
import AccountIcon from './AccountIcon';
import { activeLoans } from './loans';
import { btnPrimary, btnSmall, card, HIDDEN } from './ui';

interface Props {
  accounts: Account[];
  loans: Loan[];
  symbol: string;
  revealed: Set<string>;
  onToggleBalance: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}

/** Overview: totals, then every account grouped by type */
export default function AccountList({ accounts, loans, symbol, revealed, onToggleBalance, onToggleAll, onOpen, onAdd }: Props) {
  const { t } = useI18n();
  const money = (n: number, shown = true) => `${symbol}${shown ? n.toLocaleString() : HIDDEN}`;

  if (accounts.length === 0) {
    return (
      <div className={cn(card, 'p-10 text-center space-y-4')}>
        <span className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <Landmark size={26} />
        </span>
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">{t('accounts.emptyTitle')}</p>
          <p className="text-sm text-muted font-medium max-w-sm mx-auto">{t('accounts.emptyBody')}</p>
        </div>
        <button onClick={onAdd} className={btnPrimary}><Plus size={16} /> {t('accounts.addFirst')}</button>
      </div>
    );
  }

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const allShown = accounts.every(a => revealed.has(a.id));
  const open = activeLoans(loans);
  const monthly = open.reduce((s, l) => s + Math.min(l.installment, l.remaining), 0);

  return (
    <div className="space-y-8">
      <section className={cn(card, 'p-5 space-y-5')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted font-semibold">{t('accounts.totalBalance')}</p>
            <p className={cn('text-3xl font-bold tabular-nums', allShown && total < 0 ? 'text-rose-500' : 'text-foreground')}>{money(total, allShown)}</p>
          </div>
          <button
            onClick={onToggleAll}
            aria-label={t(allShown ? 'accounts.hideAll' : 'accounts.showAll')}
            aria-pressed={allShown}
            className={cn(btnSmall, 'text-muted hover:text-foreground hover:bg-background/60 border border-card-border')}
          >
            {allShown ? <EyeOff size={15} /> : <Eye size={15} />} {t(allShown ? 'accounts.hide' : 'accounts.show')}
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-3 pt-4 border-t border-card-border">
          {[
            { label: t('accounts.statAccounts'), value: String(accounts.length) },
            { label: t('accounts.statLoans'), value: String(open.length) },
            { label: t('accounts.statMonthly'), value: money(monthly) },
          ].map(s => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[11px] text-muted font-semibold truncate">{s.label}</dt>
              <dd className="text-base font-bold text-foreground tabular-nums truncate">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {[{ type: 'cash' as const, name: 'Cash', key: 'accounts.cash' as const }, ...ACCOUNT_TYPES].map(type => {
        const group = accounts.filter(a => a.type === type.type);
        if (group.length === 0) return null;
        return (
          <section key={type.type} className="space-y-3">
            <h3 className="px-1 text-xs font-bold text-muted">
              {type.key ? t(type.key) : type.name} <span className="font-semibold">({group.length})</span>
            </h3>
            <div className={cn(card, 'divide-y divide-card-border overflow-hidden')}>
              {group.map(a => {
                const shown = revealed.has(a.id);
                const loanCount = open.filter(l => l.accountId === a.id).length;
                const sub = [
                  a.type === 'bank' ? a.holderName : a.type === 'cash' ? t('cash.sub') : t('accounts.wallet', { name: a.name }),
                  loanCount > 0 && t('accounts.loanCount', { count: loanCount }),
                ].filter(Boolean).join(' · ');
                return (
                  <div key={a.id} className="flex items-center gap-2 pr-3">
                    <button onClick={() => onOpen(a.id)} className="flex-1 min-w-0 flex items-center gap-3 p-4 text-left hover:bg-background/40 transition-colors">
                      <AccountIcon type={a.type} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground truncate">{accountDisplayName(a)}</span>
                        <span className="block text-xs text-muted font-medium truncate">{sub}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => onToggleBalance(a.id)}
                      aria-label={t(shown ? 'accounts.hideBalance' : 'accounts.showBalance', { account: accountDisplayName(a) })}
                      aria-pressed={shown}
                      className={cn('shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-bold tabular-nums hover:bg-background/60', shown && a.balance < 0 ? 'text-rose-500' : 'text-foreground')}
                    >
                      {money(a.balance, shown)}
                      {shown ? <EyeOff size={14} className="text-muted" /> : <Eye size={14} className="text-muted" />}
                    </button>
                    <button onClick={() => onOpen(a.id)} aria-label={t('accounts.openLabel', { account: accountDisplayName(a) })} className="shrink-0 text-muted hover:text-foreground">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
