// Checks firestore.rules against a local, fake Firestore (the Firebase Emulator). Nothing touches the real database.
// Run with `npm run test:rules` (scripts/test-rules.mjs starts the emulator); GitHub CI runs it on every push.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
