import { useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import type { Account, Deposit } from '../../shared/types';
import { accountDisplayName } from '../accounts/accounts';
import { changeBalance } from '../accounts/accountService';
import { dueDeposits } from '../accounts/accounts';
import { isRealIncome } from './income';
import { labelFields } from '../labels/labels';

// Saving income (src/features/income/income.ts has the rules). Income lives in `deposits`, like all money in.
// With an account: its balance goes up, and the income shows in that account's window.
// Without one: it is only recorded. "Repeat monthly" makes an incomeRules/{id} rule that the app adds each month.

export interface IncomeRule {
  id: string;
  uid: string;
  title: string;
  amount: number;
  category: string;
  notes?: string;
  day: number; // day of the month it comes
  nextDate: string; // ISO
  accountId?: string;
  accountName?: string;
  createdAt: string;
}

export interface IncomeInput {
  title: string;
  amount: number;
  category: string;
  date: string; // ISO
  notes: string;
  accountId: string | null; // null: no account
  repeat: boolean;
  labels?: string[]; // left out: an edit keeps the labels it has
}

/** Money in since `since` (ISO), newest first. Includes non-income money in; filter with isRealIncome. */
export function useMoneyIn(uid: string | undefined, since: string | null) {
  const [list, setList] = useState<Deposit[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = since
      ? query(collection(db, 'deposits'), where('uid', '==', uid), where('date', '>=', since), orderBy('date', 'desc'))
      : query(collection(db, 'deposits'), where('uid', '==', uid), orderBy('date', 'desc'));
    return onSnapshot(q, snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Deposit))),
      err => console.error('Could not load money in', err));
  }, [uid, since]);
  return list;
}

/** Only the real income (no loans, no transfers) since `since` */
export function useIncome(uid: string | undefined, since: string | null) {
  return useMoneyIn(uid, since).filter(isRealIncome);
}

export function useIncomeRules(uid: string | undefined) {
  const [rules, setRules] = useState<IncomeRule[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'incomeRules'), where('uid', '==', uid)),
      snap => setRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as IncomeRule))),
      err => console.error('Could not load repeating income', err));
  }, [uid]);
  return rules;
}

/** The person's own income categories (the fixed ones are in INCOME_CATEGORIES) */
export function useIncomeCategories(uid: string | undefined) {
  const [names, setNames] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'incomeCategories'), where('uid', '==', uid)),
      snap => setNames(snap.docs.map(d => ({ id: d.id, name: String(d.data().name) }))),
      err => console.error('Could not load income categories', err));
  }, [uid]);
  return names;
}

export async function addIncomeCategory(uid: string, name: string) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'incomeCategories')), { uid, name: name.trim().slice(0, 50) });
  await saved(batch.commit());
}

export async function deleteIncomeCategory(id: string) {
  await saved(deleteDoc(doc(db, 'incomeCategories', id)));
}

const accountFields = (accountId: string | null, accounts: Account[]) => {
  const account = accountId ? accounts.find(a => a.id === accountId) : undefined;
  return account ? { accountId: account.id, accountName: accountDisplayName(account) } : {};
};

/** The next time a monthly income comes, after `fromIso` */
function nextMonthly(fromIso: string, day: number) {
  const from = new Date(fromIso);
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1, 12);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next.toISOString();
}

/** Adds or changes an income. Moves account balances to match, and starts or stops its monthly repeat. */
export async function saveIncome(uid: string, input: IncomeInput, accounts: Account[], existing?: Deposit & { ruleId?: string }) {
  const batch = writeBatch(db);
  const ref = existing ? doc(db, 'deposits', existing.id) : doc(collection(db, 'deposits'));
  const into = accountFields(input.accountId, accounts);
  const title = input.title.trim().slice(0, 100);

  // A monthly repeat: keep, start or stop its rule
  let ruleId = existing?.ruleId;
  if (input.repeat && !ruleId) {
    const rule = doc(collection(db, 'incomeRules'));
    const day = new Date(input.date).getDate();
    batch.set(rule, {
      uid, title, amount: input.amount, category: input.category, notes: input.notes.trim().slice(0, 500),
      day, nextDate: nextMonthly(input.date, day), ...into, createdAt: new Date().toISOString(),
    });
    ruleId = rule.id;
  } else if (!input.repeat && ruleId) {
    batch.delete(doc(db, 'incomeRules', ruleId));
    ruleId = undefined;
  }

  const fields = {
    uid, title, amount: input.amount, category: input.category, date: input.date, notes: input.notes.trim().slice(0, 500),
    source: existing?.source ?? 'manual', ...into, ...(ruleId && { ruleId }),
    ...(existing?.smsRef && { smsRef: existing.smsRef }),
    ...labelFields(input.labels ?? existing?.labels),
  };
  batch.set(ref, fields); // a full write, so a removed account or repeat is removed here too

  // Balances: take the old amount back from the old account, then add the new amount to the new one
  const oldAccount = existing?.accountId ? accounts.find(a => a.id === existing.accountId) : undefined;
  const newAccount = into.accountId ? accounts.find(a => a.id === into.accountId) : undefined;
  if (oldAccount && newAccount && oldAccount.id === newAccount.id) {
    changeBalance(batch, newAccount, input.amount - (existing?.amount || 0), 'incomeEdit', title);
  } else {
    if (oldAccount) changeBalance(batch, oldAccount, -(existing?.amount || 0), 'incomeEdit', title);
    if (newAccount) changeBalance(batch, newAccount, input.amount, existing ? 'incomeEdit' : 'income', title);
  }
  await saved(batch.commit());
}

/** Removes an income, and takes its money back out of its account. Its monthly repeat keeps going unless stopped. */
export async function deleteIncome(income: Deposit, accounts: Account[]) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'deposits', income.id));
  const account = income.accountId ? accounts.find(a => a.id === income.accountId) : undefined;
  if (account) changeBalance(batch, account, -income.amount, 'incomeDelete', income.title);
  await saved(batch.commit());
}

/** Stops a monthly income from repeating. What it already added stays. */
export async function stopIncomeRule(ruleId: string) {
  await saved(deleteDoc(doc(db, 'incomeRules', ruleId)));
}

/**
 * Adds every monthly income that has come due since the last visit (runs when the app opens, like recurring
 * expenses). Each rule is handled in a transaction that re-reads its date, so it is never added twice.
 */
export async function processDueIncome(uid: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'incomeRules'), where('uid', '==', uid)));
  let added = 0;
  for (const ruleDoc of snapshot.docs) {
    const initial = ruleDoc.data() as IncomeRule;
    if (new Date(initial.nextDate).getTime() > Date.now()) continue;
    try {
      added += await runTransaction(db, async (tx) => {
        const fresh = await tx.get(ruleDoc.ref);
        if (!fresh.exists()) return 0;
        const rule = fresh.data() as IncomeRule;
        const { due, next } = dueDeposits(rule.nextDate, rule.day);
        if (!due.length) return 0;
        const accountRef = rule.accountId ? doc(db, 'accounts', rule.accountId) : null;
        const accountSnap = accountRef ? await tx.get(accountRef) : null;
        const account = accountSnap?.exists() ? ({ id: accountSnap.id, ...accountSnap.data() } as Account) : null;
        for (const date of due) {
          tx.set(doc(collection(db, 'deposits')), {
            uid, title: rule.title, amount: rule.amount, category: rule.category, date, notes: rule.notes || '',
            source: 'manual', ruleId: ruleDoc.id,
            ...(account && { accountId: account.id, accountName: accountDisplayName(account) }),
          });
        }
        tx.update(ruleDoc.ref, { nextDate: next });
        if (account) changeBalance(tx, account, rule.amount * due.length, 'income', rule.title);
        return due.length;
      });
    } catch (err) {
      console.error('Error adding monthly income:', err);
    }
  }
  return added;
}
