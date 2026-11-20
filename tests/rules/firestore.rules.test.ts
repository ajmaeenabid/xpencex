// Checks firestore.rules against a local, fake Firestore (the Firebase Emulator). Nothing touches the real database.
// Run with `npm run test:rules` (scripts/test-rules.mjs starts the emulator); GitHub CI runs it on every push.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

const DATE = '2026-11-11T10:00:00.000Z';
const expense = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, title: 'Lunch', amount: 450, category: 'Food', date: DATE, ...extra });

// Signed in with Google AND carrying the pass of a device that is still listed
const alice = () => env.authenticatedContext('alice', { deviceId: 'dev-alice' }).firestore();
const bob = () => env.authenticatedContext('bob', { deviceId: 'dev-bob' }).firestore();
// The admin has an approved device too, but no special rights over anyone's data
const admin = () => env.authenticatedContext('admin-uid', { deviceId: 'dev-admin' }).firestore();
// Google sign-in alone, with no device pass
const aliceNoPass = () => env.authenticatedContext('alice', {}).firestore();
// A pass for a device the admin removed
const aliceRemoved = () => env.authenticatedContext('alice', { deviceId: 'dev-removed' }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-xpences',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // What the AI server would have written, put in with the rules switched off
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'devices/dev-alice'), { id: 'dev-alice', uid: 'alice', label: 'Phone', at: DATE }),
      setDoc(doc(db, 'devices/dev-bob'), { id: 'dev-bob', uid: 'bob', label: 'Phone', at: DATE }),
      setDoc(doc(db, 'devices/dev-admin'), { id: 'dev-admin', uid: 'admin-uid', label: 'Phone', at: DATE }),
      setDoc(doc(db, 'users/alice'), { uid: 'alice', email: 'alice@example.com', username: 'alice', name: 'alice' }),
      setDoc(doc(db, 'expenses/e-alice'), expense('alice')),
      setDoc(doc(db, 'chats/c-alice'), { uid: 'alice', title: 'Chat', messages: [], createdAt: 1, updatedAt: 1 }),
      setDoc(doc(db, 'receipts/r-alice'), { id: 'r-alice', uid: 'alice', type: 'image/jpeg', size: 1000, source: 'add', createdAt: DATE, expenseId: 'e-alice' }),
      setDoc(doc(db, 'deviceHistory/alice'), { uid: 'alice', firstDeviceAt: DATE }),
      setDoc(doc(db, 'googleLinks/alice'), { uid: 'alice', token: 'locked' }),
      setDoc(doc(db, 'usernames/alice'), { uid: 'alice', username: 'alice' }),
      setDoc(doc(db, 'deviceRequests/dev-new'), { id: 'dev-new', uid: 'alice', status: 'pending' }),
      setDoc(doc(db, 'adminLog/l1'), { action: 'deviceApproved', targetUid: 'alice' }),
      setDoc(doc(db, 'notices/n1'), { uid: 'alice', text: 'Hello' }),
    ]);
  });
});

describe('the device pass', () => {
  it('lets the owner read their data from an approved device', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'expenses/e-alice')));
  });

  it('shows nothing to Google sign-in alone, a removed device, or someone signed out', async () => {
    await assertFails(getDoc(doc(aliceNoPass(), 'expenses/e-alice')));
    await assertFails(getDoc(doc(aliceRemoved(), 'expenses/e-alice')));
    await assertFails(getDoc(doc(nobody(), 'expenses/e-alice')));
    await assertFails(setDoc(doc(aliceNoPass(), 'expenses/new'), expense('alice')));
  });

  it('locks out a suspended account at once: its paused device sees and changes nothing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'devices/dev-alice'), { id: 'dev-alice', uid: 'alice', label: 'Phone', at: DATE, paused: true });
    });
    await assertFails(getDoc(doc(alice(), 'expenses/e-alice')));
    await assertFails(getDoc(doc(alice(), 'devices/dev-alice')));
    await assertFails(setDoc(doc(alice(), 'expenses/new'), expense('alice')));
    // Restore takes the pause off, and the same phone works again without a new approval
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'devices/dev-alice'), { id: 'dev-alice', uid: 'alice', label: 'Phone', at: DATE });
    });
    await assertSucceeds(getDoc(doc(alice(), 'expenses/e-alice')));
  });
});

describe("other people's data", () => {
  it("can't be read, listed, changed or deleted by another user", async () => {
    await assertFails(getDoc(doc(bob(), 'expenses/e-alice')));
    await assertFails(getDocs(query(collection(bob(), 'expenses'), where('uid', '==', 'alice'))));
    await assertFails(updateDoc(doc(bob(), 'expenses/e-alice'), { amount: 1 }));
    await assertFails(deleteDoc(doc(bob(), 'expenses/e-alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'chats/c-alice')));
  });

  it("can't be created in someone else's name", async () => {
    await assertFails(setDoc(doc(bob(), 'expenses/fake'), expense('alice')));
  });

  it('lets the owner list only their own', async () => {
    await assertSucceeds(getDocs(query(collection(alice(), 'expenses'), where('uid', '==', 'alice'))));
    await assertFails(getDocs(collection(alice(), 'expenses'))); // a list that could include others
  });
});

describe('the admin', () => {
  it('has no access to anyone\'s money records, chats, profile or receipts', async () => {
    await assertFails(getDoc(doc(admin(), 'expenses/e-alice')));
    await assertFails(getDoc(doc(admin(), 'chats/c-alice')));
    await assertFails(getDoc(doc(admin(), 'users/alice')));
    await assertFails(getDoc(doc(admin(), 'receipts/r-alice')));
  });
});

describe('expenses', () => {
  it('accept a valid expense, with or without a receipt link', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'expenses/new1'), expense('alice')));
    await assertSucceeds(setDoc(doc(alice(), 'expenses/new2'), expense('alice', { receiptId: 'r-alice' })));
  });

  it('refuse bad values', async () => {
    await assertFails(setDoc(doc(alice(), 'expenses/bad1'), expense('alice', { amount: 0 })));
    await assertFails(setDoc(doc(alice(), 'expenses/bad2'), expense('alice', { title: 'x'.repeat(101) })));
    await assertFails(setDoc(doc(alice(), 'expenses/bad3'), expense('alice', { receiptId: 42 })));
    await assertFails(setDoc(doc(alice(), 'expenses/bad4'), expense('alice', { date: 'yesterday' })));
  });

  it("can't be moved to another person", async () => {
    await assertFails(updateDoc(doc(alice(), 'expenses/e-alice'), { uid: 'bob' }));
  });

  // Security review item 7: no extra fields stuffed in, but old items stay editable
  it('accept every field the app writes, and nothing else', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'expenses/full'), expense('alice', {
      notes: '', split: { total: 900, people: 2 }, recurringId: 'r1', plannedId: 'p1', accountId: 'a1', accountName: 'Cash',
      smsRef: 's1', fee: 5, createdAt: DATE, labels: ['Eid'], warrantyUntil: DATE, feeling: 'worth', categoryKept: true,
    })));
    await assertFails(setDoc(doc(alice(), 'expenses/stuffed'), expense('alice', { junk: 'x'.repeat(1000) })));
    await assertFails(setDoc(doc(alice(), 'expenses/bigDate'), expense('alice', { createdAt: `${DATE}${'x'.repeat(100)}` })));
    await assertFails(setDoc(doc(alice(), 'expenses/badSplit'), expense('alice', { split: { total: 900, people: 2, junk: 1 } })));
    await assertFails(updateDoc(doc(alice(), 'expenses/e-alice'), { junk: 'x' }));
  });

  it('keep an old item with a leftover field editable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'expenses/old'), expense('alice', { oldField: 'from 2025', createdAt: 1700000000 }));
    });
    // Editing other fields works, and the leftover can be removed, but not changed
    await assertSucceeds(updateDoc(doc(alice(), 'expenses/old'), { title: 'Dinner' }));
    await assertFails(updateDoc(doc(alice(), 'expenses/old'), { oldField: 'changed' }));
    await assertSucceeds(updateDoc(doc(alice(), 'expenses/old'), { oldField: deleteField() }));
  });
});

describe('field lists on the other kinds', () => {
  it('let the app save what it saves today', async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, 'categories/c1'), { uid: 'alice', name: 'Pets', icon: 'Tag', createdAt: DATE }));
    await assertSucceeds(setDoc(doc(db, 'incomeCategories/c1'), { uid: 'alice', name: 'Tuition' }));
    await assertSucceeds(setDoc(doc(db, 'recurring/r1'), {
      uid: 'alice', title: 'Rent', amount: 9000, category: 'Housing', notes: '', frequency: 'monthly', nextDate: DATE,
      accountId: 'a1', accountName: 'Cash', createdAt: DATE,
    }));
    await assertSucceeds(setDoc(doc(db, 'accounts/a1'), {
      uid: 'alice', type: 'cash', name: 'Cash', label: 'Wallet', balance: 100, historySum: 100, createdAt: DATE, countedAt: DATE,
    }));
    await assertSucceeds(setDoc(doc(db, 'deposits/d1'), { uid: 'alice', amount: 500, date: DATE, title: 'Salary', source: 'manual', transfer: false }));
    await assertSucceeds(setDoc(doc(db, 'incomeRules/i1'), {
      uid: 'alice', title: 'Salary', amount: 500, category: 'Salary', notes: '', day: 5, nextDate: DATE, createdAt: DATE,
    }));
    await assertSucceeds(setDoc(doc(db, 'chats/new-chat'), { uid: 'alice', title: 'Hi', messages: [], createdAt: 1, updatedAt: 1 }));
    await assertSucceeds(updateDoc(doc(db, 'chats/c-alice'), { pinned: true }));
  });

  it('refuse extra fields on each of them', async () => {
    const db = alice();
    await assertFails(setDoc(doc(db, 'categories/c2'), { uid: 'alice', name: 'Pets', junk: 1 }));
    await assertFails(setDoc(doc(db, 'incomeCategories/c2'), { uid: 'alice', name: 'Tuition', junk: 1 }));
    await assertFails(setDoc(doc(db, 'deposits/d2'), { uid: 'alice', amount: 500, date: DATE, junk: 1 }));
    await assertFails(setDoc(doc(db, 'chats/c2'), { uid: 'alice', title: 'Hi', messages: [], updatedAt: 1, junk: 1 }));
    await assertFails(updateDoc(doc(db, 'chats/c-alice'), { junk: 1 }));
  });
});

describe('receipts', () => {
  it('can be read only by their owner', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'receipts/r-alice')));
    await assertFails(getDoc(doc(bob(), 'receipts/r-alice')));
  });

  it('are added and removed only by the AI server, so the 100 limit holds', async () => {
    await assertFails(setDoc(doc(alice(), 'receipts/r-new'), { id: 'r-new', uid: 'alice', type: 'image/jpeg', size: 1, source: 'add', createdAt: DATE }));
    await assertFails(updateDoc(doc(alice(), 'receipts/r-alice'), { size: 2 }));
    await assertFails(deleteDoc(doc(alice(), 'receipts/r-alice')));
  });
});

describe('server-only records', () => {
  const locked = ['deviceHistory/alice', 'googleLinks/alice', 'usernames/alice', 'deviceRequests/dev-new', 'adminLog/l1'];

  it('are closed to everyone in the app, owner and admin included', async () => {
    for (const path of locked) {
      await assertFails(getDoc(doc(alice(), path)));
      await assertFails(getDoc(doc(admin(), path)));
      await assertFails(setDoc(doc(alice(), path), { uid: 'alice' }));
    }
  });

  it('notices and devices can be read by their owner but never written', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'notices/n1')));
    await assertFails(setDoc(doc(alice(), 'notices/n2'), { uid: 'alice', text: 'x' }));
    await assertSucceeds(getDoc(doc(alice(), 'devices/dev-alice')));
    await assertFails(getDoc(doc(alice(), 'devices/dev-bob')));
    await assertFails(setDoc(doc(alice(), 'devices/dev-fake'), { id: 'dev-fake', uid: 'alice' }));
  });
});

describe('the profile', () => {
  it('lets the owner change settings, within the allowed values', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { welcome: 'tour' }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { 'driveBackup.receipts': true }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { welcome: 'anything' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { 'driveBackup.receipts': 'yes' }));
  });

  it('keeps the username and name for the AI server, which keeps names unique', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { username: 'admin' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { name: 'admin' }));
  });

  it("can't be deleted from the app", async () => {
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  });
});

describe('income', () => {
  const income = (extra: Record<string, unknown> = {}) => ({ uid: 'alice', amount: 30000, date: DATE, title: 'Salary', category: 'Salary', source: 'manual', ...extra });

  it('can be recorded with or without an account, and edited by its owner', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'deposits/i1'), income()));
    await assertSucceeds(setDoc(doc(alice(), 'deposits/i2'), income({ accountId: 'acc1', accountName: 'bKash' })));
    await assertSucceeds(updateDoc(doc(alice(), 'deposits/i1'), { amount: 32000 }));
    await assertFails(updateDoc(doc(bob(), 'deposits/i1'), { amount: 1 }));
    await assertFails(setDoc(doc(alice(), 'deposits/i3'), income({ source: 'stolen' })));
    await assertFails(setDoc(doc(alice(), 'deposits/i4'), income({ amount: -5 })));
  });

  it('monthly rules are checked and private', async () => {
    const rule = { uid: 'alice', title: 'Salary', amount: 30000, category: 'Salary', day: 1, nextDate: DATE };
    await assertSucceeds(setDoc(doc(alice(), 'incomeRules/r1'), rule));
    await assertFails(setDoc(doc(alice(), 'incomeRules/r2'), { ...rule, day: 40 }));
    await assertFails(getDoc(doc(bob(), 'incomeRules/r1')));
    await assertSucceeds(setDoc(doc(alice(), 'incomeCategories/c1'), { uid: 'alice', name: 'Pension' }));
    await assertFails(setDoc(doc(bob(), 'incomeCategories/c2'), { uid: 'alice', name: 'Pension' }));
  });
});

describe('Agent space tasks', () => {
  const task = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid, chatId: 'c-alice', messageId: 'm1', title: 'Move 500 from bKash to Cash',
    action: { kind: 'transfer', amount: 500 }, status: 'waiting', createdAt: DATE, ...extra,
  });

  it('start waiting, and are finished once by their owner', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'tasks/t1'), task('alice')));
    await assertSucceeds(updateDoc(doc(alice(), 'tasks/t1'), { status: 'done', doneAt: DATE, result: 'Done.', saved: true }));
    // Finished tasks never change again
    await assertFails(updateDoc(doc(alice(), 'tasks/t1'), { status: 'waiting' }));
    await assertSucceeds(deleteDoc(doc(alice(), 'tasks/t1')));
  });

  it("can't start finished, change their card, or belong to someone else", async () => {
    await assertFails(setDoc(doc(alice(), 'tasks/t2'), task('alice', { status: 'done' })));
    await assertFails(setDoc(doc(alice(), 'tasks/t3'), task('bob')));
    await assertFails(setDoc(doc(alice(), 'tasks/t4'), task('alice', { extra: 1 })));
    await assertSucceeds(setDoc(doc(alice(), 'tasks/t5'), task('alice')));
    await assertFails(updateDoc(doc(alice(), 'tasks/t5'), { action: { kind: 'transfer', amount: 5000 } }));
    await assertFails(getDoc(doc(bob(), 'tasks/t5')));
    await assertFails(updateDoc(doc(bob(), 'tasks/t5'), { status: 'cancelled', doneAt: DATE }));
  });
});

describe('saved filters', () => {
  const saved = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, name: 'Eid bills', filters: { label: 'Eid', type: 'all' }, category: 'All', createdAt: DATE, ...extra });

  it('belong to their owner, who can rename and remove them', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'savedFilters/f1'), saved('alice')));
    await assertSucceeds(updateDoc(doc(alice(), 'savedFilters/f1'), { name: 'Eid' }));
    await assertFails(getDoc(doc(bob(), 'savedFilters/f1')));
    await assertFails(updateDoc(doc(bob(), 'savedFilters/f1'), { name: 'Mine' }));
    await assertFails(deleteDoc(doc(bob(), 'savedFilters/f1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'savedFilters/f1')));
  });

  it('refuse anything the app would not save', async () => {
    await assertFails(setDoc(doc(alice(), 'savedFilters/f2'), saved('bob')));
    await assertFails(setDoc(doc(alice(), 'savedFilters/f3'), saved('alice', { name: '' })));
    await assertFails(setDoc(doc(alice(), 'savedFilters/f4'), saved('alice', { name: 'x'.repeat(31) })));
    await assertFails(setDoc(doc(alice(), 'savedFilters/f5'), saved('alice', { filters: 'all' })));
    await assertFails(setDoc(doc(alice(), 'savedFilters/f6'), saved('alice', { extra: 1 })));
  });
});

describe('warranties', () => {
  const expense = (extra: Record<string, unknown> = {}) => ({ uid: 'alice', title: 'Fan', amount: 3000, category: 'Shopping', date: DATE, ...extra });

  it('keeping an entry in Other is a yes or no', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'expenses/k1'), expense({ category: 'Other', categoryKept: true })));
    await assertFails(setDoc(doc(alice(), 'expenses/k2'), expense({ category: 'Other', categoryKept: 'yes' })));
  });

  it('are a real date on an expense', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'expenses/w1'), expense({ warrantyUntil: DATE })));
    await assertFails(setDoc(doc(alice(), 'expenses/w2'), expense({ warrantyUntil: 'next year' })));
    await assertFails(setDoc(doc(alice(), 'expenses/w3'), expense({ warrantyUntil: 24 })));
  });
});

describe('shopping lists', () => {
  const list = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid, name: 'Weekly bazar', items: [{ id: 'a', name: 'Rice', done: false }], createdAt: DATE, updatedAt: DATE, ...extra,
  });

  it('belong to their owner, who can change and remove them', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'shoppingLists/s1'), list('alice')));
    await assertSucceeds(updateDoc(doc(alice(), 'shoppingLists/s1'), { items: [], updatedAt: DATE }));
    await assertFails(getDoc(doc(bob(), 'shoppingLists/s1')));
    await assertFails(updateDoc(doc(bob(), 'shoppingLists/s1'), { name: 'Mine' }));
    await assertFails(deleteDoc(doc(bob(), 'shoppingLists/s1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'shoppingLists/s1')));
  });

  it('refuse anything the app would not save', async () => {
    await assertFails(setDoc(doc(alice(), 'shoppingLists/s2'), list('bob')));
    await assertFails(setDoc(doc(alice(), 'shoppingLists/s3'), list('alice', { name: '' })));
    await assertFails(setDoc(doc(alice(), 'shoppingLists/s4'), list('alice', { items: 'Rice' })));
    await assertFails(setDoc(doc(alice(), 'shoppingLists/s5'), list('alice', { items: Array.from({ length: 101 }, () => ({ id: 'x' })) })));
    await assertFails(setDoc(doc(alice(), 'shoppingLists/s6'), list('alice', { extra: 1 })));
  });
});

describe('category rules', () => {
  const rule = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, words: 'Shwapno', category: 'Food', createdAt: DATE, ...extra });

  it('belong to their owner, who can change and remove them', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'categoryRules/r1'), rule('alice')));
    await assertSucceeds(updateDoc(doc(alice(), 'categoryRules/r1'), { category: 'Shopping' }));
    await assertFails(getDoc(doc(bob(), 'categoryRules/r1')));
    await assertFails(updateDoc(doc(bob(), 'categoryRules/r1'), { category: 'Bills' }));
    await assertFails(deleteDoc(doc(bob(), 'categoryRules/r1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'categoryRules/r1')));
  });

  it('refuse anything the app would not save', async () => {
    await assertFails(setDoc(doc(alice(), 'categoryRules/r2'), rule('bob')));
    await assertFails(setDoc(doc(alice(), 'categoryRules/r3'), rule('alice', { words: 'a' })));
    await assertFails(setDoc(doc(alice(), 'categoryRules/r4'), rule('alice', { words: 'x'.repeat(61) })));
    await assertFails(setDoc(doc(alice(), 'categoryRules/r5'), rule('alice', { category: '' })));
    await assertFails(setDoc(doc(alice(), 'categoryRules/r6'), rule('alice', { extra: 1 })));
  });
});

describe('labels', () => {
  const expense = (extra: Record<string, unknown> = {}) => ({ uid: 'alice', title: 'Bus', amount: 500, category: 'Travel', date: DATE, ...extra });
  const income = (extra: Record<string, unknown> = {}) => ({ uid: 'alice', amount: 500, date: DATE, ...extra });

  it('allow up to 3 short labels on expenses and income', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'expenses/l1'), expense({ labels: ['Eid', 'Trip', 'Family'] })));
    await assertSucceeds(setDoc(doc(alice(), 'deposits/l1'), income({ labels: ['Eid'] })));
    await assertSucceeds(updateDoc(doc(alice(), 'expenses/l1'), { labels: ['Cox trip'] }));
  });

  it('refuse too many, too long, empty or the wrong kind', async () => {
    await assertFails(setDoc(doc(alice(), 'expenses/l2'), expense({ labels: ['a', 'b', 'c', 'd'] })));
    await assertFails(setDoc(doc(alice(), 'expenses/l3'), expense({ labels: ['x'.repeat(31)] })));
    await assertFails(setDoc(doc(alice(), 'expenses/l4'), expense({ labels: [''] })));
    await assertFails(setDoc(doc(alice(), 'expenses/l5'), expense({ labels: 'Eid' })));
    await assertFails(setDoc(doc(alice(), 'deposits/l6'), income({ labels: [5] })));
  });
});

describe('planned payments', () => {
  const plan = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid, kind: 'expense', title: 'School fee', amount: 3000, category: 'Education', repeat: 'monthly', date: DATE, day: 10, createdAt: DATE, ...extra,
  });

  it('belong to their owner, who can change and remove them', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'planned/p1'), plan('alice', { accountId: 'cash' })));
    await assertSucceeds(updateDoc(doc(alice(), 'planned/p1'), { date: DATE, amount: 3500 }));
    await assertFails(getDoc(doc(bob(), 'planned/p1')));
    await assertFails(updateDoc(doc(bob(), 'planned/p1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(bob(), 'planned/p1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'planned/p1')));
  });

  it('refuse anything the app would not save', async () => {
    await assertFails(setDoc(doc(alice(), 'planned/p2'), plan('bob')));
    await assertFails(setDoc(doc(alice(), 'planned/p3'), plan('alice', { kind: 'transfer' })));
    await assertFails(setDoc(doc(alice(), 'planned/p4'), plan('alice', { amount: 0 })));
    await assertFails(setDoc(doc(alice(), 'planned/p5'), plan('alice', { repeat: 'daily' })));
    await assertFails(setDoc(doc(alice(), 'planned/p6'), plan('alice', { day: 32 })));
    await assertFails(setDoc(doc(alice(), 'planned/p7'), plan('alice', { extra: 1 })));
  });
});

describe('favourites and the month start day', () => {
  const fav = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, kind: 'expense', title: 'Rickshaw', amount: 50, category: 'Transport', createdAt: DATE, ...extra });

  it('favourites are added and removed by their owner only, never edited', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'templates/f1'), fav('alice', { accountId: 'cash' })));
    await assertFails(updateDoc(doc(alice(), 'templates/f1'), { amount: 60 }));
    await assertFails(getDoc(doc(bob(), 'templates/f1')));
    await assertFails(setDoc(doc(alice(), 'templates/f2'), fav('bob')));
    await assertFails(setDoc(doc(alice(), 'templates/f3'), fav('alice', { kind: 'transfer' })));
    await assertFails(setDoc(doc(alice(), 'templates/f4'), fav('alice', { amount: 0 })));
    await assertSucceeds(deleteDoc(doc(alice(), 'templates/f1')));
  });

  it('needs and wants are a list of categories on the profile', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { spendingTypes: { Pets: 'want' } }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { spendingTypes: 'want' }));
  });

  it('the month may start on day 1 to 31 only', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { monthStart: 25 }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { monthStart: 31 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { monthStart: 0 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { monthStart: 32 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { monthStart: 2.5 }));
  });
});
