import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import type { Account } from '../../shared/types';
import { changeBalance } from '../accounts/accountService';
import { Fund } from './funds';

// Savings goal changes. Every save goes through saved(), so the screen never waits forever offline.

export function useFunds(uid: string) {
  const [funds, setFunds] = useState<Fund[]>([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'funds'), where('uid', '==', uid)),
    snap => setFunds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Fund))),
  ), [uid]);
  return funds;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `dateValue` is 'yyyy-MM-dd', or null for a goal with no end date */
export const createFund = (uid: string, name: string, target: number, dateValue: string | null) =>
  saved(addDoc(collection(db, 'funds'), {
    uid,
    name: name.trim().slice(0, 60),
    target: round2(target),
    ...(dateValue && { dueDate: new Date(`${dateValue}T12:00:00`).toISOString() }),
    saved: 0,
    createdAt: new Date().toISOString(),
  }));

/** Puts money into a goal: only set aside, or moved out of an account (its balance goes down) */
export function addToFund(fund: Fund, amount: number, account: Account | null = null) {
  const value = round2(amount);
  const batch = writeBatch(db);
  batch.update(doc(db, 'funds', fund.id), {
    saved: increment(value),
    ...(account && { [`fromAccounts.${account.id}`]: increment(value) }),
  });
  if (account) changeBalance(batch, account, -value, 'goalIn', fund.name);
  return saved(batch.commit());
}

/** Takes money out of a goal: only un-set-aside, or put back into an account (its balance goes up) */
export function takeFromFund(fund: Fund, amount: number, account: Account | null = null) {
  const value = round2(Math.min(amount, fund.saved));
  const batch = writeBatch(db);
  const fromThere = account ? Math.min(value, fund.fromAccounts?.[account.id] || 0) : 0;
  batch.update(doc(db, 'funds', fund.id), {
    saved: increment(-value),
    ...(account && fromThere > 0 && { [`fromAccounts.${account.id}`]: increment(-fromThere) }),
  });
  if (account) changeBalance(batch, account, value, 'goalOut', fund.name);
  return saved(batch.commit());
}

export const deleteFund = (fund: Fund) => saved(deleteDoc(doc(db, 'funds', fund.id)));
