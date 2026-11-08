import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, Landmark, Plus, X } from 'lucide-react';
import { Account, Loan } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { accountDisplayName } from './accounts';
import { deleteAccountWithLoans, useLoans } from './loanService';
import AccountList from './AccountList';
import AccountDetail from './AccountDetail';
import AccountForm from './AccountForm';
import LoanForm from './LoanForm';
import { btnSmall, iconButton } from './ui';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import CashForm from './CashForm';
import { format } from 'date-fns';
import { useAuth } from '../../app/App';
import SheetsExportButton from '../connect/SheetsExportButton';
import { SavedBalanceLine, accountsTabs } from '../connect/exportTables';
import { loadMine } from '../connect/exportData';

// The pages inside the window; Back goes to the previous one
type View =
  | { page: 'list' }
  | { page: 'account'; accountId: string }
  | { page: 'accountForm'; accountId?: string }
  | { page: 'loanForm'; accountId: string; loanId?: string };

interface Props {
  uid: string;
  accounts: Account[];
  symbol: string;
  /** Changes when another screen (Home) asks for the window to open */
  openSignal?: number;
}

/** Profile row that opens the My Accounts window: accounts, their balances and their loans */
export default function AccountsManager({ uid, accounts, symbol, openSignal }: Props) {
  const { t, dateLocale } = useI18n();
  const { profile } = useAuth();
  const loans = useLoans(uid);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<View[]>([{ page: 'list' }]);
  // Balances stay hidden until the user taps the eye button
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const view = history[history.length - 1];

  const go = (next: View) => setHistory(h => [...h, next]);
  const back = () => setHistory(h => (h.length > 1 ? h.slice(0, -1) : h));
  const openWindow = () => { setHistory([{ page: 'list' }]); setOpen(true); };
  const closeWindow = () => { setOpen(false); setRevealed(new Set()); };

  useEffect(() => { if (openSignal) openWindow(); }, [openSignal]);

  // Escape goes back a page, or closes; the page behind doesn't scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (history.length > 1) back(); else closeWindow();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, history.length]);

  const toggleBalance = (id: string) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setRevealed(accounts.every(a => revealed.has(a.id)) ? new Set() : new Set(accounts.map(a => a.id)));

  const handleDelete = async (a: Account) => {
    const loanCount = loans.filter(l => l.accountId === a.id).length;
    const message = loanCount
      ? t('accounts.confirmDeleteLoans', { account: accountDisplayName(a), count: loanCount })
      : t('accounts.confirmDelete', { account: accountDisplayName(a) });
    if (!(await confirmDialog(message, { danger: true }))) return;
    try {
      await deleteAccountWithLoans(a.id, loans, a.uid);
      setHistory([{ page: 'list' }]);
    } catch (err) {
      console.error('Error deleting account:', err);
      alertDialog(t('accounts.errorDelete'));
    }
  };

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const accountOf = (id?: string) => accounts.find(a => a.id === id);
  const loansOf = (id: string) => loans.filter(l => l.accountId === id);

  // Title and body of the current page
  let title = t('accounts.title');
  let subtitle = accounts.length ? t('accounts.windowSubtitle') : '';
  let body: React.ReactNode = null;

  if (view.page === 'list') {
    body = (
      <AccountList
        accounts={accounts} loans={loans} symbol={symbol} revealed={revealed}
        onToggleBalance={toggleBalance} onToggleAll={toggleAll}
        onOpen={(accountId) => go({ page: 'account', accountId })}
        onAdd={() => go({ page: 'accountForm' })}
      />
    );
  } else if (view.page === 'account') {
    const account = accountOf(view.accountId);
    if (account) {
      title = accountDisplayName(account);
      subtitle = t(account.type === 'cash' ? 'cash.sub' : account.type === 'bank' ? 'accounts.typeBank' : 'accounts.typeMobile');
      body = (
        <AccountDetail
          account={account} loans={loansOf(account.id)} symbol={symbol}
          shown={revealed.has(account.id)} onToggleBalance={() => toggleBalance(account.id)}
          onEdit={() => go({ page: 'accountForm', accountId: account.id })}
          onDelete={() => handleDelete(account)}
          onAddLoan={() => go({ page: 'loanForm', accountId: account.id })}
          onEditLoan={(loan: Loan) => go({ page: 'loanForm', accountId: account.id, loanId: loan.id })}
        />
      );
    }
  } else if (view.page === 'accountForm') {
    const account = accountOf(view.accountId);
    title = t(account ? 'accounts.edit' : 'accounts.add');
    subtitle = account ? accountDisplayName(account) : t('accounts.addSubtitle');
    body = account?.type === 'cash' ? (
      <CashForm key={account.id} wallet={account} symbol={symbol} onSaved={back} onCancel={back} />
    ) : (
      <AccountForm
        key={view.accountId || 'new'}
        uid={uid} accounts={accounts} symbol={symbol} account={account}
        // A new account opens its own page; an edit goes back to it
        onSaved={(accountId) => setHistory(h => account ? h.slice(0, -1) : [...h.slice(0, -1), { page: 'account', accountId }])}
        onCancel={back}
      />
    );
  } else if (view.page === 'loanForm') {
    const account = accountOf(view.accountId);
    const loan = loans.find(l => l.id === view.loanId);
    if (account) {
      title = t(loan ? 'loans.editTitle' : 'loans.add');
      subtitle = t('loans.forAccount', { account: accountDisplayName(account) });
      body = <LoanForm key={view.loanId || 'new'} uid={uid} account={account} accounts={accounts} symbol={symbol} loan={loan} onDone={back} />;
    }
  }
  // The account was deleted elsewhere while its page was open
  if (!body) body = <p className="text-center py-16 text-sm text-muted font-medium">{t('accounts.gone')}</p>;

  const atRoot = history.length === 1;

  return (
    <>
      <button
        onClick={openWindow}
        className="w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40"
      >
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Landmark size={20} />
        </div>
        <h3 className="flex-1 min-w-0 font-bold text-foreground">{t('accounts.title')}</h3>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      {/* A full window on <body>, over the bottom bar. Profile stays underneath, so closing returns to the same spot. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="accounts"
              role="dialog"
              aria-modal="true"
              aria-label={t('accounts.title')}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
            >
              <header className="shrink-0 bg-card/80 backdrop-blur-xl border-b border-card-border">
                <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-16">
                  <button onClick={atRoot ? closeWindow : back} aria-label={t(atRoot ? 'common.close' : 'common.back')} className={iconButton}>
                    {atRoot ? <X size={20} /> : <ArrowLeft size={20} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold truncate">{title}</h2>
                    {subtitle && <p className="text-xs text-muted font-medium truncate">{subtitle}</p>}
                  </div>
                  {view.page === 'list' && accounts.length > 0 && (
                    <SheetsExportButton
                      variant="icon"
                      build={async () => ({
                        title: t('sheets.titleAccounts', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
                        tabs: accountsTabs(accounts, await loadMine<SavedBalanceLine>(uid, 'balanceHistory'), loans, profile?.currency || 'BDT', t),
                      })}
                    />
                  )}
                  {view.page === 'list' && accounts.length > 0 && (
                    <button onClick={() => go({ page: 'accountForm' })} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                      <Plus size={15} /> {t('accounts.add')}
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
        document.body
      )}
    </>
  );
}
