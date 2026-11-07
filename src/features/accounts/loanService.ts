import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { callWorker } from '../../shared/lib/workerApi';
import { Account, Loan } from '../../shared/types';
import { firstInstallmentDate } from '../../../ai-server/src/loanDates';
import { accountDisplayName } from './accounts';
import { saved } from '../../shared/lib/offlineSave';
import { changeBalance } from './accountService';

/** The signed-in user's loans, kept live */
export function useLoans(uid?: string) {
  const [loans, setLoans] = useState<Loan[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'loans'), where('uid', '==', uid));
    return onSnapshot(
      q,
      snapshot => setLoans(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Loan))),
      err => console.error('Error loading loans:', err),
    );
  }, [uid]);
  return loans;
}

interface NewLoan {
  account: Account;
  name: string;
  lender: string;
  total: number;
  installment: number;
  day: number;
  receiveInto?: Account; // when set, the money received is added to this account now
  received?: number; // the amount borrowed, when the total includes interest. Otherwise the total.
}

/** Saves a loan, and optionally the money received from it, in one go */
export async function createLoan(uid: string, loan: NewLoan) {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const received = loan.received ?? loan.total;
  batch.set(doc(collection(db, 'loans')), {
    uid,
    accountId: loan.account.id,
    accountName: accountDisplayName(loan.account),
    name: loan.name,
    ...(loan.lender && { lender: loan.lender }),
    total: loan.total,
    remaining: loan.total,
    installment: loan.installment,
    day: loan.day,
    nextDueDate: firstInstallmentDate(loan.day),
    status: 'active',
    paidCount: 0,
    createdAt: now,
  });
  if (loan.receiveInto) {
    batch.set(doc(collection(db, 'deposits')), {
      uid,
      accountId: loan.receiveInto.id,
      accountName: accountDisplayName(loan.receiveInto),
      amount: received,
      date: now,
      title: `Loan: ${loan.name}`.slice(0, 100),
      source: 'loan',
    });
    changeBalance(batch, loan.receiveInto, received, 'loanReceived', loan.name);
  }
  await saved(batch.commit());
}

/** Edits name, lender, installment and day; the total only while nothing has been paid yet */
export function updateLoan(loan: Loan, changes: { name: string; lender: string; installment: number; day: number; total?: number }) {
  return saved(updateDoc(doc(db, 'loans', loan.id), {
    name: changes.name,
    lender: changes.lender,
    installment: changes.installment,
    day: changes.day,
    ...(changes.day !== loan.day && { nextDueDate: firstInstallmentDate(changes.day) }),
    ...(changes.total !== undefined && loan.paidCount === 0 && { total: changes.total, remaining: changes.total }),
  }));
}

/** Deletes an account together with its loans and balance history, so the server never tries to charge a missing account */
export async function deleteAccountWithLoans(accountId: string, loans: Loan[], uid: string) {
  // History first, in batches of up to 450 (a batch takes at most 500 writes)
  const history = await getDocs(query(collection(db, 'balanceHistory'), where('uid', '==', uid), where('accountId', '==', accountId)));
  for (let i = 0; i < history.docs.length; i += 450) {
    const chunk = writeBatch(db);
    history.docs.slice(i, i + 450).forEach(d => chunk.delete(d.ref));
    await saved(chunk.commit());
  }
  const batch = writeBatch(db);
  for (const loan of loans.filter(l => l.accountId === accountId)) batch.delete(doc(db, 'loans', loan.id));
  batch.delete(doc(db, 'accounts', accountId));
  await saved(batch.commit());
}

/** Asks the server to take this user's installments that have come due (it also does so every hour) */
export const processDueLoansNow = () => callWorker<{ taken: number }>('/loans/process').then(r => r.taken);
