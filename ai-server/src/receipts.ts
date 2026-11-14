// Receipt photos and PDFs, kept in the private R2 bucket RECEIPTS. The app never reaches the bucket itself:
// every upload, view and delete comes through here, after the sign-in and the device pass are checked.
//
// Each receipt is:
// - the file, at users/<uid>/<receiptId> in the bucket
// - a receipts/<receiptId> record in Firestore (only this server writes it; the owner can read it), and
// - receiptId on its expense, when it belongs to one.
// How many each person has is counted by their UsageLimiter (src/index.ts), so two uploads at once can't pass 100.

import { encodeFields, google } from './google';
import {
  MAX_RECEIPTS, MAX_RECEIPT_BYTES, ReceiptSource, detectReceiptType, isReceiptSource, isSafeId, receiptKey, uploadProblem, userFolder,
} from './receiptRules';

type Json = (body: unknown, status?: number) => Response;

export interface ReceiptsEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  RECEIPTS?: R2Bucket;
}

/** The per-person counter, kept by the UsageLimiter Durable Object */
export interface ReceiptCounter {
  reserveReceipt(max: number): Promise<{ ok: boolean; used: number }>;
  releaseReceipt(): Promise<void>;
}

const newId = () => crypto.randomUUID().replace(/-/g, '');

export async function handleReceipts(
  path: string, url: URL, uid: string, request: Request, env: ReceiptsEnv, json: Json,
  cors: Record<string, string>, counter: ReceiptCounter,
): Promise<Response> {
  if (!env.RECEIPTS || !env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'Receipts are not set up yet.', code: 'off' }, 503);
  const bucket = env.RECEIPTS;
  const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);

  // ---- Upload: the file is the request body; ?source=add|chat and, optionally, &expenseId=...
  if (path === '/receipts/upload') {
    const source = url.searchParams.get('source');
    const expenseId = url.searchParams.get('expenseId');
    if (!isReceiptSource(source)) return json({ error: 'Something went wrong. Please try again.' }, 400);
    if (expenseId !== null && !isSafeId(expenseId)) return json({ error: 'Something went wrong. Please try again.' }, 400);

    // Stop a big file before reading it
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > MAX_RECEIPT_BYTES) return json({ error: 'That file is too big. The limit is 1 MB.', code: 'too-big' }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const problem = uploadProblem(bytes, 0);
    if (problem === 'empty' || problem === 'wrong-type') return json({ error: 'Receipts can be a photo (JPG, PNG, WEBP) or a PDF.', code: problem }, 400);
    if (problem === 'too-big') return json({ error: 'That file is too big. The limit is 1 MB.', code: 'too-big' }, 413);

    // The expense must be this person's and must not have a receipt yet (one per expense)
    let expense: Awaited<ReturnType<typeof g.getTyped>> = null;
    if (expenseId) {
      expense = await g.getTyped('expenses', expenseId);
      if (!expense || expense.data.uid !== uid) return json({ error: 'That expense was not found.', code: 'no-expense' }, 404);
      // A link to a receipt that no longer exists (an expense put back by a restore) doesn't count
      const linked = expense.data.receiptId;
      if (typeof linked === 'string' && linked && isSafeId(linked)) {
        const current = await g.getTyped('receipts', linked);
        if (current && current.data.uid === uid) {
          return json({ error: 'This expense already has a receipt. Delete it first to add a new one.', code: 'has-receipt' }, 409);
        }
      }
    }

    const { ok, used } = await counter.reserveReceipt(MAX_RECEIPTS);
    if (!ok) return json({ error: 'You have 100 receipts. Delete one to add a new one.', code: 'full', used }, 409);

    const id = newId();
    const type = detectReceiptType(bytes)!;
    const record = {
      id, uid, type, size: bytes.length, source: source as ReceiptSource, createdAt: new Date().toISOString(),
      ...(expenseId && { expenseId }),
    };
    try {
      await bucket.put(receiptKey(uid, id), bytes, { httpMetadata: { contentType: type } });
      await g.commit([
        { update: { name: g.docName('receipts', id), fields: encodeFields(record) }, currentDocument: { exists: false } },
        // Only if nobody changed or deleted the expense since it was read above
        ...(expense ? [{
          update: { name: expense.name, fields: encodeFields({ receiptId: id }) },
          updateMask: { fieldPaths: ['receiptId'] },
          currentDocument: { updateTime: expense.updateTime },
        }] : []),
      ]);
    } catch (err) {
      // Undo, so nothing is left half-saved and the slot is given back
      await bucket.delete(receiptKey(uid, id)).catch(() => {});
      await counter.releaseReceipt();
      console.error('Receipt upload failed', err);
      return json({ error: 'Could not save the receipt. Please try again.' }, 500);
    }
    return json({ receipt: record, used });
  }

  const id = url.searchParams.get('id');
  if (!isSafeId(id)) return json({ error: 'Something went wrong. Please try again.' }, 400);

  // ---- Open: sends the file back, only to its owner. The id never changes, so the phone can keep a copy.
  if (path === '/receipts/open') {
    const file = await bucket.get(receiptKey(uid, id));
    if (!file) return json({ error: 'That receipt was not found.', code: 'missing' }, 404);
    return new Response(file.body, {
      headers: {
        ...cors,
        'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  }

  // ---- Delete: the file, its record, and the link on its expense
  if (path === '/receipts/delete') {
    const record = await g.getTyped('receipts', id);
    if (!record || record.data.uid !== uid) return json({ error: 'That receipt was not found.', code: 'missing' }, 404);
    const expenseId = record.data.expenseId;
    const expense = isSafeId(expenseId) ? await g.getTyped('expenses', expenseId) : null;
    const linked = expense && expense.data.uid === uid && expense.data.receiptId === id;

    await bucket.delete(receiptKey(uid, id));
    await g.commit([
      { delete: record.name },
      // A field named in the mask but left out of the fields is removed
      ...(linked ? [{ update: { name: expense!.name, fields: {} }, updateMask: { fieldPaths: ['receiptId'] }, currentDocument: { exists: true } }] : []),
    ]);
    await counter.releaseReceipt();
    return json({ ok: true });
  }

  return json({ error: 'Not found.' }, 404);
}

/** Removes every receipt file a person has. Runs when their account is deleted. */
export async function deleteUserReceipts(bucket: R2Bucket | undefined, uid: string): Promise<void> {
  if (!bucket) return;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: userFolder(uid), cursor });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
