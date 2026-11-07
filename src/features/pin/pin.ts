import { toAsciiDigits } from '../../shared/lib/sensitiveData';

// The optional PIN, kept per account on this phone. Only a salted, scrambled copy is saved. It is a
// lock screen for someone holding an unlocked phone; the data itself is protected by the Google
// sign-in, the device approval and firestore.rules.

export const PIN_LENGTH = 6;
export const MAX_PIN_TRIES = 5;
export const BACKGROUND_LOCK_SECONDS = 20;
const ITERATIONS = 150_000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// localStorage can be blocked, and then the app simply has no PIN
const safeStorage = (): KeyValueStore | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

interface SavedPin {
  salt: string;
  hash: string;
  fails: number;
}

const key = (uid: string) => `xpencex.pin.${uid}`;
const toHex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes as ArrayBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) || [], h => parseInt(h, 16));

export const cleanPin = (input: string) => toAsciiDigits(input).replace(/\D/g, '').slice(0, PIN_LENGTH);
export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

async function scramble(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, material, 256));
}

function read(uid: string, store: KeyValueStore | null): SavedPin | null {
  try {
    const saved = store?.getItem(key(uid));
    return saved ? (JSON.parse(saved) as SavedPin) : null;
  } catch {
    return null;
  }
}

export const hasPin = (uid: string, store = safeStorage()) => !!read(uid, store);

export const triesLeft = (uid: string, store = safeStorage()) => MAX_PIN_TRIES - (read(uid, store)?.fails || 0);

export async function savePin(uid: string, pin: string, store = safeStorage()) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  store?.setItem(key(uid), JSON.stringify({ salt: toHex(salt), hash: await scramble(pin, salt), fails: 0 } satisfies SavedPin));
  markUnlocked(uid);
}

export const removePin = (uid: string, store = safeStorage()) => store?.removeItem(key(uid));

/** 'blocked' means the last try was used up: the PIN is gone and the person must sign in with Google again */
export async function checkPin(uid: string, pin: string, store = safeStorage()): Promise<'ok' | 'wrong' | 'blocked'> {
  const saved = read(uid, store);
  if (!saved) return 'blocked';
  // Count the try first, so closing the app mid-check doesn't give a free guess
  const fails = saved.fails + 1;
  store?.setItem(key(uid), JSON.stringify({ ...saved, fails }));
  if ((await scramble(pin, fromHex(saved.salt))) === saved.hash) {
    store?.setItem(key(uid), JSON.stringify({ ...saved, fails: 0 }));
    return 'ok';
  }
  if (fails >= MAX_PIN_TRIES) {
    removePin(uid, store);
    return 'blocked';
  }
  return 'wrong';
}

// Kept only in memory, so a restart or reload always asks again
let unlockedFor: string | null = null;

export function markUnlocked(uid: string) {
  unlockedFor = uid;
}

export function lockPin() {
  unlockedFor = null;
}

export const isPinLocked = (uid: string, store = safeStorage()) => hasPin(uid, store) && unlockedFor !== uid;

export const awayTooLong = (hiddenAt: number | null, now = Date.now()) =>
  hiddenAt !== null && now - hiddenAt >= BACKGROUND_LOCK_SECONDS * 1000;
