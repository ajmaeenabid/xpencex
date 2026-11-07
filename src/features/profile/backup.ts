// Backup file: plain rules, no database calls. A backup is one JSON file with all of a user's data,
// optionally locked with a password (AES-GCM, with a key made from the password by PBKDF2).

export const BACKUP_COLLECTIONS = ['accounts', 'balanceHistory', 'expenses', 'deposits', 'recurring', 'categories', 'loans', 'debts', 'chats'] as const;
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

type Item = Record<string, unknown> & { id: string };

export interface BackupData {
  app: 'XpenceX';
  version: 1;
  exportedAt: string;
  profile: { categoryBudgets?: Record<string, number> };
  data: Record<BackupCollection, Item[]>;
}

interface LockedFile {
  app: 'XpenceX';
  version: 1;
  locked: true;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 250_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The text of the backup file, locked with the password when one is given */
export async function writeBackup(backup: BackupData, password?: string): Promise<string> {
  const json = JSON.stringify(backup);
  if (!password) return json;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), enc.encode(json)));
  // Built in pieces, so a very large backup doesn't overflow String.fromCharCode
  let b64 = '';
  for (let i = 0; i < sealed.length; i += 0x8000) b64 += String.fromCharCode(...sealed.subarray(i, i + 0x8000));
  const file: LockedFile = { app: 'XpenceX', version: 1, locked: true, salt: toB64(salt), iv: toB64(iv), data: btoa(b64) };
  return JSON.stringify(file);
}

export class BackupError extends Error {
  constructor(public reason: 'notBackup' | 'needsPassword' | 'wrongPassword') {
    super(reason);
  }
}

const parse = (text: string) => {
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch { throw new BackupError('notBackup'); }
};

export const isLocked = (text: string) => parse(text)?.locked === true;

/** Reads a backup file, unlocking it with the password if it is locked */
export async function readBackup(text: string, password?: string): Promise<BackupData> {
  let file = parse(text);
  if (file?.app !== 'XpenceX' || file.version !== 1) throw new BackupError('notBackup');
  if (file.locked) {
    if (!password) throw new BackupError('needsPassword');
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, await keyFrom(password, fromB64(file.salt)), fromB64(file.data));
      file = parse(dec.decode(plain));
    } catch (err) {
      if (err instanceof BackupError) throw err;
      throw new BackupError('wrongPassword'); // AES-GCM refuses a wrong key
    }
  }
  if (file?.app !== 'XpenceX' || !file.data || typeof file.data !== 'object') throw new BackupError('notBackup');
  for (const c of BACKUP_COLLECTIONS) if (!Array.isArray(file.data[c])) file.data[c] = [];
  return file as BackupData;
}

// Firestore document ids made by the app are letters and digits; anything else is ignored
const ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface RestorePlan {
  write: Record<BackupCollection, { id: string; data: Record<string, unknown> }[]>;
  skipped: number; // already in the app
  invalid: number; // not usable
}

/**
 * What to add: everything not already in the app, given to the current user. Accounts come first
 * when written, so the items that point to them line up.
 */
export function planRestore(backup: BackupData, uid: string, existing: Partial<Record<BackupCollection, Set<string>>>): RestorePlan {
  const write = Object.fromEntries(BACKUP_COLLECTIONS.map(c => [c, []])) as unknown as RestorePlan['write'];
  let skipped = 0, invalid = 0;
  for (const c of BACKUP_COLLECTIONS) {
    for (const item of backup.data[c]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !ID.test(item.id)) { invalid++; continue; }
      if (existing[c]?.has(item.id)) { skipped++; continue; }
      const { id, ...data } = item;
      write[c].push({ id, data: { ...data, uid } });
    }
  }
  return { write, skipped, invalid };
}
