import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { google, encode, decode, encodeFields, Plain } from './google';

// A pretend Google: it signs the admin in, then answers the Firestore queries and deletes
// that removing a user makes, against a small in-memory database.
const PROJECT = 'xpensex-test';
const dbPath = `projects/${PROJECT}/databases/(default)/documents`;
type Doc = { uid?: string };
const db = new Map<string, Doc>(); // full document name -> fields
const queried = new Set<string>(); // collections the delete looked in

// Firestore collections that hold nothing personal, or are removed another way
const NOT_PER_USER = new Set([
  'users', // the profile itself: deleted by its id at the end
  'meta', // shared exchange rates
  'adminLog', // the admin's own record of actions
]);

const docName = (collection: string, id: string) => `${dbPath}/${collection}/${id}`;
const countOf = (uid: string) => [...db.values()].filter((d) => d.uid === uid).length;

/** Every collection in firestore.rules, read from the file so a new one can't be missed */
async function collectionsInRules(): Promise<string[]> {
  const fsModule = 'node:fs'; // kept in a variable: the server's own type check has no Node types
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (path: string, enc: string) => string };
  let text = '';
  for (const path of ['firestore.rules', '../firestore.rules']) {
    try { text = readFileSync(path, 'utf8'); break; } catch { /* try the next place */ }
  }
  const names = [...text.matchAll(/match \/([A-Za-z]+)\/(?:\{|exchangeRates)/g)].map((m) => m[1]);
  // "databases" is the outer wrapper (match /databases/{database}/documents), not a collection
  return [...new Set(names)].filter((n) => n !== 'databases');
}

let serviceAccount = '';

beforeAll(async () => {
  const keys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({ client_email: 'admin@xpensex-test.iam.gserviceaccount.com', private_key: pem });

  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body?: string }) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-token', expires_in: 3600 }));
    }
    const body = JSON.parse(init.body || '{}');
    if (url.endsWith(':runQuery')) {
      const q = body.structuredQuery;
      const collection = q.from[0].collectionId as string;
      const uid = q.where.fieldFilter.value.stringValue as string;
      queried.add(collection);
      const names = [...db.entries()]
        .filter(([name, d]) => name.startsWith(`${dbPath}/${collection}/`) && d.uid === uid)
        .slice(0, q.limit)
        .map(([name]) => ({ document: { name } }));
      return new Response(JSON.stringify(names.length ? names : [{ readTime: 'now' }]));
    }
    if (url.endsWith(':commit')) {
      for (const w of body.writes) if (w.delete) db.delete(w.delete);
      return new Response(JSON.stringify({}));
    }
    return new Response('not faked', { status: 500 });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('deleting a user', () => {
  let perUser: string[] = [];

  beforeEach(async () => {
    db.clear();
    queried.clear();
    perUser = (await collectionsInRules()).filter((c) => !NOT_PER_USER.has(c));
    // Two people, each with something in every collection
    for (const c of perUser) {
      for (const uid of ['mim', 'zara']) {
        db.set(docName(c, `${uid}-a`), { uid });
        db.set(docName(c, `${uid}-b`), { uid });
      }
    }
    db.set(docName('users', 'mim'), {});
    db.set(docName('users', 'zara'), {});
    db.set(docName('meta', 'exchangeRates'), {});
    db.set(docName('adminLog', 'log-1'), {});
  });

  it('finds the collections in firestore.rules (so the next test means something)', () => {
    expect(perUser.length).toBeGreaterThanOrEqual(11);
    expect(perUser).toContain('expenses');
    expect(perUser).toContain('chats');
  });

  it('looks in every per-user collection in firestore.rules (CLAUDE.md: add new ones to USER_COLLECTIONS)', async () => {
    await google(serviceAccount, PROJECT).deleteUserData('mim');
    const missed = perUser.filter((c) => !queried.has(c));
    expect(missed, `Add these to USER_COLLECTIONS in ai-server/src/google.ts: ${missed.join(', ')}`).toEqual([]);
  });

  it("removes everything of theirs and their profile, and nobody else's", async () => {
    const before = countOf('mim');
    const removed = await google(serviceAccount, PROJECT).deleteUserData('mim');
    expect(countOf('mim')).toBe(0);
    expect(db.has(docName('users', 'mim'))).toBe(false);
    expect(removed).toBe(before + 1);

    expect(countOf('zara')).toBe(perUser.length * 2);
    expect(db.has(docName('users', 'zara'))).toBe(true);
    expect(db.has(docName('meta', 'exchangeRates'))).toBe(true);
  });

  it('keeps going past one page of 400, for someone with lots of expenses', async () => {
    for (let i = 0; i < 950; i++) db.set(docName('expenses', `many-${i}`), { uid: 'mim' });
    await google(serviceAccount, PROJECT).deleteUserData('mim');
    expect(countOf('mim')).toBe(0);
    expect(countOf('zara')).toBe(perUser.length * 2);
  });

  it('stops with an error, instead of saying done, when Google refuses', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: unknown) =>
      url.endsWith(':commit') ? new Response('PERMISSION_DENIED', { status: 403 }) : (realFetch as typeof fetch)(url, init as RequestInit)));
    await expect(google(serviceAccount, PROJECT).deleteUserData('mim')).rejects.toThrow(/403/);
    vi.stubGlobal('fetch', realFetch);
  });
});

describe('Firestore value conversion', () => {
  it('keeps every kind of value the same through a round trip', () => {
    const data: Record<string, Plain> = {
      title: 'Lunch', amount: 120, rate: 9.5, paid: true, note: null,
      tags: ['food', 'office'], split: { people: 3, each: 40.25 }, empty: '',
    };
    const fields = encodeFields(data);
    const back = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
    expect(back).toEqual(data);
  });

  it('stores whole numbers as integers and others as doubles, as Firestore expects', () => {
    expect(encode(500)).toEqual({ integerValue: '500' });
    expect(encode(12.5)).toEqual({ doubleValue: 12.5 });
    expect(decode({ integerValue: '9007199254740991' })).toBe(9007199254740991);
  });

  it('reads dates as text and unknown values as null', () => {
    expect(decode({ timestampValue: '2026-11-07T10:00:00Z' })).toBe('2026-11-07T10:00:00Z');
    expect(decode({})).toBeNull();
  });
});
