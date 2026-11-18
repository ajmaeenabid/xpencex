// Saving planned payments (firestore.rules: planned). Every save goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { maskSensitive } from '../../shared/lib/smsParser';
import { containsSecret } from '../../shared/lib/sensitiveData';
import type { Account, RecurringExpense } from '../../shared/types';
import { accountDisplayName } from '../accounts/accounts';
import { adjustBalance, changeBalance, paymentFields } from '../accounts/accountService';
import { Planned, PlannedKind, PlannedRepeat, dateFromDay, nextPlannedDate } from './planned';

export function usePlanned(uid: string | undefined) {
  const [list, setList] = useState<Planned[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'planned'), where('uid', '==', uid)),
      snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Planned))),
      err => console.error('Could not load planned payments', err),
    );
  }, [uid]);
  return list;
}

export function useRecurringRules(uid: string | undefined) {
  const [rules, setRules] = useState<RecurringExpense[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'recurring'), where('uid', '==', uid)),
      snap => setRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringExpense))),
      err => console.error('Could not load repeating expenses', err),
    );
  }, [uid]);
  return rules;
}

/** The person's own expense categories */
export function useOwnCategories(uid: string | undefined) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'categories'), where('uid', '==', uid)),
      snap => setNames(snap.docs.map(d => String(d.data().name))),
      err => console.error('Could not load categories', err),
    );
  }, [uid]);
  return names;
}

export interface PlannedInput {
  kind: PlannedKind;
  title: string;
  amount: number;
  category: string;
  accountId?: string;
  repeat: PlannedRepeat;
  day: string; // yyyy-MM-dd
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const fields = (input: PlannedInput) => ({
  kind: input.kind,
  title: maskSensitive(input.title.trim().replace(/\s+/g, ' ')).slice(0, 100),
  amount: round2(input.amount),
  category: input.category.slice(0, 50),
  repeat: input.repeat,
  date: dateFromDay(input.day),
  day: Number(input.day.slice(8, 10)),
});

export function addPlanned(uid: string, input: PlannedInput) {
  if (containsSecret(input.title)) return Promise.reject(new Error('secret'));
  return saved(addDoc(collection(db, 'planned'), {
    uid,
    ...fields(input),
    ...(input.accountId && { accountId: input.accountId.slice(0, 100) }),
    createdAt: new Date().toISOString(),
  }));
}

export function updatePlanned(id: string, input: PlannedInput) {
  if (containsSecret(input.title)) return Promise.reject(new Error('secret'));
  return saved(updateDoc(doc(db, 'planned', id), {
    ...fields(input),
    accountId: input.accountId ? input.accountId.slice(0, 100) : deleteField(),
  }));
}

export const deletePlanned = (id: string) => saved(deleteDoc(doc(db, 'planned', id)));

/** Moves on to the next date, or removes it when it happens only once */
function moveOn(batch: ReturnType<typeof writeBatch>, plan: Planned) {
  const ref = doc(db, 'planned', plan.id);
  const next = nextPlannedDate(plan);
  if (next) batch.update(ref, { date: next });
  else batch.delete(ref);
}

/** Skips this time without recording any money */
export function skipPlanned(plan: Planned) {
  const batch = writeBatch(db);
  moveOn(batch, plan);
  return saved(batch.commit());
}

/** Records the payment or money received, updates the balance, and moves on, all in one save */
export function markPlannedDone(plan: Planned, paid: { amount: number; day: string; accountId?: string }, accounts: Account[], now = new Date()) {
  const batch = writeBatch(db);
  const amount = round2(paid.amount);
  const date = dateFromDay(paid.day);
  if (plan.kind === 'expense') {
    const payment = paymentFields(paid.accountId, accounts);
    batch.set(doc(collection(db, 'expenses')), {
      uid: plan.uid, title: plan.title, amount, category: plan.category, date, notes: '', plannedId: plan.id,
      ...payment, createdAt: now.toISOString(),
    });
    adjustBalance(batch, accounts, payment.accountId, -amount, 'expense', plan.title);
  } else {
    const account = accounts.find(a => a.id === paid.accountId);
    batch.set(doc(collection(db, 'deposits')), {
      uid: plan.uid, title: plan.title, amount, category: plan.category, date, notes: '', source: 'manual',
      ...(account && { accountId: account.id, accountName: accountDisplayName(account) }),
    });
    if (account) changeBalance(batch, account, amount, 'income', plan.title);
  }
  moveOn(batch, plan);
  return saved(batch.commit());
}
