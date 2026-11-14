import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import type { Expense, Receipt } from '../../shared/types';

/** This person's receipt records, kept up to date. Null while loading. */
export function useReceipts(uid: string | undefined, enabled = true): Receipt[] | null {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  useEffect(() => {
    if (!uid || !enabled) return;
    // Sorted on the phone: there are at most 100, and it needs no extra Firestore index
    return onSnapshot(
      query(collection(db, 'receipts'), where('uid', '==', uid)),
      snap => setReceipts(snap.docs.map(d => ({ ...(d.data() as Receipt), id: d.id }))),
      err => { console.error('Could not load receipts', err); setReceipts([]); },
    );
  }, [uid, enabled]);
  return receipts;
}

/**
 * The expenses the receipts belong to, for their name, amount and date. Expenses the screen already has
 * (`known`, e.g. Transactions' last 3 months) are used as they are; only the others are read, once each.
 * A deleted expense comes back as null.
 */
export function useReceiptExpenses(receipts: Receipt[] | null, known?: Expense[]) {
  const [fetched, setFetched] = useState<Record<string, Expense | null>>({});
  const knownById = useMemo(() => new Map((known || []).map(e => [e.id, e])), [known]);

  const wanted = useMemo(
    () => Array.from(new Set((receipts || []).flatMap(r => (r.expenseId ? [r.expenseId] : [])))),
    [receipts],
  );

  useEffect(() => {
    // Expenses the screen already has are used as they are; only the others are read
    const missing = wanted.filter(id => !knownById.has(id) && !(id in fetched));
    if (missing.length === 0) return;
    let stopped = false;
    Promise.all(missing.map(async id => {
      try {
        const snap = await getDoc(doc(db, 'expenses', id));
        return [id, snap.exists() ? ({ ...(snap.data() as Expense), id }) : null] as const;
      } catch {
        return [id, null] as const; // can't be read (deleted, or not this person's)
      }
    })).then(rows => {
      if (!stopped) setFetched(prev => ({ ...prev, ...Object.fromEntries(rows) }));
    });
    return () => { stopped = true; };
  }, [wanted, knownById]);

  /** The expense, null when it was deleted, undefined while it loads */
  const expenseOf = (id: string | undefined): Expense | null | undefined => {
    if (!id) return null;
    const mine = knownById.get(id);
    if (mine) return mine;
    return id in fetched ? fetched[id] : undefined;
  };
  return expenseOf;
}
