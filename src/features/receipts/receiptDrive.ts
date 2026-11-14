import { keyFrom } from '../profile/backup';
import type { Receipt } from '../../shared/types';

// Receipts in Google Drive backups: which ones to send or bring back, and locking them with the backup's
// password. Plain functions, so they are tested. The Drive calls are in src/features/connect/drive.ts.
//
// Choices (2026-11-11): a "Receipts" folder inside "Xpences backups", one file per receipt, only new ones sent;
// locked with the same password as the backup; receipts deleted in the app stay in Drive; a restore brings
// back only the receipts that the restored backup's expenses point to and that the app doesn't have.

/** A receipt file in Drive, from its saved details */
export interface DriveReceipt {
  fileId: string;
  receiptId: string;
  locked: boolean;
  type: Receipt['type'];
  source: Receipt['source'];
}

const EXTENSIONS: Record<Receipt['type'], string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

/** The file's name in Drive. A locked one can't be opened outside Xpences, so it gets its own ending. */
export const driveReceiptName = (r: Pick<Receipt, 'id' | 'type'>, locked: boolean) =>
  `receipt-${r.id}.${locked ? 'locked' : EXTENSIONS[r.type] || 'bin'}`;

/** The receipts to send now: those without a copy in Drive yet, locked the same way as this backup */
export function receiptsToBackUp(receipts: Receipt[], inDrive: DriveReceipt[], locked: boolean): Receipt[] {
  const have = new Set(inDrive.filter(f => f.locked === locked).map(f => f.receiptId));
  return receipts.filter(r => !have.has(r.id));
}

export interface RestoreItem { expenseId: string; receiptId: string; file: DriveReceipt }

/**
 * The receipts to bring back: each expense in the backup that points to a receipt the app doesn't have,
 * when Drive has that receipt. A normal copy is used before a locked one, as it needs no password.
 */
export function receiptsToRestore(
  links: { expenseId: string; receiptId: string }[],
  appReceiptIds: Set<string>,
  inDrive: DriveReceipt[],
): RestoreItem[] {
  const byId = new Map<string, DriveReceipt>();
  for (const f of inDrive) {
    const current = byId.get(f.receiptId);
    if (!current || (current.locked && !f.locked)) byId.set(f.receiptId, f);
  }
  const seen = new Set<string>();
  const out: RestoreItem[] = [];
  for (const { expenseId, receiptId } of links) {
    if (appReceiptIds.has(receiptId) || seen.has(receiptId)) continue;
    const file = byId.get(receiptId);
    if (!file) continue;
    seen.add(receiptId);
    out.push({ expenseId, receiptId, file });
  }
  return out;
}

/** The expenses in a backup that point to a receipt */
export function receiptLinks(expenses: Record<string, unknown>[]): { expenseId: string; receiptId: string }[] {
  return expenses.flatMap(e => (typeof e.id === 'string' && typeof e.receiptId === 'string' && e.receiptId
    ? [{ expenseId: e.id, receiptId: e.receiptId }] : []));
}

// ---- Locking with the backup's password (AES-GCM, key from the password by PBKDF2, as for the backup file)

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export class ReceiptLockError extends Error {
  constructor() { super('wrongPassword'); }
}

/**
 * Locks receipts with a password. Making the key is slow on purpose (to stop guessing), so one key is
 * made for the whole backup and shared by its receipts; each still gets its own random iv.
 */
export async function receiptLocker(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await keyFrom(password, salt);
  return async (bytes: Uint8Array): Promise<string> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    return JSON.stringify({ app: 'Xpences', kind: 'receipt', version: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(sealed) });
  };
}

/** Opens locked receipts. Keys are kept by salt, so receipts from one backup make the key once. */
export function receiptUnlocker(password: string) {
  const keys = new Map<string, Promise<CryptoKey>>();
  return async (text: string): Promise<Uint8Array> => {
    let file: { kind?: string; salt?: string; iv?: string; data?: string };
    try { file = JSON.parse(text); } catch { throw new ReceiptLockError(); }
    if (file.kind !== 'receipt' || !file.salt || !file.iv || !file.data) throw new ReceiptLockError();
    if (!keys.has(file.salt)) keys.set(file.salt, keyFrom(password, fromB64(file.salt)));
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, await keys.get(file.salt)!, fromB64(file.data)));
    } catch {
      throw new ReceiptLockError(); // a different password: AES-GCM refuses the key
    }
  };
}
