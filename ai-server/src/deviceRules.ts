// Plain rules for devices and usernames. No server calls in here, so the app shares them and
// they can be tested.

const REQUEST_LIMIT_SECONDS = 120; // a refused device can ask again after this
export const OPEN_REQUESTS_LIMIT = 5; // waiting requests per account, so the queue can't be flooded
const PROOF_MAX_AGE_SECONDS = 3600; // generous, so a phone with a slightly wrong clock still works
const FRESH_SIGN_IN_SECONDS = 120;

export interface DeviceProof {
  x: string; // the device's public key
  y: string;
  signedAt: number; // milliseconds
  signature: string;
}

const toB64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

/** The text a device signs to prove it holds its secret key */
export const proofMessage = (uid: string, signedAt: number) => `${uid}.${signedAt}`;

/** Each account gets its own id for a device, so people sharing a phone are approved separately */
export async function deviceIdFor(uid: string, x: string, y: string) {
  return toB64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${uid}.${x}.${y}`)));
}

/** Checks the signature and returns the device's id, or null if the proof is wrong or too old */
export async function verifyDeviceProof(uid: string, proof: unknown, now = Date.now()): Promise<string | null> {
  const p = proof as Partial<DeviceProof> | null;
  if (!p || typeof p.x !== 'string' || typeof p.y !== 'string' || typeof p.signature !== 'string' || typeof p.signedAt !== 'number') return null;
  if (p.x.length > 100 || p.y.length > 100 || p.signature.length > 200) return null;
  if (Math.abs(now - p.signedAt) > PROOF_MAX_AGE_SECONDS * 1000) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.x, y: p.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(p.signature), new TextEncoder().encode(proofMessage(uid, p.signedAt)));
    return ok ? await deviceIdFor(uid, p.x, p.y) : null;
  } catch {
    return null;
  }
}

/** Fixed words only, so nothing a person typed can reach the admin's screen as a device name */
export function deviceLabelFrom(userAgent: string) {
  const ua = userAgent || '';
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const app = /; wv\)/.test(ua) ? 'App' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${device}, ${app}`;
}

/** Off only when the setting says exactly "false", so a typo keeps the safer behaviour */
export const firstDeviceNeedsApproval = (setting: string | undefined) => setting !== 'false';

export const canAskAgain = (decidedAt: string | undefined, now = Date.now()) =>
  !decidedAt || now - Date.parse(decidedAt) >= REQUEST_LIMIT_SECONDS * 1000;

/** The confirming sign-in must be through Google and must have happened just now */
export function isFreshGoogleSignIn(claims: Record<string, unknown>, now = Date.now()) {
  const provider = (claims.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  const authTime = typeof claims.auth_time === 'number' ? claims.auth_time : 0;
  return provider === 'google.com' && now / 1000 - authTime <= FRESH_SIGN_IN_SECONDS;
}

// ---------------------------------------------------------------------------
// Usernames
// ---------------------------------------------------------------------------
const RESERVED = ['admin', 'administrator', 'xpencex', 'support', 'help', 'moderator', 'official', 'system'];
const USERNAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.]{2,19}$/u;

export const cleanUsername = (name: unknown) => (typeof name === 'string' ? name.normalize('NFC').trim() : '');

/** Two usernames that differ only by capital letters count as the same one */
export const usernameKey = (name: string) => cleanUsername(name).toLowerCase();

export const isReservedUsername = (name: string) => RESERVED.includes(usernameKey(name));

/** 3 to 20 letters or numbers (any language), plus _ and . and no long numbers such as a phone number */
export const isValidUsername = (name: string) => USERNAME.test(name) && !/\p{N}{6,}/u.test(name) && !isReservedUsername(name);
