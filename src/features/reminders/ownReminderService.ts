import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { MAX_REMINDER_TEXT, OwnReminder, OwnRepeat } from './reminders';

/** The signed-in user's own reminders, oldest first, kept live */
export function useOwnReminders(uid?: string) {
  const [reminders, setReminders] = useState<OwnReminder[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'reminders'), where('uid', '==', uid));
    return onSnapshot(q, snapshot => setReminders(
      snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OwnReminder)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ));
  }, [uid]);
  return reminders;
}

/** The words as they're saved: codes refused (null), account and phone numbers hidden, one short line */
export function cleanReminderText(text: string): string | null {
  if (containsSecret(text)) return null;
  return maskSensitive(text.trim().replace(/\s+/g, ' ')).slice(0, MAX_REMINDER_TEXT);
}

export function addOwnReminder(uid: string, text: string, at: Date, repeat: OwnRepeat) {
  return saved(addDoc(collection(db, 'reminders'), { uid, text, at: at.toISOString(), repeat, createdAt: new Date().toISOString() }));
}

export function deleteOwnReminder(id: string) {
  return saved(deleteDoc(doc(db, 'reminders', id)));
}
