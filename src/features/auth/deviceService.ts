import { signInWithCustomToken, signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase';
import { WorkerError, callWorker } from '../../shared/lib/workerApi';
import { DeviceProof, proofMessage } from '../../../ai-server/src/deviceRules';
import { savedLoginClaims } from './savedLogin';
import { forgetNativeGoogle } from './googleSignIn';
import { forgetAllReceiptCopies } from '../receipts/receiptService';
import { clearReminders } from '../reminders/reminderService';
import { clearWidget } from '../widget/widget';

// How this device gets permission to use the account. The rules are on the server (ai-server/src/devices.ts).

// paused: the admin suspended the account, so the app signs out and says so
export type DeviceStatus = 'approved' | 'pending' | 'new' | 'refused' | 'needsUsername' | 'paused' | 'offline';

const DB_NAME = 'xpencex-device';
const STORE = 'keys';

function openKeyStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const inStore = <T,>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** This device's secret key. It can be used here but can't be copied out, even by this app. */
async function deviceKey(): Promise<CryptoKeyPair> {
  const db = await openKeyStore();
  try {
    const saved = await inStore<CryptoKeyPair | undefined>(db, 'readonly', s => s.get('device'));
    if (saved) return saved;
    const made = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await inStore(db, 'readwrite', s => s.put(made, 'device'));
    return made;
  } finally {
    db.close();
  }
}

const toB64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function deviceProof(uid: string): Promise<DeviceProof> {
  const key = await deviceKey();
  const { x, y } = await crypto.subtle.exportKey('jwk', key.publicKey);
  const signedAt = Date.now();
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(proofMessage(uid, signedAt)));
  return { x: x!, y: y!, signedAt, signature: toB64url(signature) };
}

type DeviceReply = { status: Exclude<DeviceStatus, 'offline'>; deviceId?: string; token?: string };

async function ask(path: string): Promise<DeviceStatus> {
  const user = auth.currentUser;
  if (!user) return 'offline';
  const reply = await callWorker<DeviceReply>(path, { proof: await deviceProof(user.uid) });
  // An approved device's login must carry its pass. Keep the current one if it is already right.
  if (reply.status === 'approved') {
    const { claims } = await user.getIdTokenResult();
    if (claims.deviceId !== reply.deviceId) await signInWithCustomToken(auth, reply.token!);
  }
  return reply.status;
}

/** Called whenever the app opens. Asks the server where this device stands, and gets its pass if approved. */
export async function openDevice(): Promise<DeviceStatus> {
  try {
    return await ask('/device/open');
  } catch (err) {
    console.error('Device check failed:', err);
    // The server can't be reached. A device that already has a pass carries on: firestore.rules
    // still decide what it can read, and saved data stays usable offline. Renewing the login needs
    // the internet, so when that fails too, the pass is read from the login saved on this phone.
    const user = auth.currentUser;
    const claims = await user?.getIdTokenResult().then(r => r.claims as Record<string, unknown>)
      .catch(() => savedLoginClaims(user.toJSON(), user.uid));
    return claims?.deviceId ? 'approved' : 'offline';
  }
}

export const askForDevice = () => ask('/device/request');

/** Saves the username on the server, which keeps names unique. Throws 'taken' or 'invalid' as a WorkerError. */
export const saveUsername = (username: string) => callWorker<{ username: string }>('/account/username', { username });

export const usernameWasTaken = (err: unknown) => err instanceof WorkerError && err.status === 409;

// Why the phone was signed out, shown once on the login page ('1' is the older way of saying removed)
const SIGN_OUT_NOTE = 'xpencex.deviceRemoved';
export type SignOutNote = 'removed' | 'paused';

/** Signs out and removes this account's saved copy of the data from this device. */
export async function signOutAndForget({ note }: { note?: SignOutNote } = {}) {
  try {
    if (note) localStorage.setItem(SIGN_OUT_NOTE, note);
    sessionStorage.clear();
  } catch {
    // storage can be blocked; signing out still works
  }
  await signOut(auth);
  await forgetAllReceiptCopies();
  await clearReminders();
  await clearWidget();
  // In the phone app, let Google's account picker show again next time
  await forgetNativeGoogle();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.error('Could not clear saved data:', err);
  }
  window.location.reload();
}

/** Why this phone was just signed out (removed or paused by the admin), once, on the login page */
export function takeSignOutNote(): SignOutNote | null {
  try {
    const note = localStorage.getItem(SIGN_OUT_NOTE);
    localStorage.removeItem(SIGN_OUT_NOTE);
    return note === 'paused' ? 'paused' : note ? 'removed' : null;
  } catch {
    return null;
  }
}

/** The note for a device status that ends the session (anything but approved or offline) */
export const signOutNoteFor = (status: DeviceStatus): SignOutNote => (status === 'paused' ? 'paused' : 'removed');
