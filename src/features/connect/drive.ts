import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import type { Receipt } from '../../shared/types';
import { DriveReceipt, ReceiptLockError, driveReceiptName, receiptLocker, receiptUnlocker, receiptsToBackUp, receiptsToRestore } from '../receipts/receiptDrive';
import { ReceiptError, openReceipt, uploadReceipt } from '../receipts/receiptService';
import { db } from '../../shared/firebase';
import { backupText } from '../profile/backupService';
import { backupFileName, oldBackups } from './googleApps';
import { googleAccessToken, googleFetch } from './googleAppsService';

// Backups in the person's own Google Drive, in a folder called "Xpences backups".
// With the drive.file permission Xpences only ever sees the folder and files it made itself.

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime';
const FOLDER_NAME = 'Xpences backups';
// The folder's name before the app was renamed (2026-11-09). It is renamed the first time it is found.
const OLD_FOLDER_NAME = 'XpenceX backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveBackup { id: string; name: string; createdTime: string; size?: string; locked: boolean }

const drive = (url: string, init?: RequestInit) => googleFetch('drive', url, init);

const findFolder = async (name: string): Promise<string | undefined> => {
  const q = `name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const found = await (await drive(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
  return found.files?.[0]?.id;
};

async function backupFolder(): Promise<string> {
  const current = await findFolder(FOLDER_NAME);
  if (current) return current;
  // Backups made before the rename: give their folder the new name, so they all stay together
  const old = await findFolder(OLD_FOLDER_NAME);
  if (old) {
    // If renaming fails, the backups still go to the old folder, and the rename is tried again next time
    await drive(`${API}/${old}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME }),
    }).catch(err => console.error('Could not rename the backup folder:', err));
    return old;
  }
  const made = await (await drive(`${API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  })).json();
  return made.id;
}

export async function listDriveBackups(): Promise<DriveBackup[]> {
  const folder = await backupFolder();
  const q = `'${folder}' in parents and trashed=false`;
  const res = await (await drive(`${API}?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime,size,appProperties)`)).json();
  return (res.files || []).map((f: any) => ({ id: f.id, name: f.name, createdTime: f.createdTime, size: f.size, locked: f.appProperties?.locked === 'true' }));
}

/**
 * Sends the file with XMLHttpRequest, because fetch can't report upload progress.
 * Gets a new Google token once if the old one stopped working.
 */
async function uploadWithProgress(body: string | Blob, contentType: string, onProgress: (part: number) => void) {
  const send = (token: string) => new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error('Drive upload failed'));
    xhr.send(body);
  });
  let status = await send(await googleAccessToken('drive'));
  if (status === 401) status = await send(await googleAccessToken('drive', true));
  if (status < 200 || status >= 300) throw new Error(`Drive upload error ${status}`);
  onProgress(1);
}

/**
 * Saves a backup to Drive, removes the oldest beyond the ones kept, and records the time.
 * `onProgress` gets 0 to 100 across every step, so a bar can fill smoothly.
 */
export async function backUpToDrive(uid: string, password?: string, onProgress: (percent: number) => void = () => {}): Promise<{ receiptsFailed: number }> {
  onProgress(5);
  const text = await backupText(uid, password); // reading everything takes the longest before the upload
  onProgress(35);
  const folder = await backupFolder();
  onProgress(45);
  const locked = !!password;
  const boundary = `xpencex${crypto.randomUUID().replace(/-/g, '')}`;
  const meta = { name: backupFileName(new Date(), locked), parents: [folder], mimeType: 'application/json', appProperties: { xpencex: 'backup', locked: String(locked) } };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  await uploadWithProgress(body, `multipart/related; boundary=${boundary}`, part => onProgress(45 + Math.round(part * 45)));

  // Not waited on: the backup is already safe in Drive
  updateDoc(doc(db, 'users', uid), { 'driveBackup.lastAt': new Date().toISOString() })
    .catch(err => console.error('Could not save the backup time:', err));

  try {
    for (const old of oldBackups(await listDriveBackups())) await drive(`${API}/${old.id}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Could not remove old Drive backups:', err);
  }

  // Receipts, when switched on: only the ones not in Drive yet. A receipt that fails doesn't stop the backup.
  let receiptsFailed = 0;
  if (await receiptsSwitchedOn(uid)) {
    try {
      receiptsFailed = await backUpReceipts(uid, folder, password, part => onProgress(90 + Math.round(part * 9)));
    } catch (err) {
      console.error('Could not back up receipts:', err);
      receiptsFailed = -1; // nothing could be checked
    }
  }
  onProgress(100);
  return { receiptsFailed };
}

// ---------------------------------------------------------------------------
// Receipts (src/features/receipts/receiptDrive.ts has the rules)
// ---------------------------------------------------------------------------

const RECEIPTS_FOLDER = 'Receipts';

async function receiptsSwitchedOn(uid: string) {
  try {
    return (await getDoc(doc(db, 'users', uid))).data()?.driveBackup?.receipts === true;
  } catch {
    return false;
  }
}

async function receiptsFolder(parent: string): Promise<string> {
  const q = `name='${RECEIPTS_FOLDER}' and mimeType='${FOLDER_MIME}' and '${parent}' in parents and trashed=false`;
  const found = await (await drive(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await (await drive(`${API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: RECEIPTS_FOLDER, mimeType: FOLDER_MIME, parents: [parent] }),
  })).json();
  return made.id;
}

/** The receipt files in Drive, from the details saved on each */
export async function listDriveReceipts(): Promise<DriveReceipt[]> {
  const folder = await receiptsFolder(await backupFolder());
  const out: DriveReceipt[] = [];
  let pageToken = '';
  do {
    const q = `'${folder}' in parents and trashed=false`;
    const res = await (await drive(`${API}?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(id,appProperties)${pageToken ? `&pageToken=${pageToken}` : ''}`)).json();
    for (const f of res.files || []) {
      const p = f.appProperties || {};
      if (p.xpences !== 'receipt' || !p.receiptId) continue;
      out.push({ fileId: f.id, receiptId: p.receiptId, locked: p.locked === 'true', type: p.type, source: p.source === 'chat' ? 'chat' : 'add' });
    }
    pageToken = res.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Sends the receipts that aren't in Drive yet. Returns how many could not be sent. */
async function backUpReceipts(uid: string, backups: string, password: string | undefined, onProgress: (part: number) => void): Promise<number> {
  const folder = await receiptsFolder(backups);
  const records = (await getDocs(query(collection(db, 'receipts'), where('uid', '==', uid)))).docs.map(d => ({ ...(d.data() as Receipt), id: d.id }));
  const locked = !!password;
  const todo = receiptsToBackUp(records, await listDriveReceipts(), locked);
  const lock = password ? await receiptLocker(password) : null;
  let failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    try {
      const blob = await openReceipt(r.id);
      const content: Blob = lock ? new Blob([await lock(new Uint8Array(await blob.arrayBuffer()))], { type: 'application/json' }) : blob;
      const boundary = `xpences${crypto.randomUUID().replace(/-/g, '')}`;
      const meta = {
        name: driveReceiptName(r, locked), parents: [folder],
        appProperties: { xpences: 'receipt', receiptId: r.id, locked: String(locked), type: r.type, source: r.source },
      };
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${lock ? 'application/json' : r.type}\r\n\r\n`,
        content,
        `\r\n--${boundary}--`,
      ]);
      await uploadWithProgress(body, `multipart/related; boundary=${boundary}`, () => {});
    } catch (err) {
      console.error('Could not back up receipt', r.id, err);
      failed++;
    }
    onProgress((i + 1) / todo.length);
  }
  return failed;
}

export interface ReceiptRestoreResult { restored: number; full: number; wrongPassword: number; failed: number }

/**
 * Brings back the receipts that the restored backup's expenses point to and the app doesn't have.
 * Stops adding at 100 (the rest count as `full`); locked ones that won't open with the password are skipped.
 */
export async function restoreReceiptsFromDrive(uid: string, links: { expenseId: string; receiptId: string }[], password?: string): Promise<ReceiptRestoreResult> {
  const result: ReceiptRestoreResult = { restored: 0, full: 0, wrongPassword: 0, failed: 0 };
  if (links.length === 0) return result;
  const appIds = new Set((await getDocs(query(collection(db, 'receipts'), where('uid', '==', uid)))).docs.map(d => d.id));
  const plan = receiptsToRestore(links, appIds, await listDriveReceipts());
  const unlock = password ? receiptUnlocker(password) : null;
  for (let i = 0; i < plan.length; i++) {
    const { expenseId, file } = plan[i];
    try {
      const res = await drive(`${API}/${file.fileId}?alt=media`);
      let blob: Blob;
      if (file.locked) {
        if (!unlock) { result.wrongPassword++; continue; }
        blob = new Blob([(await unlock(await res.text())) as BlobPart], { type: file.type });
      } else {
        blob = new Blob([await res.arrayBuffer()], { type: file.type });
      }
      await uploadReceipt(blob, { source: file.source, expenseId });
      result.restored++;
    } catch (err) {
      if (err instanceof ReceiptLockError) result.wrongPassword++;
      else if (err instanceof ReceiptError && err.code === 'full') { result.full = plan.length - i; break; }
      else { console.error('Could not restore receipt', file.receiptId, err); result.failed++; }
    }
  }
  return result;
}

export async function readDriveBackup(id: string): Promise<string> {
  return (await drive(`${API}/${id}?alt=media`)).text();
}

export async function deleteDriveBackup(id: string): Promise<void> {
  await drive(`${API}/${id}`, { method: 'DELETE' });
}
