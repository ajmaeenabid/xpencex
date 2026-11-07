import { useEffect, useState } from 'react';
import { collection, doc, DocumentData, DocumentReference, getDocs, increment, onSnapshot, query, runTransaction, where, WriteBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Account } from '../../shared/types';
import { accountDisplayName, CASH_ID, CASH_NAME, dueDeposits } from './accounts';
import { BalancePlan, BalanceReason, planChange, planSet } from '../../../ai-server/src/balanceLines';

/** The signed-in user's bank and mobile banking accounts, oldest first, kept live */
export function useAccounts(uid?: string) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'accounts'), where('uid', '==', uid));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Account));
      setAccounts(list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
    });
  }, [uid]);
  return accounts;
}

/** Fields stored on an expense for the chosen payment method */
export function paymentFields(accountId: string | undefined, accounts: Account[]) {
  if (accountId === CASH_ID) {
    const wallet = accounts.find(a => a.type === 'cash');
    return wallet ? { accountId: wallet.id, accountName: CASH_NAME } : { accountId: CASH_ID, accountName: CASH_NAME };
  }
  const account = accounts.find(a => a.id === accountId);
  return account ? { accountId: account.id, accountName: accountDisplayName(account) } : {};
}

/** A batch or a transaction: every balance write goes into the caller's, so it saves together with its cause */
type Writer = {
  set(ref: DocumentReference, data: DocumentData): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
};
type BalanceAccount = Pick<Account, 'id' | 'uid' | 'balance' | 'historySum'>;

/** The account's new numbers, and its history lines */
function writePlan(w: Writer, account: BalanceAccount, balance: { add: number } | { set: number }, plan: BalancePlan) {
  w.update(doc(db, 'accounts', account.id), {
    balance: 'set' in balance ? balance.set : increment(balance.add),
    historySum: 'set' in plan.historySum ? plan.historySum.set : increment(plan.historySum.add),
  });
  for (const line of plan.lines) {
    w.set(doc(collection(db, 'balanceHistory')), { uid: account.uid, accountId: account.id, ...line });
  }
}

/** Adds `delta` to the balance (negative takes money out), with a history line */
export function changeBalance(w: Writer, account: BalanceAccount, delta: number, reason: BalanceReason, title?: string) {
  if (delta === 0) return;
  writePlan(w, account, { add: delta }, planChange(account, delta, reason, title));
}

/** Sets the balance to a new value, with a history line that keeps the old one */
export function setBalance(w: Writer, account: BalanceAccount, value: number, reason: BalanceReason) {
  writePlan(w, account, { set: value }, planSet(account, value, reason));
}

/**
 * Adds a balance change to a batch. Cash and deleted accounts are skipped, because updating
 * a missing document would make the whole batch fail.
 */
export function adjustBalance(batch: WriteBatch, accounts: Account[], accountId: string | undefined, delta: number, reason: BalanceReason, title?: string) {
  if (!accountId || accountId === CASH_ID || delta === 0) return;
  const account = accounts.find(a => a.id === accountId);
  if (account) changeBalance(batch, account, delta, reason, title);
}

/** Starts the history of an account made before balance history existed, with its current balance */
export async function startHistory(accountId: string) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'accounts', accountId);
    const fresh = await tx.get(ref);
    if (!fresh.exists()) return;
    const account = { id: fresh.id, ...fresh.data() } as Account;
    if (typeof account.historySum === 'number') return;
    tx.update(ref, { historySum: account.balance });
    tx.set(doc(collection(db, 'balanceHistory')), {
      uid: account.uid, accountId: account.id, kind: 'set', amount: account.balance, reason: 'start', at: new Date().toISOString(),
    });
  });
}

/**
 * The account, if paying `amount` from it would take it below zero.
 * `refund` is money already taken from it for this same expense (when editing).
 */
export function shortAccount(accounts: Account[], accountId: string | undefined, amount: number, refund = 0) {
  const account = accounts.find(a => a.id === accountId);
  return account && account.balance + refund < amount ? account : null;
}

/**
 * Adds every monthly deposit that has come due since the last visit.
 * Each account is processed in a transaction that re-reads its next date, so two open tabs can't add the same deposit twice.
 */
export async function processDueDeposits(uid: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'accounts'), where('uid', '==', uid)));
  let added = 0;

  for (const accountDoc of snapshot.docs) {
    const initial = accountDoc.data() as Account;
    if (!initial.deposit || !initial.nextDepositDate || new Date(initial.nextDepositDate).getTime() > Date.now()) continue;

    try {
      added += await runTransaction(db, async (tx) => {
        const fresh = await tx.get(accountDoc.ref);
        if (!fresh.exists()) return 0;
        const account = { id: fresh.id, ...fresh.data() } as Account;
        if (!account.deposit || !account.nextDepositDate) return 0;

        const { due, next } = dueDeposits(account.nextDepositDate, account.deposit.day);
        if (!due.length) return 0;
        for (const date of due) {
          tx.set(doc(collection(db, 'deposits')), {
            uid,
            accountId: account.id,
            accountName: accountDisplayName(account),
            amount: account.deposit.amount,
            date,
          });
        }
        tx.update(accountDoc.ref, { nextDepositDate: next });
        changeBalance(tx, account, account.deposit.amount * due.length, 'monthlyDeposit');
        return due.length;
      });
    } catch (err) {
      console.error('Error processing monthly deposit:', err);
    }
  }
  return added;
}
