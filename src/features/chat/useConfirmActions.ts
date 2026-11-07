import { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Account, ChatMessage, Expense } from '../../shared/types';
import { TFunction } from '../../shared/i18n';
import { confirmDialog } from '../../shared/components/Dialog';
import { CASH_ID, accountDisplayName } from '../accounts/accounts';
import { adjustBalance, changeBalance, paymentFields, setBalance, shortAccount } from '../accounts/accountService';
import { ReplyLanguage } from './language';
import { saved } from '../../shared/lib/offlineSave';

type AddMessage = (role: 'user' | 'assistant', content: string, type?: ChatMessage['type']) => string;

/** Saving what a confirm card shows: an expense, or money in to an account */
export function useConfirmActions({ user, messages, accounts, currencySymbol, tIn, t, addMessage, markResolved }: {
  user: User | null;
  messages: ChatMessage[];
  accounts: Account[];
  currencySymbol: string;
  tIn: (language?: ReplyLanguage) => TFunction;
  t: TFunction;
  addMessage: AddMessage;
  markResolved: (id: string, saved?: boolean) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  // "Paid from" choice for each confirmation card, by message id
  const [accountChoices, setAccountChoices] = useState<Record<string, string>>({});
  // "Also match the balance the SMS reported" tick box, by message id
  const [syncChoices, setSyncChoices] = useState<Record<string, boolean>>({});

  // True when this SMS was already saved (as an expense or as money in)
  const alreadySaved = async (ref: string) => {
    if (!user) return false;
    const [spent, received] = await Promise.all([
      getDocs(query(collection(db, 'expenses'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
      getDocs(query(collection(db, 'deposits'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
    ]);
    return !spent.empty || !received.empty;
  };

  // Money in: add it to the chosen account and log it, so Reports can show it
  const confirmIncome = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const income = msg?.pendingIncome;
    if (!user || isConfirming || !income || msg.resolved) return;
    const account = accounts.find(a => a.id === (accountChoices[messageId] || income.accountId));
    if (!account) return;
    const sms = msg.sms;
    const syncTo = sms?.balance !== undefined && syncChoices[messageId] ? sms.balance : undefined;

    setIsConfirming(true);
    try {
      if (sms && await alreadySaved(sms.ref)) {
        markResolved(messageId);
        addMessage('assistant', tIn(msg.replyLang)('chat.smsAlreadySaved'));
        return;
      }
      const say = tIn(msg.replyLang);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'deposits')), {
        uid: user.uid,
        accountId: account.id,
        accountName: accountDisplayName(account),
        amount: income.amount,
        date: income.date || new Date().toISOString(),
        title: income.title,
        source: sms ? 'sms' : 'chat',
        ...(sms && { smsRef: sms.ref }),
      });
      if (syncTo !== undefined) setBalance(batch, account, syncTo, 'smsBalance');
      else changeBalance(batch, account, income.amount, 'moneyIn', income.title);
      await saved(batch.commit());
      markResolved(messageId, true);
      addMessage('assistant', say('chat.incomeSaved', { amount: `${currencySymbol}${income.amount.toLocaleString()}`, account: accountDisplayName(account) }) +
        (syncTo !== undefined ? ' ' + say('chat.balanceMatched', { balance: `${currencySymbol}${syncTo.toLocaleString()}` }) : ''));
    } catch (error) {
      console.error('Error saving money in:', error);
      addMessage('assistant', tIn(msg.replyLang)('chat.saveFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const confirmExpense = async (messageId: string, expense: Partial<Expense>) => {
    if (!user || isConfirming || messages.find(m => m.id === messageId)?.resolved) return;
    const accountId = accountChoices[messageId] || expense.accountId || CASH_ID;
    const amount = expense.amount || 0;
    const sms = messages.find(m => m.id === messageId)?.sms;
    const say = tIn(messages.find(m => m.id === messageId)?.replyLang);
    const syncTo = sms?.balance !== undefined && syncChoices[messageId] && accounts.some(a => a.id === accountId) ? sms.balance : undefined;

    if (sms && await alreadySaved(sms.ref)) {
      markResolved(messageId);
      addMessage('assistant', say('chat.smsAlreadySaved'));
      return;
    }

    const short = syncTo === undefined ? shortAccount(accounts, accountId, amount) : null;
    if (short && !(await confirmDialog(
      t('add.lowBalance', { account: accountDisplayName(short), balance: `${currencySymbol}${short.balance.toLocaleString()}` })
    ))) return;
    const payment = paymentFields(accountId, accounts);

    setIsConfirming(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'expenses')), {
        uid: user.uid,
        title: expense.title,
        amount,
        category: expense.category,
        date: expense.date || new Date().toISOString(),
        notes: expense.notes || '',
        // The SMS fee, kept on its own so Reports can add fees up (it's already in the amount)
        ...(typeof expense.fee === 'number' && expense.fee > 0 && { fee: expense.fee }),
        ...payment,
        ...(sms && { smsRef: sms.ref }),
        createdAt: new Date().toISOString(),
      });
      const syncAccount = syncTo !== undefined ? accounts.find(a => a.id === accountId) : undefined;
      if (syncAccount && syncTo !== undefined) setBalance(batch, syncAccount, syncTo, 'smsBalance');
      else adjustBalance(batch, accounts, accountId, -amount, 'expense', expense.title);
      await saved(batch.commit());
      markResolved(messageId, true);
      addMessage('assistant', payment.accountName
        ? say('chat.expenseSavedFrom', { title: expense.title || '', amount: `${currencySymbol}${amount}`, account: payment.accountId === CASH_ID ? say('accounts.cash') : payment.accountName })
        : say('chat.expenseSaved', { title: expense.title || '', amount: `${currencySymbol}${amount}` }));
    } catch (error) {
      addMessage('assistant', say('chat.expenseSaveFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  return { isConfirming, accountChoices, setAccountChoices, syncChoices, setSyncChoices, confirmIncome, confirmExpense };
}
