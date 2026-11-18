// Saving shopping lists (firestore.rules: shoppingLists). Every save goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { maskSensitive } from '../../shared/lib/smsParser';
import type { Account } from '../../shared/types';
import { adjustBalance, paymentFields } from '../accounts/accountService';
import { MAX_LIST_NAME, ShoppingItem, ShoppingList, afterShopping, boughtNote, cleanShoppingText } from './shopping';

export function useShoppingLists(uid: string | undefined) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'shoppingLists'), where('uid', '==', uid)),
      snap => setLists(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ShoppingList))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
      err => console.error('Could not load shopping lists', err),
    );
  }, [uid]);
  return lists;
}

export function createShoppingList(uid: string, name: string, items: ShoppingItem[] = []) {
  const clean = cleanShoppingText(name, MAX_LIST_NAME);
  if (!clean) return Promise.reject(new Error('name'));
  const now = new Date().toISOString();
  return saved(addDoc(collection(db, 'shoppingLists'), { uid, name: clean, items, createdAt: now, updatedAt: now }));
}

export function renameShoppingList(id: string, name: string) {
  const clean = cleanShoppingText(name, MAX_LIST_NAME);
  if (!clean) return Promise.reject(new Error('name'));
  return saved(updateDoc(doc(db, 'shoppingLists', id), { name: clean, updatedAt: new Date().toISOString() }));
}

export const saveShoppingItems = (id: string, items: ShoppingItem[]) =>
  saved(updateDoc(doc(db, 'shoppingLists', id), { items, updatedAt: new Date().toISOString() }));

export const deleteShoppingList = (id: string) => saved(deleteDoc(doc(db, 'shoppingLists', id)));

/** Saves the ticked items as one expense, moves the balance, and takes them off the list, all in one save */
export function finishShopping(
  list: ShoppingList,
  paid: { title: string; amount: number; category: string; day: string; accountId?: string },
  accounts: Account[],
  now = new Date(),
) {
  const batch = writeBatch(db);
  const title = maskSensitive(paid.title.trim().replace(/\s+/g, ' ')).slice(0, 100);
  const amount = Math.round(paid.amount * 100) / 100;
  const payment = paymentFields(paid.accountId, accounts);
  const date = paid.day === format(now, 'yyyy-MM-dd') ? now.toISOString() : new Date(`${paid.day}T12:00:00`).toISOString();
  batch.set(doc(collection(db, 'expenses')), {
    uid: list.uid, title, amount, category: paid.category, date, notes: boughtNote(list.items), ...payment, createdAt: now.toISOString(),
  });
  adjustBalance(batch, accounts, payment.accountId, -amount, 'expense', title);
  batch.update(doc(db, 'shoppingLists', list.id), { items: afterShopping(list.items), updatedAt: now.toISOString() });
  return saved(batch.commit());
}
