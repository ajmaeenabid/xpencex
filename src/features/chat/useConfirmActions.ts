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
import { writeDebt } from '../debts/debtService';
import { cleanPerson } from '../debts/debts';
import { findWallet, isCashOut } from '../accounts/cash';
import { labelFields } from '../labels/labels';
import { noteCategoryCorrection, useCategoryRules } from '../categoryRules/categoryRuleService';

type AddMessage = (role: 'user' | 'assistant', content: string, type?: ChatMessage['type']) => string;

/** Saving what a confirm card shows: an expense, or money in to an account */
export function useConfirmActions({ user, messages, accounts, categories, currencySymbol, tIn, t, addMessage, markResolved, afterExpenseSaved }: {
  user: User | null;
  messages: ChatMessage[];
  accounts: Account[];
  categories: string[];
  currencySymbol: string;
  tIn: (language?: ReplyLanguage) => TFunction;
  t: TFunction;
  addMessage: AddMessage;
  markResolved: (id: string, saved?: boolean) => void;
  // Runs once a plain expense is saved, e.g. to send the receipt kept from this card
  afterExpenseSaved?: (messageId: string, expenseId: string, write: Promise<unknown>) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  // "Paid from" choice for each confirmation card, by message id
  const [accountChoices, setAccountChoices] = useState<Record<string, string>>({});
  // The category picked on an expense card, by message id
  const [categoryChoices, setCategoryChoices] = useState<Record<string, string>>({});
  const categoryRules = useCategoryRules(user?.uid);
  // "Also match the balance the SMS reported" tick box, by message id
  const [syncChoices, setSyncChoices] = useState<Record<string, boolean>>({});
  // "This is money I lent" / "paid back to me" on SMS cards, by message id
  const [debtChoices, setDebtChoices] = useState<Record<string, DebtChoice>>({});

  // True when this SMS was already saved (as an expense or as money in)
  const alreadySaved = async (ref: string) => {
    if (!user) return false;
    const [spent, received, lent] = await Promise.all([
      getDocs(query(collection(db, 'expenses'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
      getDocs(query(collection(db, 'deposits'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
      getDocs(query(collection(db, 'debts'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
    ]);
    return !spent.empty || !received.empty || !lent.empty;
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
      const gotBack = debtChoices[messageId];
      if (gotBack?.on) {
        const person = cleanPerson(gotBack.person);
        if (!person) return;
        writeDebt(batch, {
          uid: user.uid, person, kind: 'gotBack', amount: income.amount, date: income.date || new Date().toISOString(),
          account, smsRef: sms?.ref, accountAlreadyMoved: syncTo !== undefined,
        });
        if (syncTo !== undefined) setBalance(batch, account, syncTo, 'smsBalance');
        await saved(batch.commit());
        markResolved(messageId, true);
        addMessage('assistant', say('debts.savedGotBack', { name: person, amount: `${currencySymbol}${income.amount.toLocaleString()}` }));
        return;
      }
      batch.set(doc(collection(db, 'deposits')), {
        uid: user.uid,
        accountId: account.id,
        accountName: accountDisplayName(account),
        amount: income.amount,
        date: income.date || new Date().toISOString(),
        title: income.title,
        source: sms ? 'sms' : 'chat',
        ...(sms && { smsRef: sms.ref }),
        ...labelFields(income.labels),
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

  const confirmExpense = async (messageId: string, card: Partial<Expense>) => {
    const expense = { ...card, category: categoryChoices[messageId] || card.category };
    if (!user || isConfirming || messages.find(m => m.id === messageId)?.resolved) return;
    // "Cash" means the Cash wallet once it exists
    const accountId = paymentFields(accountChoices[messageId] || expense.accountId || CASH_ID, accounts).accountId || CASH_ID;
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
      // A Cash Out with a Cash wallet: the money moves into the wallet; only the fee is spending
      const wallet = findWallet(accounts);
      const source = accounts.find(a => a.id === accountId);
      if (wallet && source && source.id !== wallet.id && isCashOut(expense.title || '')) {
        const fee = typeof expense.fee === 'number' && expense.fee > 0 ? expense.fee : 0;
        const moved = Math.round((amount - fee) * 100) / 100;
        const date = expense.date || new Date().toISOString();
        if (syncTo !== undefined) setBalance(batch, source, syncTo, 'smsBalance');
        else changeBalance(batch, source, -moved, 'cashOut', expense.title);
        changeBalance(batch, wallet, moved, 'cashIn', expense.title);
        if (fee > 0) {
          batch.set(doc(collection(db, 'expenses')), {
            uid: user.uid, title: `${expense.title} (fee)`.slice(0, 100), amount: fee, category: expense.category || 'Other',
            date, notes: '', fee, ...payment, ...(sms && { smsRef: sms.ref }), createdAt: new Date().toISOString(),
          });
          if (syncTo === undefined) changeBalance(batch, source, -fee, 'expense', `${expense.title} (fee)`);
        } else if (sms) {
          // Nothing is saved as spending, so record the SMS on the wallet's side for duplicate protection
          batch.set(doc(collection(db, 'deposits')), {
            uid: user.uid, accountId: wallet.id, accountName: accountDisplayName(wallet), amount: moved, date,
            title: expense.title?.slice(0, 100) || 'Cash Out', source: 'sms', smsRef: sms.ref, transfer: true,
          });
        }
        await saved(batch.commit());
        markResolved(messageId, true);
        addMessage('assistant', say('cash.movedToWallet', { amount: `${currencySymbol}${moved.toLocaleString()}` }));
        return;
      }
      const lent = debtChoices[messageId];
      if (lent?.on) {
        const person = cleanPerson(lent.person);
        if (!person) return;
        const fee = typeof expense.fee === 'number' && expense.fee > 0 ? expense.fee : 0;
        const sent = Math.round((amount - fee) * 100) / 100;
        const account = accounts.find(a => a.id === accountId);
        const synced = syncTo !== undefined && !!account;
        const date = expense.date || new Date().toISOString();
        writeDebt(batch, {
          uid: user.uid, person, kind: 'lent', amount: sent, date, account,
          countAsSpending: lent.spending, smsRef: sms?.ref, accountAlreadyMoved: synced,
        });
        // The person owes what was sent; the fee is your own cost, so it stays an expense
        if (fee > 0) {
          batch.set(doc(collection(db, 'expenses')), {
            uid: user.uid, title: `${expense.title} (fee)`.slice(0, 100), amount: fee, category: expense.category || 'Other',
            date, notes: '', fee, ...payment, createdAt: new Date().toISOString(),
          });
          if (!synced) adjustBalance(batch, accounts, accountId, -fee, 'expense', `${expense.title} (fee)`);
        }
        if (synced) setBalance(batch, account!, syncTo!, 'smsBalance');
        await saved(batch.commit());
        markResolved(messageId, true);
        addMessage('assistant', say('debts.savedLent', { name: person, amount: `${currencySymbol}${sent.toLocaleString()}` }));
        return;
      }
      // A category the AI named that doesn't exist yet is added with the expense (the card said so)
      const message = messages.find(m => m.id === messageId);
      if (message?.newCategory && expense.category && !categories.some(c => c.toLowerCase() === expense.category!.toLowerCase())) {
        batch.set(doc(collection(db, 'categories')), { uid: user.uid, name: expense.category, icon: 'Tag', createdAt: new Date().toISOString() });
      }
      const expenseRef = doc(collection(db, 'expenses'));
      batch.set(expenseRef, {
        uid: user.uid,
        title: expense.title,
        amount,
        category: expense.category,
        date: expense.date || new Date().toISOString(),
        notes: expense.notes || '',
        // The SMS fee, kept on its own so Reports can add fees up (it's already in the amount)
        ...(typeof expense.fee === 'number' && expense.fee > 0 && { fee: expense.fee }),
        ...labelFields(expense.labels),
        ...(expense.warrantyUntil && { warrantyUntil: expense.warrantyUntil }),
        ...payment,
        ...(sms && { smsRef: sms.ref }),
        createdAt: new Date().toISOString(),
      });
      const syncAccount = syncTo !== undefined ? accounts.find(a => a.id === accountId) : undefined;
      if (syncAccount && syncTo !== undefined) setBalance(batch, syncAccount, syncTo, 'smsBalance');
      else adjustBalance(batch, accounts, accountId, -amount, 'expense', expense.title);
      const write = batch.commit();
      await saved(write);
      markResolved(messageId, true);
      afterExpenseSaved?.(messageId, expenseRef.id, write);
      // Changing the category on the card counts as a correction; not waited for, so the card finishes now
      if (expense.title && expense.category && expense.category !== card.category) {
        noteCategoryCorrection(user.uid, expense.title, expense.category, categoryRules, t)
          .catch(err => console.error('Could not note the category change:', err));
      }
      addMessage('assistant', payment.accountName
        ? say('chat.expenseSavedFrom', { title: expense.title || '', amount: `${currencySymbol}${amount}`, account: payment.accountId === CASH_ID ? say('accounts.cash') : payment.accountName })
        : say('chat.expenseSaved', { title: expense.title || '', amount: `${currencySymbol}${amount}` }));
    } catch (error) {
      addMessage('assistant', say('chat.expenseSaveFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  return { isConfirming, accountChoices, setAccountChoices, categoryChoices, setCategoryChoices, syncChoices, setSyncChoices, debtChoices, setDebtChoices, confirmIncome, confirmExpense };
}

/** The lend and borrow tick on an SMS card: on, who it was, and whether it also counts as spending */
export interface DebtChoice { on: boolean; person: string; spending: boolean }
