import { deleteField, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account, Expense } from '../../shared/types';
import { adjustBalance } from '../accounts/accountService';

/** What chat may change on an expense. The account stays the same; change that on the Expenses screen. */
export interface ExpenseChanges {
  title?: string;
  amount?: number;
  category?: string;
  date?: string; // ISO
  labels?: string[]; // the full new list; empty removes them
}

/**
 * Deletes an expense and puts its money back into the account it was paid from.
 * A lend and borrow expense only loses the spending: its account movement belongs to that entry.
 */
export function deleteExpense(expense: Expense, accounts: Account[]) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'expenses', expense.id));
  if (!expense.debtId) adjustBalance(batch, accounts, expense.accountId, expense.amount, 'expenseDelete', expense.title);
  return saved(batch.commit());
}

/** Changes an expense's title, amount, category or date, and moves its account by the difference */
export function editExpense(expense: Expense, changes: ExpenseChanges, accounts: Account[]) {
  const batch = writeBatch(db);
  const amount = changes.amount ?? expense.amount;
  const title = changes.title ?? expense.title;
  batch.update(doc(db, 'expenses', expense.id), {
    ...(changes.title !== undefined && { title }),
    ...(changes.amount !== undefined && { amount }),
    ...(changes.category !== undefined && { category: changes.category }),
    ...(changes.date !== undefined && { date: changes.date }),
    ...(changes.labels !== undefined && { labels: changes.labels.length ? changes.labels : deleteField() }),
  });
  if (!expense.debtId && amount !== expense.amount) {
    adjustBalance(batch, accounts, expense.accountId, expense.amount - amount, 'expenseEdit', title);
  }
  return saved(batch.commit());
}
