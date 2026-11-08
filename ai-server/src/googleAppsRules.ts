// Plain rules for the Google apps a user links (Drive, Sheets). No network calls, so they can be tested.

export const GOOGLE_APPS = ['drive', 'sheets'] as const;
export type GoogleApp = (typeof GOOGLE_APPS)[number];

// One permission covers both apps: XpenceX can see and change only the files it created itself,
// never the rest of the person's Drive. Google counts it as a low-risk ("non-sensitive") scope.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const isGoogleApp = (v: unknown): v is GoogleApp => typeof v === 'string' && (GOOGLE_APPS as readonly string[]).includes(v);

/** Whether Google really gave the Drive permission (the person can untick it on Google's screen) */
export const grantedDriveFile = (scope: unknown) => typeof scope === 'string' && scope.split(' ').includes(DRIVE_FILE_SCOPE);

/**
 * The email inside the id_token from Google's token reply. That reply comes straight from Google
 * over HTTPS, so its contents can be trusted without checking the signature again.
 */
export function idTokenEmail(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const part = idToken.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return json.email_verified !== false && typeof json.email === 'string' ? json.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Only the Google account the person signed in to XpenceX with may be linked */
export const sameAccount = (linkedEmail: string | null, accountEmail: string | undefined) =>
  !!linkedEmail && !!accountEmail && linkedEmail === accountEmail.toLowerCase();

/** The apps switched on after a change; when none is left, the whole link is removed */
export function appsAfter(current: Record<GoogleApp, boolean>, app: GoogleApp, on: boolean): Record<GoogleApp, boolean> {
  return { ...current, [app]: on };
}
export const anyOn = (apps: Record<GoogleApp, boolean>) => GOOGLE_APPS.some((a) => apps[a]);

// ---------------------------------------------------------------------------
// The refresh token is kept locked (AES-GCM) with a key only the server has (GOOGLE_TOKEN_KEY),
// so someone looking at the database in Firebase Console can't use it.
// ---------------------------------------------------------------------------
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(base64Key: string) {
  const raw = fromB64(base64Key);
  if (raw.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function lockToken(token: string, base64Key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(base64Key), new TextEncoder().encode(token)));
  return `${toB64(iv)}.${toB64(sealed)}`;
}

export async function unlockToken(locked: string, base64Key: string): Promise<string> {
  const [iv, data] = locked.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await keyFrom(base64Key), fromB64(data));
  return new TextDecoder().decode(plain);
}
