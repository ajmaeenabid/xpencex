import { MAX_RECEIPT_BYTES, MAX_RECEIPTS } from '../../../ai-server/src/receiptRules';
import { fitWithin, identifyFile } from '../chat/attachments';
import type { TKey } from '../../shared/i18n';

// Getting a picked photo or PDF ready to keep as a receipt. The server checks everything again.

export { MAX_RECEIPTS };

export type PreparedReceipt = { blob: Blob; kind: 'image' | 'pdf'; previewUrl?: string };
export type ReceiptProblem = 'type' | 'size' | 'read';

// Tried in order until the photo is under 1 MB. The first step usually gives about 200 to 400 KB,
// and a receipt's text is still easy to read at the last one.
const SHRINK_STEPS = [
  { side: 1600, quality: 0.75 },
  { side: 1280, quality: 0.7 },
  { side: 1024, quality: 0.65 },
];

/** Whether a picked file can be a receipt, before any work is done on it */
export function receiptPickProblem(name: string, type: string, size: number): ReceiptProblem | null {
  const found = identifyFile(name, type);
  if (!found || (found.kind !== 'image' && found.kind !== 'pdf')) return 'type';
  // Photos are always redrawn smaller; a PDF has to fit as it is
  if (found.kind === 'pdf' && size > MAX_RECEIPT_BYTES) return 'size';
  return null;
}

/**
 * A smaller JPEG copy of a photo. Every photo is redrawn, even small ones: that also drops what the camera
 * hides inside the file, such as where the photo was taken.
 */
async function shrinkPhoto(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    for (const { side, quality } of SHRINK_STEPS) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#fff'; // JPEG has no see-through parts
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_RECEIPT_BYTES) return blob;
    }
    return null;
  } catch (err) {
    console.error('Could not shrink the receipt photo', err);
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Checks a picked file and gets it ready. Nothing is sent yet. */
export async function prepareReceipt(file: File): Promise<PreparedReceipt | { problem: ReceiptProblem }> {
  const problem = receiptPickProblem(file.name, file.type, file.size);
  if (problem) return { problem };
  if (identifyFile(file.name, file.type)!.kind === 'pdf') return { blob: file, kind: 'pdf' };
  const smaller = await shrinkPhoto(file);
  if (!smaller) return { problem: 'read' };
  return { blob: smaller, kind: 'image', previewUrl: URL.createObjectURL(smaller) };
}

/** The note for a problem found on the phone or reported by the server (its `code`) */
export function receiptProblemKey(code: string | undefined): TKey {
  switch (code) {
    case 'type': case 'wrong-type': case 'empty': return 'receipt.problem.type';
    case 'size': case 'too-big': return 'receipt.problem.size';
    case 'read': return 'receipt.problem.read';
    case 'full': return 'receipt.full';
    case 'has-receipt': return 'receipt.problem.hasReceipt';
    case 'off': return 'receipt.problem.off';
    case 'offline': return 'receipt.needsInternet';
    default: return 'receipt.problem.save';
  }
}

const NOTE_KEY = (uid: string) => `xpences-receipt-note:${uid}`;

/** True the first time this person adds a receipt on this phone, so the card number note shows once */
export function takeFirstReceiptNote(uid: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(NOTE_KEY(uid))) return false;
    storage.setItem(NOTE_KEY(uid), '1');
    return true;
  } catch {
    return false;
  }
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
