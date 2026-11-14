import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { WorkerError, workerFetch } from '../../shared/lib/workerApi';
import { isOnline } from '../../shared/lib/offlineSave';
import { showToast } from '../../shared/lib/toast';
import type { Receipt } from '../../shared/types';
import { receiptProblemKey } from './receiptFile';

// Talking to the AI server about receipts (ai-server/src/receipts.ts). Every call needs the internet.

/** A refusal from the server, with its code ('full', 'too-big', ...) or 'offline' */
export class ReceiptError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function send(path: string, body: BodyInit = '', contentType = 'application/octet-stream'): Promise<Response> {
  if (!isOnline()) throw new ReceiptError('offline');
  let res: Response;
  try {
    res = await workerFetch(path, body, contentType);
  } catch (err) {
    throw new ReceiptError(err instanceof WorkerError && err.status === -1 ? 'offline' : 'error');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ReceiptError(typeof data.code === 'string' ? data.code : 'error');
  }
  return res;
}

/** Keeps a photo or PDF as a receipt, on an expense when `expenseId` is given */
export async function uploadReceipt(blob: Blob, { source, expenseId }: { source: Receipt['source']; expenseId?: string }): Promise<Receipt> {
  const params = new URLSearchParams({ source, ...(expenseId && { expenseId }) });
  const res = await send(`/receipts/upload?${params}`, blob, blob.type || 'application/octet-stream');
  return ((await res.json()) as { receipt: Receipt }).receipt;
}

/**
 * Sends a receipt (picked on Add Expense, or kept from chat) once its expense has reached the server, then says how it went.
 * Runs on its own, so the screen moves on straight away. Without internet the receipt is not kept:
 * it can be added later from the expense.
 */
export function attachWhenSaved(expenseWrite: Promise<unknown>, blob: Blob, expenseId: string, source: Receipt['source'] = 'add') {
  if (!isOnline()) {
    showToast('receipt.notAdded');
    return;
  }
  expenseWrite
    .then(() => uploadReceipt(blob, { source, expenseId }))
    .then(() => showToast('receipt.saved'))
    .catch(err => {
      console.error('Could not keep the receipt', err);
      showToast(err instanceof ReceiptError && err.code !== 'error' ? receiptProblemKey(err.code) : 'receipt.problem.save');
    });
}

export async function deleteReceipt(id: string): Promise<void> {
  await send(`/receipts/delete?id=${encodeURIComponent(id)}`);
  await forgetCopy(id);
}

/** The receipt on an expense, if it has one (read from the phone's copy when there is one) */
export async function receiptOfExpense(expenseId: string | undefined): Promise<string | undefined> {
  if (!expenseId) return undefined;
  try {
    const snap = await getDoc(doc(db, 'expenses', expenseId));
    const id = snap.exists() ? snap.data().receiptId : undefined;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

/** How many receipts this person keeps now (the limit is 100) */
export async function countReceipts(uid: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'receipts'), where('uid', '==', uid)));
  return snap.data().count;
}

// ---- Copies kept on the phone, so a receipt opened once opens at once and without internet next time.
// A receipt never changes (a new one gets a new id), so a kept copy is never out of date.

const CACHE = 'xpences-receipts';
const cacheUrl = (id: string) => `${location.origin}/__receipts/${id}`;

async function keptCopy(id: string): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(cacheUrl(id));
    return hit ? await hit.blob() : null;
  } catch {
    return null; // no cache here (private window, old phone): just download it
  }
}

async function keepCopy(id: string, blob: Blob) {
  try {
    await (await caches.open(CACHE)).put(cacheUrl(id), new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch {
    // not kept; it downloads again next time
  }
}

async function forgetCopy(id: string) {
  try {
    await (await caches.open(CACHE)).delete(cacheUrl(id));
  } catch {
    // nothing to forget
  }
}

/** Removes every kept receipt from this phone. Runs on log out. */
export async function forgetAllReceiptCopies() {
  try {
    await caches.delete(CACHE);
  } catch {
    // nothing kept
  }
}

/** The receipt's file, from this phone when it was opened before */
export async function openReceipt(id: string): Promise<Blob> {
  const kept = await keptCopy(id);
  if (kept) return kept;
  const res = await send(`/receipts/open?id=${encodeURIComponent(id)}`);
  const blob = await res.blob();
  await keepCopy(id, blob);
  return blob;
}
