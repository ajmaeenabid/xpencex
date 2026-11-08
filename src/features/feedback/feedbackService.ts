import { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Feedback } from './feedback';

// Comments are written to Firestore, which keeps them on the phone first. Offline, they wait there and
// go to the server by themselves when the internet is back; `pending` says which ones are still waiting.

export type MyFeedback = Feedback & { pending: boolean };

export function useMyFeedback(uid: string) {
  const [items, setItems] = useState<MyFeedback[]>([]);
  useEffect(() => onSnapshot(
    // Sorted here rather than in the query, so no extra database index is needed (a person has few)
    query(collection(db, 'feedback'), where('uid', '==', uid)),
    // Metadata changes too, so "Waiting for internet" turns into "Sent" the moment it arrives
    { includeMetadataChanges: true },
    snap => setItems(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<Feedback, 'id'>), pending: d.metadata.hasPendingWrites }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)),
    err => console.error('Could not load your comments:', err),
  ), [uid]);
  return items;
}

/** Saves a checked comment. Resolves 'onPhone' when it is waiting for the internet. */
export const sendFeedback = (uid: string, text: string) =>
  saved(addDoc(collection(db, 'feedback'), { uid, text, createdAt: new Date().toISOString() }));
