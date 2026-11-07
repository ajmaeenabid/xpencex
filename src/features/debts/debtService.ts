import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, writeBatch, WriteBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account } from '../../shared/types';
import { accountDisplayName, CASH_ID, CASH_NAME } from '../accounts/accounts';
import { changeBalance } from '../accounts/accountService';
import { Debt, DebtKind, accountChange, cleanPerson, isMoneyOut } from './debts';

/** The signed-in user's lend and borrow entries, kept live */
export function useDebts(uid?: string) {
  const [debts, setDebts] = useState<Debt[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'debts'), where('uid', '==', uid));
    return onSnapshot(q, snapshot => setDebts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt))));
  }, [uid]);
  return debts;
}

export interface NewDebt {
  uid: string;
  person: string;
  kind: DebtKind;
  amount: number;
  date: string; // ISO
  note?: string;
  account?: Account; // "Take from an account": the money moves through this account
  countAsSpending?: boolean; // also saved as an expense (lending and paying back only)
  smsRef?: string;
  // An SMS that already set the account's balance: the account moved already, so don't move it again
  accountAlreadyMoved?: boolean;
}

// Expense titles are saved in English, like the ones made from SMS
const SPENDING_TITLE: Partial<Record<DebtKind, string>> = { lent: 'Lent to', paidBack: 'Paid back to' };

/** Adds one entry to a batch: the entry, its account movement and its expense, so they save together */
export function writeDebt(batch: WriteBatch, entry: NewDebt): string {
  const person = cleanPerson(entry.person);
  const ref = doc(collection(db, 'debts'));
  const expenseRef = entry.countAsSpending && isMoneyOut(entry.kind) ? doc(collection(db, 'expenses')) : null;
  const account = entry.account;
  const now = new Date().toISOString();

  batch.set(ref, {
    uid: entry.uid,
    person,
    kind: entry.kind,
    amount: entry.amount,
    date: entry.date,
    ...(entry.note?.trim() && { note: entry.note.trim().slice(0, 200) }),
    ...(account && { accountId: account.id, accountName: accountDisplayName(account) }),
    ...(expenseRef && { expenseId: expenseRef.id }),
    ...(entry.smsRef && { smsRef: entry.smsRef }),
    createdAt: now,
  });

  if (account && !entry.accountAlreadyMoved) changeBalance(batch, account, accountChange(entry.kind, entry.amount), entry.kind, person);

  if (expenseRef) {
    batch.set(expenseRef, {
      uid: entry.uid,
      title: `${SPENDING_TITLE[entry.kind]} ${person}`.slice(0, 100),
      amount: entry.amount,
      category: 'Other',
      date: entry.date,
      notes: entry.note?.trim().slice(0, 200) || '',
      // The account already moved with the entry; debtId tells the expense screens not to move it again
      ...(account ? { accountId: account.id, accountName: accountDisplayName(account) } : { accountId: CASH_ID, accountName: CASH_NAME }),
      debtId: ref.id,
      ...(entry.smsRef && { smsRef: entry.smsRef }),
      createdAt: now,
    });
  }
  return ref.id;
}

export function addDebt(entry: NewDebt) {
  const batch = writeBatch(db);
  writeDebt(batch, entry);
  return saved(batch.commit());
}

/** Removes an entry, gives back its account movement, and removes its expense */
export function deleteDebt(debt: Debt, accounts: Account[]) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'debts', debt.id));
  const account = accounts.find(a => a.id === debt.accountId);
  if (account) changeBalance(batch, account, -accountChange(debt.kind, debt.amount), 'debtDeleted', debt.person);
  if (debt.expenseId) batch.delete(doc(db, 'expenses', debt.expenseId));
  return saved(batch.commit());
}
