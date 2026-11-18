import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { moneyMonth } from '../../shared/lib/moneyMonth';
import { db } from '../../shared/firebase';
import type { Expense } from '../../shared/types';

// How much spending history each screen reads. Firestore's free plan counts every expense read, so screens read
// only what they show (chosen 2026-11-11): Transactions the last 3 months (more with "Show older"), Reports the
// last 12 months. Exports read everything, only when tapped.

export const TRANSACTIONS_MONTHS = 3; // shown at first, and added by each "Show older"
export const REPORTS_MONTHS = 12;

/** The first moment of the window that covers this money month and the `months - 1` before it, as stored in expenses */
export const windowStart = (months: number, now = new Date(), startDay = 1) => moneyMonth(now, startDay, -(months - 1)).start.toISOString();

/** Every expense, newest first. For exports, which must be complete. */
export async function fetchAllExpenses(uid: string): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, 'expenses'), where('uid', '==', uid), orderBy('date', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
}

/** The date of the oldest expense (one read), so a screen knows whether older ones exist beyond its window */
export async function oldestExpenseDate(uid: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, 'expenses'), where('uid', '==', uid), orderBy('date', 'asc'), limit(1)));
  return snap.empty ? null : (snap.docs[0].data().date as string);
}
