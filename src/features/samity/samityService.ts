import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account } from '../../shared/types';
import { changeBalance } from '../accounts/accountService';
import { Samity, payoutAmount } from './samity';

export function useSamities(uid: string) {
  const [list, setList] = useState<Samity[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'samities'), where('uid', '==', uid)), snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Samity)))), [uid]);
  return list;
}

export const createSamity = (s: Omit<Samity, 'id' | 'payments' | 'payout' | 'createdAt'>) =>
  saved(addDoc(collection(db, 'samities'), { ...s, payments: {}, createdAt: new Date().toISOString() }));

/** Pays one round, from the account when one is chosen (its balance history says which samity) */
export function payRound(s: Samity, n: number, account?: Account) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'samities', s.id), { [`payments.${n}`]: account?.id || '' });
  if (account) changeBalance(batch, account, -s.amount, 'samityPaid', `${s.name} · ${n}`);
  return saved(batch.commit());
}

/** Un-ticks a round, giving the money back to the account it came from */
export function undoRound(s: Samity, n: number, accounts: Account[]) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'samities', s.id), { [`payments.${n}`]: deleteField() });
  const account = accounts.find(a => a.id === s.payments[String(n)]);
  if (account) changeBalance(batch, account, s.amount, 'samityUndo', `${s.name} · ${n}`);
  return saved(batch.commit());
}

/** Your turn: the pot is received, into the account when one is chosen */
export function receivePayout(s: Samity, account?: Account) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'samities', s.id), { payout: { at: new Date().toISOString(), accountId: account?.id || '' } });
  if (account) changeBalance(batch, account, payoutAmount(s), 'samityPayout', s.name);
  return saved(batch.commit());
}

export function undoPayout(s: Samity, accounts: Account[]) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'samities', s.id), { payout: deleteField() });
  const account = accounts.find(a => a.id === s.payout?.accountId);
  if (account) changeBalance(batch, account, -payoutAmount(s), 'samityUndo', s.name);
  return saved(batch.commit());
}

/** Removes the record only; money that already moved stays as it is */
export const deleteSamity = (s: Samity) => saved(deleteDoc(doc(db, 'samities', s.id)));
