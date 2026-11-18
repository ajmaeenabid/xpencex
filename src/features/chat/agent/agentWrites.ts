// The saves behind the budget, category and repeating expense cards. Each one matches what the
// Expenses side panel or Add expense screen saves, so both ways give the same result.
import { addDoc, collection, deleteDoc, deleteField, doc, FieldPath, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { saved } from '../../../shared/lib/offlineSave';
import { Account, RecurringFrequency } from '../../../shared/types';
import { CASH_ID } from '../../accounts/accounts';
import { adjustBalance, paymentFields } from '../../accounts/accountService';
import { advanceDate } from '../../expenses/recurring';
import { ReminderSettings } from '../../reminders/reminders';

/** The monthly budget, or one category's budget (FieldPath, because names may hold spaces or dots) */
export function setBudget(uid: string, amount: number, category?: string) {
  const user = doc(db, 'users', uid);
  return saved(category ? updateDoc(user, new FieldPath('categoryBudgets', category), amount) : updateDoc(user, { monthlyBudget: amount }));
}

/** Currency and reminder settings from a settings card, in one write (the same fields Profile saves) */
export function saveSettings(uid: string, fields: { currency?: string; reminders?: ReminderSettings; monthStart?: number }) {
  return saved(updateDoc(doc(db, 'users', uid), fields));
}

export function removeCategoryBudget(uid: string, category: string) {
  return saved(updateDoc(doc(db, 'users', uid), new FieldPath('categoryBudgets', category), deleteField()));
}

export function addCategory(uid: string, name: string) {
  return saved(addDoc(collection(db, 'categories'), { uid, name, icon: 'Tag', createdAt: new Date().toISOString() }));
}

/** Today's expense and its repeat rule, saved together, as Add expense does with Repeat on */
export function addRecurring(
  uid: string,
  rule: { title: string; amount: number; category: string; frequency: RecurringFrequency; accountId?: string },
  accounts: Account[],
) {
  const payment = paymentFields(rule.accountId || CASH_ID, accounts);
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const ruleRef = doc(collection(db, 'recurring'));
  batch.set(ruleRef, {
    uid, title: rule.title, amount: rule.amount, category: rule.category, notes: '',
    frequency: rule.frequency, nextDate: advanceDate(now, rule.frequency), ...payment, createdAt: now,
  });
  batch.set(doc(collection(db, 'expenses')), {
    uid, title: rule.title, amount: rule.amount, category: rule.category, date: now, notes: '',
    recurringId: ruleRef.id, ...payment, createdAt: now,
  });
  adjustBalance(batch, accounts, payment.accountId, -rule.amount, 'expense', rule.title);
  return saved(batch.commit());
}

/** Stops a repeating expense. The expenses it already made stay. */
export function stopRecurring(id: string) {
  return saved(deleteDoc(doc(db, 'recurring', id)));
}
