import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Deposit, Expense, RecurringExpense, UserProfile } from '../../shared/types';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { isRealIncome } from '../income/income';
import { expenseLines } from './agent/actions';

/**
 * The user's categories, a short summary of recent spending for the assistant, and the entries behind it.
 * Each expense line has a code (E1, E2...) so the assistant can point at one to edit or delete (agent/actions.ts).
 */
export function useChatData(user: User | null, profile: UserProfile | null) {
  const [categories, setCategories] = useState<string[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [recentIncome, setRecentIncome] = useState<Deposit[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customCats = snapshot.docs.map(doc => doc.data().name);
      setCategories([...DEFAULT_CATEGORIES.map(c => c.name), ...customCats]);
    });
    return unsubscribe;
  }, [user]);

  // Give the assistant a compact view of recent spending so "show my weekly report" style questions work
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'expenses'), where('uid', '==', user.uid), orderBy('date', 'desc'), limit(100));
    return onSnapshot(q, (snapshot) => setRecentExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense))));
  }, [user]);

  // The last 30 incomes (not loan money or moves between accounts), so "delete yesterday's salary" works
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'deposits'), where('uid', '==', user.uid), orderBy('date', 'desc'), limit(60));
    return onSnapshot(q, (snapshot) => setRecentIncome(
      snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)).filter(isRealIncome).slice(0, 30),
    ));
  }, [user]);

  // Repeating expenses, so "stop my Netflix" can find the right one (R1, R2...)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recurring'), where('uid', '==', user.uid));
    return onSnapshot(q, (snapshot) => setRecurring(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecurringExpense))));
  }, [user]);

  const spendingContext =
    `Currency: ${profile?.currency || 'BDT'}. Monthly budget: ${profile?.monthlyBudget ?? 'not set'}.\n` +
    `Last ${recentExpenses.length} expenses (code | date | title | category | amount | labels, if any):\n${expenseLines(recentExpenses).join('\n')}`;

  return { categories, spendingContext, recentExpenses, recentIncome, recurring };
}
