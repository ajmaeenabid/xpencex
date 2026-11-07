import { motion } from 'motion/react';
import { Check, Info, Loader2, Plus } from 'lucide-react';
import { Account, ChatMessage, Expense } from '../../shared/types';
import { TFunction, categoryLabel, useI18n } from '../../shared/i18n';
import { CASH_ID } from '../accounts/accounts';
import AccountPicker from '../accounts/AccountPicker';
import { savedInAnotherVersion } from './versions';
import { ReplyLanguage } from './language';
import type { DebtChoice } from './useConfirmActions';
import { personFromSms } from '../debts/debts';
import { loadChoices } from '../debts/DebtForm';
import { findWallet, isCashOut } from '../accounts/cash';

export type WithExpense = ChatMessage & { pendingExpense: Partial<Expense> };
export type WithIncome = ChatMessage & { pendingIncome: NonNullable<ChatMessage['pendingIncome']> };

/** What the confirm cards need from the chat */
export interface CardActions {
  messages: ChatMessage[];
  currencySymbol: string;
  accounts: Account[];
  accountChoices: Record<string, string>;
  setAccountChoices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  syncChoices: Record<string, boolean>;
  setSyncChoices: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  debtChoices: Record<string, DebtChoice>;
  setDebtChoices: React.Dispatch<React.SetStateAction<Record<string, DebtChoice>>>;
  isConfirming: boolean;
  confirmExpense: (messageId: string, expense: Partial<Expense>) => void;
  confirmIncome: (messageId: string) => void;
  markResolved: (id: string, saved?: boolean) => void;
  addMessage: (role: 'user' | 'assistant', content: string) => string;
  tIn: (language?: ReplyLanguage) => TFunction;
}

function balanceSyncFor({ syncChoices, setSyncChoices, currencySymbol }: CardActions, t: TFunction) {
  // Tick box offered when an SMS states the account's new balance
  return (msg: ChatMessage, accountId: string | undefined) =>
    msg.sms?.balance !== undefined && accountId && accountId !== CASH_ID && (
      <label className="flex items-start gap-3 bg-background/50 p-3 rounded-xl cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600"
          checked={!!syncChoices[msg.id]}
          onChange={(e) => setSyncChoices(prev => ({ ...prev, [msg.id]: e.target.checked }))}
        />
        <span className="text-xs font-medium text-muted leading-relaxed">
          {t('chat.syncBefore')} <b className="text-foreground">{currencySymbol}{msg.sms.balance.toLocaleString()}</b>{t('chat.syncAfter')}
        </span>
      </label>
    );
}

/** "This is money I lent" or "paid back to me" on an SMS card, with who it was */
function DebtTick({ msg, cards, label, startPerson, withSpending }: { msg: ChatMessage; cards: CardActions; label: string; startPerson: string; withSpending: boolean }) {
  const { t } = useI18n();
  const choice = cards.debtChoices[msg.id];
  const set = (next: Partial<DebtChoice>) => cards.setDebtChoices(prev => ({
    ...prev,
    [msg.id]: { on: false, person: startPerson, spending: loadChoices().spending, ...prev[msg.id], ...next },
  }));
  return (
    <div className="bg-background/50 p-3 rounded-xl space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" checked={!!choice?.on} onChange={(e) => set({ on: e.target.checked })} />
        <span className="text-xs font-semibold text-foreground leading-relaxed">{label}</span>
      </label>
      {choice?.on && (
        <>
          <input
            value={choice.person}
            onChange={(e) => set({ person: e.target.value })}
            maxLength={60}
            placeholder={t('debts.chatPerson')}
            aria-label={t('debts.chatPerson')}
            className="w-full h-10 px-3 rounded-xl bg-card border border-card-border text-sm text-foreground outline-none focus:border-indigo-500"
          />
          {withSpending && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" checked={choice.spending} onChange={(e) => set({ spending: e.target.checked })} />
              <span className="text-xs font-medium text-muted leading-relaxed">{t('debts.chatSpending')}</span>
            </label>
          )}
        </>
      )}
    </div>
  );
}

/** True when the tick is on but nobody is named yet, so Confirm waits */
const debtNeedsName = (cards: CardActions, id: string) => !!cards.debtChoices[id]?.on && !cards.debtChoices[id].person.trim();

function duplicateWarningFor(t: TFunction) {
  return (
  <p role="status" className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-xs font-semibold leading-relaxed">
    <Info size={15} className="shrink-0 mt-px" />
    {t('chat.duplicateWarn')}
  </p>
  );
}

export function ExpenseCard({ msg, cards }: { msg: WithExpense; cards: CardActions }) {
  const { t } = useI18n();
  const { messages, currencySymbol, accounts, accountChoices, setAccountChoices, isConfirming, confirmExpense, markResolved, addMessage, tIn } = cards;
  const balanceSync = balanceSyncFor(cards, t);
  const duplicateWarning = duplicateWarningFor(t);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border text-foreground space-y-4 w-full"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Check size={20} />
        </div>
        <h4 className="font-bold">{t('chat.confirmTitle')}</h4>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('add.fieldTitle')}</span>
          <span className="font-bold text-sm">{msg.pendingExpense.title}</span>
        </div>
        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{currencySymbol}{msg.pendingExpense.amount}</span>
        </div>
        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('add.category')}</span>
          <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold">{categoryLabel(t, msg.pendingExpense.category || '')}</span>
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-muted">{t('add.paidFrom')}</span>
          <AccountPicker
            compact
            accounts={accounts}
            value={accountChoices[msg.id] || msg.pendingExpense.accountId || CASH_ID}
            onChange={(id) => setAccountChoices(prev => ({ ...prev, [msg.id]: id }))}
            symbol={currencySymbol}
          />
        </div>
        {balanceSync(msg, accountChoices[msg.id] || msg.pendingExpense.accountId)}
        {findWallet(accounts) && accountChoices[msg.id] !== findWallet(accounts)!.id && isCashOut(msg.pendingExpense.title || '') && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-xl leading-relaxed">
            {t('cash.cardNote', { amount: `${currencySymbol}${(Math.round(((msg.pendingExpense.amount || 0) - (msg.pendingExpense.fee || 0)) * 100) / 100).toLocaleString()}` })}
          </p>
        )}
        {msg.sms && /send\s*money/i.test(msg.pendingExpense.title || '') && (
          <DebtTick msg={msg} cards={cards} label={t('debts.chatLent')} startPerson={personFromSms(msg.pendingExpense.title || '')} withSpending />
        )}
        {savedInAnotherVersion(messages, msg.id) && duplicateWarning}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => confirmExpense(msg.id, msg.pendingExpense!)}
          disabled={isConfirming || debtNeedsName(cards, msg.id)}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
        >
          {isConfirming ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('chat.confirm')
          )}
        </button>
        <button
          onClick={() => {
            markResolved(msg.id);
            addMessage('assistant', tIn(msg.replyLang)('chat.tryAgain'));
          }}
          disabled={isConfirming}
          className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
        >
          {t('common.edit')}
        </button>
      </div>
      <button
        onClick={() => {
          markResolved(msg.id);
          addMessage('assistant', tIn(msg.replyLang)('chat.cancelledExpense'));
        }}
        disabled={isConfirming}
        className="w-full py-2.5 text-sm font-bold text-muted hover:text-rose-500 transition-colors disabled:opacity-50"
      >
        {t('common.cancel')}
      </button>
    </motion.div>
  );
}

export function IncomeCard({ msg, cards }: { msg: WithIncome; cards: CardActions }) {
  const { t } = useI18n();
  const { messages, currencySymbol, accounts, accountChoices, setAccountChoices, isConfirming, confirmIncome, markResolved, addMessage, tIn } = cards;
  const balanceSync = balanceSyncFor(cards, t);
  const duplicateWarning = duplicateWarningFor(t);
  const income = msg.pendingIncome;
  const chosen = accountChoices[msg.id] || income.accountId;
  const choices = msg.sms?.accountType === 'bank' ? accounts.filter(a => a.type === 'bank') : accounts;
  const pickerAccounts = choices.length ? choices : accounts;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border text-foreground space-y-4 w-full"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-teal-50 dark:bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
          <Plus size={20} />
        </div>
        <h4 className="font-bold">{t('chat.moneyReceived')}</h4>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-teal-600 dark:text-teal-400">+{currencySymbol}{income.amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center gap-3 bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('chat.what')}</span>
          <span className="font-bold text-sm text-right">{income.title}</span>
        </div>
        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
          <span className="text-xs font-semibold text-muted">{t('add.date')}</span>
          <span className="font-bold text-sm">{new Date(income.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-muted">{msg.sms?.accountType === 'bank' ? t('chat.addToBank') : t('chat.addTo')}</span>
          {pickerAccounts.length > 0 ? (
            <AccountPicker
              compact
              includeCash={false}
              accounts={pickerAccounts}
              value={chosen || ''}
              onChange={(id) => setAccountChoices(prev => ({ ...prev, [msg.id]: id }))}
              symbol={currencySymbol}
            />
          ) : (
            <p className="text-xs text-muted font-medium">{t('chat.noAccountsYet')}</p>
          )}
        </div>
        {balanceSync(msg, chosen)}
        {msg.sms && <DebtTick msg={msg} cards={cards} label={t('debts.chatGotBack')} startPerson="" withSpending={false} />}
        {savedInAnotherVersion(messages, msg.id) && duplicateWarning}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => confirmIncome(msg.id)}
          disabled={isConfirming || !chosen || debtNeedsName(cards, msg.id)}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
        >
          {isConfirming ? <><Loader2 size={16} className="animate-spin" /> {t('common.saving')}</> : chosen ? t('chat.addMoney') : t('chat.pickAccount')}
        </button>
        <button
          onClick={() => {
            markResolved(msg.id);
            addMessage('assistant', tIn(msg.replyLang)('chat.cancelledIncome'));
          }}
          disabled={isConfirming}
          className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </motion.div>
  );
}
