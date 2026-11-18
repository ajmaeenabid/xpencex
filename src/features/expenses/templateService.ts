// Saving favourites (firestore.rules: templates). Every write goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { isRealIncome } from '../income/income';
import type { Deposit, Expense } from '../../shared/types';
import { SUGGEST_DAYS, Template, TemplateKind } from './templates';

export function useTemplates(uid: string | undefined) {
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'templates'), where('uid', '==', uid)),
      snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Template))),
      err => console.error('Could not load favourites', err),
    );
  }, [uid]);
  return templates;
}

/** The recent entries suggestions are made from: the last 60 days, read once when the Add screen opens */
export function useRecentForSuggestions(uid: string | undefined, kind: TemplateKind) {
  const [recent, setRecent] = useState<{ title?: string; amount: number; category?: string; accountId?: string; date: string }[]>([]);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const since = new Date(Date.now() - SUGGEST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // A once-off read with a cap: Firestore's free plan counts every document read
    const q = query(collection(db, kind === 'expense' ? 'expenses' : 'deposits'), where('uid', '==', uid), where('date', '>=', since), orderBy('date', 'desc'), limit(150));
    getDocs(q)
      .then(snap => {
        if (!alive) return;
        const rows = snap.docs.map(d => d.data() as Expense | Deposit);
        setRecent(kind === 'income' ? (rows as Deposit[]).filter(isRealIncome) : rows);
      })
      .catch(err => console.error('Could not read recent entries for suggestions', err));
    return () => { alive = false; };
  }, [uid, kind]);
  return recent;
}

export function addTemplate(uid: string, t: { kind: TemplateKind; title: string; amount: number; category: string; accountId?: string }) {
  // The same checks as every other text the person saves: codes are refused, numbers hidden
  if (containsSecret(t.title)) return Promise.reject(new Error('secret'));
  return saved(addDoc(collection(db, 'templates'), {
    uid, kind: t.kind,
    title: maskSensitive(t.title.trim().replace(/\s+/g, ' ')).slice(0, 100),
    amount: Math.round(t.amount * 100) / 100,
    category: t.category.slice(0, 50),
    ...(t.accountId && { accountId: t.accountId.slice(0, 100) }),
    createdAt: new Date().toISOString(),
  }));
}

export const deleteTemplate = (id: string) => saved(deleteDoc(doc(db, 'templates', id)));
