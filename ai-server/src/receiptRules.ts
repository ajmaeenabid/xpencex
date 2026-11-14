// Receipt photos and PDFs: the checks on what is uploaded. Plain functions, so they can be tested.
// The files themselves live in the R2 bucket (src/receipts.ts); see the plan in the project memory.

export const MAX_RECEIPT_BYTES = 1024 * 1024; // photos are shrunk on the phone first, so this is plenty
export const MAX_RECEIPTS = 100; // per person; they delete an old one to add a new one

export type ReceiptType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export type ReceiptSource = 'add' | 'chat';

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

/**
 * The real type of a file, read from its first bytes rather than trusting its name or the phone.
 * Anything that is not a JPG, PNG, WEBP or PDF gives null.
 */
export function detectReceiptType(bytes: Uint8Array): ReceiptType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // "%PDF-"
  return null;
}

/** Firestore ids made by the app and the server: letters, digits, - and _ only, so they are safe in a path */
export const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);

export const isReceiptSource = (s: unknown): s is ReceiptSource => s === 'add' || s === 'chat';

/** Where a receipt is kept in the bucket. Each person has their own folder, so deleting an account clears it. */
export const receiptKey = (uid: string, id: string) => `users/${uid}/${id}`;
export const userFolder = (uid: string) => `users/${uid}/`;

export type UploadProblem = 'empty' | 'too-big' | 'wrong-type' | 'full';

/** What is wrong with an upload, or null when it can be saved. `used` is how many receipts the person has now. */
export function uploadProblem(bytes: Uint8Array, used: number): UploadProblem | null {
  if (bytes.length === 0) return 'empty';
  if (bytes.length > MAX_RECEIPT_BYTES) return 'too-big';
  if (!detectReceiptType(bytes)) return 'wrong-type';
  if (used >= MAX_RECEIPTS) return 'full';
  return null;
}
