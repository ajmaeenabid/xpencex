// Reading and changing labels. Every save goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { DocumentReference, collection, deleteField, getDocs, limit, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { changedLabels, recentLabels } from './labels';

const BATCH = 400;

/** The labels to offer on the Add screen, read once from the latest entries (Firestore counts every read) */
export function useRecentLabels(uid: string | undefined) {
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const latest = (name: 'expenses' | 'deposits', count: number) =>
      getDocs(query(collection(db, name), where('uid', '==', uid), orderBy('date', 'desc'), limit(count)));
    Promise.all([latest('expenses', 100), latest('deposits', 50)])
      .then(([spent, received]) => {
        if (!alive) return;
        setLabels(recentLabels([...spent.docs, ...received.docs].map(d => d.data() as { labels?: string[]; date: string })));
      })
      .catch(err => console.error('Could not read recent labels', err));
    return () => { alive = false; };
  }, [uid]);
  return labels;
}

/** Renames a label on every entry that has it, or removes it when `to` is null. Amounts and balances don't change. */
export async function changeLabelEverywhere(uid: string, spellings: string[], to: string | null) {
  const found = new Map<string, { ref: DocumentReference; labels: string[] }>();
  for (const name of ['expenses', 'deposits']) {
    for (const spelling of spellings) {
      const snap = await getDocs(query(collection(db, name), where('uid', '==', uid), where('labels', 'array-contains', spelling)));
      snap.docs.forEach(d => found.set(d.ref.path, { ref: d.ref, labels: d.data().labels as string[] }));
    }
  }
  const entries = [...found.values()];
  const commits: Promise<void>[] = [];
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const { ref, labels } of entries.slice(i, i + BATCH)) {
      const next = changedLabels(labels, spellings, to);
      batch.update(ref, { labels: next.length ? next : deleteField() });
    }
    commits.push(batch.commit());
  }
  await saved(Promise.all(commits));
}
