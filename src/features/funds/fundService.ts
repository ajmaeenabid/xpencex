import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Fund } from './funds';

// Festival fund changes. Every save goes through saved(), so the screen never waits forever offline.

export function useFunds(uid: string) {
  const [funds, setFunds] = useState<Fund[]>([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'funds'), where('uid', '==', uid)),
    snap => setFunds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Fund))),
  ), [uid]);
  return funds;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const createFund = (uid: string, name: string, target: number, dateValue: string) =>
  saved(addDoc(collection(db, 'funds'), {
    uid,
    name: name.trim().slice(0, 60),
    target: round2(target),
    dueDate: new Date(`${dateValue}T12:00:00`).toISOString(),
    saved: 0,
    createdAt: new Date().toISOString(),
  }));

export const addToFund = (fund: Fund, amount: number) =>
  saved(updateDoc(doc(db, 'funds', fund.id), { saved: increment(round2(amount)) }));

export const deleteFund = (fund: Fund) => saved(deleteDoc(doc(db, 'funds', fund.id)));
