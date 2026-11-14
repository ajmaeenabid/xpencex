import { isNative } from '../../shared/lib/nativeApp';

// Fingerprint (or face) unlock for the PIN lock (chosen 2026-11-11): only after a PIN is set, asked first on the
// lock screen, with the PIN always there as a backup. Uses the phone's own unlock (Capgo Native Biometric).
// Whether it is on is kept on this phone only, like the PIN.

const key = (uid: string) => `xpences-fingerprint:${uid}`;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): Store | null {
  try { return localStorage; } catch { return null; }
}

export const fingerprintOn = (uid: string, store: Store | null = safeStorage()) => {
  try { return store?.getItem(key(uid)) === '1'; } catch { return false; }
};

export const setFingerprintOn = (uid: string, on: boolean, store: Store | null = safeStorage()) => {
  try { if (on) store?.setItem(key(uid), '1'); else store?.removeItem(key(uid)); } catch { /* stays as it was */ }
};

const plugin = async () => (await import('@capgo/capacitor-native-biometric')).NativeBiometric;

/** Whether this phone has a fingerprint or face unlock set up */
export async function fingerprintAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await (await plugin()).isAvailable()).isAvailable;
  } catch {
    return false;
  }
}

/** Shows the phone's fingerprint prompt. True only when it matched. */
export async function verifyFingerprint(texts: { title: string; subtitle: string; cancel: string }): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await (await plugin()).verifyIdentity({ title: texts.title, subtitle: texts.subtitle, negativeButtonText: texts.cancel, maxAttempts: 3 });
    return true;
  } catch {
    return false; // cancelled, too many tries, or not set up: the PIN still works
  }
}
