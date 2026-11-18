// Reading and removing warranties. A warranty is a date on its expense (firestore.rules: warrantyUntil).
import { useEffect, useState } from 'react';
import { collection, deleteField, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import type { Expense } from '../../shared/types';

/** Every expense with a warranty. Only those are read, so this stays small however many expenses there are. */
export function useWarranties(uid: string | undefined) {
  const [list, setList] = useState<Expense[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'expenses'), where('uid', '==', uid), orderBy('warrantyUntil', 'asc')),
      snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))),
      err => console.error('Could not load warranties', err),
    );
  }, [uid]);
  return list;
}

/** Takes the warranty off an expense. The expense itself stays. */
export const removeWarranty = (expenseId: string) => saved(updateDoc(doc(db, 'expenses', expenseId), { warrantyUntil: deleteField() }));
