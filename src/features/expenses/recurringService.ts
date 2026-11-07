import { collection, doc, getDocs, increment, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { RecurringExpense } from '../../shared/types';
import { dueOccurrences } from './recurring';
import { CASH_ID } from '../accounts/accounts';

/**
 * Creates the expense entries for every recurring rule that has come due since the last visit.
 * Each rule is processed in a transaction that re-reads nextDate, so two open tabs can't both post the same occurrence.
 */
export async function processDueRecurring(uid: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'recurring'), where('uid', '==', uid)));
  let created = 0;

  for (const ruleDoc of snapshot.docs) {
    const initial = ruleDoc.data() as RecurringExpense;
    if (new Date(initial.nextDate).getTime() > Date.now()) continue;

    try {
      created += await runTransaction(db, async (tx) => {
        const fresh = await tx.get(ruleDoc.ref);
        if (!fresh.exists()) return 0;
        const rule = fresh.data() as RecurringExpense;
        const { due, next } = dueOccurrences(rule.nextDate, rule.frequency);
        // Reads must come before writes in a transaction; a deleted account just isn't charged
        const accountRef = rule.accountId && rule.accountId !== CASH_ID ? doc(db, 'accounts', rule.accountId) : null;
        const accountExists = accountRef ? (await tx.get(accountRef)).exists() : false;
        for (const date of due) {
          tx.set(doc(collection(db, 'expenses')), {
            uid,
            title: rule.title,
            amount: rule.amount,
            category: rule.category,
            date,
            notes: rule.notes || `Recurring (${rule.frequency})`,
            recurringId: ruleDoc.id,
            ...(rule.accountId && { accountId: rule.accountId, accountName: rule.accountName || '' }),
            createdAt: new Date().toISOString(),
          });
        }
        if (due.length) tx.update(ruleDoc.ref, { nextDate: next });
        if (due.length && accountRef && accountExists) tx.update(accountRef, { balance: increment(-rule.amount * due.length) });
        return due.length;
      });
    } catch (err) {
      console.error('Error processing recurring expense:', err);
    }
  }
  return created;
}
