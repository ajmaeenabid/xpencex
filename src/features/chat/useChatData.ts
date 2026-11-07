import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Expense, UserProfile } from '../../shared/types';
import { DEFAULT_CATEGORIES } from '../../shared/constants';

/** The user's categories, and a short summary of recent spending for the assistant */
export function useChatData(user: User | null, profile: UserProfile | null) {
  const [categories, setCategories] = useState<string[]>([]);
  const [spendingContext, setSpendingContext] = useState('');

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
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lines = snapshot.docs.map(d => {
        const e = d.data() as Expense;
        return `${e.date.slice(0, 10)} | ${e.title} | ${e.category} | ${e.amount}`;
      });
      setSpendingContext(
        `Currency: ${profile?.currency || 'BDT'}. Monthly budget: ${profile?.monthlyBudget ?? 'not set'}.\n` +
        `Last ${lines.length} expenses (date | title | category | amount):\n${lines.join('\n')}`
      );
    });
    return unsubscribe;
  }, [user, profile?.currency, profile?.monthlyBudget]);

  return { categories, spendingContext };
}
