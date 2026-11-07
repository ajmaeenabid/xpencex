import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { bytesToBase64 } from './liveAudio';
import { MAX_FILE_BYTES } from './limits';
import type { ChatAttachment } from '../../shared/types';

export type AttachmentKind = ChatAttachment['kind'];

export type PreparedAttachment = {
  name: string;
  kind: AttachmentKind;
  mimeType: string; // what Gemini receives; spreadsheets are sent as plain text
  data: string; // base64
  previewUrl?: string;
};

export type AttachmentProblem = 'type' | 'size' | 'secret' | 'read' | 'empty';

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_TEXT_CHARS = 200_000; // about 100 pages; beyond this the AI would run out of room to answer
const CSV_COLUMN_BREAK = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/; // a comma that isn't inside "quotes"

// What the Camera, Gallery and Files options ask the phone for
export const FILE_PICKER_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.csv,.xlsx,image/jpeg,image/png,image/webp,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const IMAGE_PICKER_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Works out the kind from the name first, because phones often leave a file's type blank */
export function identifyFile(name: string, type: string): { kind: AttachmentKind; format: string } | null {
  const extension = name.toLowerCase().split('.').pop() || '';
  if (IMAGE_TYPES[extension]) return { kind: 'image', format: IMAGE_TYPES[extension] };
  if (extension === 'pdf') return { kind: 'pdf', format: 'application/pdf' };
  if (extension === 'csv') return { kind: 'sheet', format: 'csv' };
  if (extension === 'xlsx') return { kind: 'sheet', format: 'xlsx' };
  // Camera photos can arrive with no extension
  if (!name.includes('.') && Object.values(IMAGE_TYPES).includes(type)) return { kind: 'image', format: type };
  return null;
}

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const rowsToCsv = (rows: unknown[][]) => rows.map(row => row.map(csvCell).join(',')).join('\n');

/** Applies the privacy checks to spreadsheet text. Returns null when it holds an OTP, PIN or similar. */
export function cleanSheetText(text: string): { text: string; cut: boolean } | null {
  if (containsSecret(text)) return null;
  // Cell by cell: maskSensitive leaves numbers touching a comma alone, so it wouldn't catch them in a whole row
  const masked = text
    .split(/\r?\n/)
    .map(line => line.split(CSV_COLUMN_BREAK).map(maskSensitive).join(','))
    .join('\n');
  return { text: masked.slice(0, MAX_TEXT_CHARS), cut: masked.length > MAX_TEXT_CHARS };
}

async function readSheetText(file: File, format: string): Promise<string> {
  if (format === 'csv') return file.text();
  // Loaded only when someone picks an Excel file, so the app itself stays small
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  return sheets
    .map(({ sheet, data }) => `Sheet: ${sheet}\n${rowsToCsv(data as unknown[][])}`)
    .join('\n\n');
}

const readBase64 = async (file: Blob) => bytesToBase64(new Uint8Array(await file.arrayBuffer()));

// Tried in order until a photo fits, so it stays as sharp as it can. Text on a receipt is still readable at the smallest.
const SHRINK_STEPS = [
  { side: 2560, quality: 0.85 },
  { side: 2048, quality: 0.8 },
  { side: 1600, quality: 0.75 },
  { side: 1280, quality: 0.7 },
];

/** The size to draw a picture at so its longest side fits, keeping its shape. Never enlarges. */
export function fitWithin(width: number, height: number, side: number) {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A smaller JPEG copy of a photo that's over the limit, or null when it can't be read or made to fit */
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
      if (blob && blob.size <= MAX_FILE_BYTES) return blob;
    }
    return null;
  } catch (err) {
    console.error('Could not shrink the photo', err);
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Checks a picked file and turns it into what the AI receives. Nothing has been sent yet. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment | { problem: AttachmentProblem }> {
  const found = identifyFile(file.name, file.type);
  if (!found) return { problem: 'type' };
  // Photos over the limit are shrunk to fit; other files have to be under it already
  if (file.size > MAX_FILE_BYTES && found.kind !== 'image') return { problem: 'size' };
  const name = maskSensitive(file.name || 'file').slice(0, 80);
  if (containsSecret(name)) return { problem: 'secret' };

  try {
    if (found.kind === 'sheet') {
      const raw = await readSheetText(file, found.format);
      if (!raw.trim()) return { problem: 'empty' };
      const clean = cleanSheetText(raw);
      if (!clean) return { problem: 'secret' };
      const text = clean.cut ? `${clean.text}\n\n(This file was too long, so only the first part is included.)` : clean.text;
      return { name, kind: 'sheet', mimeType: 'text/plain', data: bytesToBase64(new TextEncoder().encode(text)) };
    }
    if (found.kind === 'image' && file.size > MAX_FILE_BYTES) {
      const smaller = await shrinkPhoto(file);
      if (!smaller) return { problem: 'size' };
      return { name, kind: 'image', mimeType: 'image/jpeg', data: await readBase64(smaller), previewUrl: URL.createObjectURL(smaller) };
    }
    return {
      name,
      kind: found.kind,
      mimeType: found.format,
      data: await readBase64(file),
      previewUrl: found.kind === 'image' ? URL.createObjectURL(file) : undefined,
    };
  } catch (err) {
    console.error('Could not read the file', err);
    return { problem: 'read' };
  }
}
