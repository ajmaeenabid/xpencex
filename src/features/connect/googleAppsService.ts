import { useEffect, useState } from 'react';
import { callWorker, WorkerError } from '../../shared/lib/workerApi';
import { WrongGoogleAccountError, googleAppsCode } from '../auth/googleSignIn';
import { GoogleApp } from './googleApps';

// Linking and using Google apps. The AI server keeps the lasting permission (ai-server/src/googleApps.ts);
// this side asks for a one-hour access token when it backs up or exports, and talks to Google directly.

// openid + email let the server check it is the same Google account. drive.file lets Xpences see and
// change only the files it made itself (backups and exported sheets), never anything else in Drive.
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';

export interface GoogleAppsStatus {
  linked: boolean;
  email: string | null;
  apps: Record<GoogleApp, boolean>;
  notSetUp?: boolean; // the server has no Google keys yet
}

export class GoogleNoPermissionError extends Error {}
export class GoogleNotLinkedError extends Error {}

const EMPTY: GoogleAppsStatus = { linked: false, email: null, apps: { drive: false, sheets: false } };

// One shared copy of the status, so every screen agrees after a link or unlink
let status: GoogleAppsStatus | null = null;
let loading: Promise<GoogleAppsStatus> | null = null;
const listeners = new Set<(s: GoogleAppsStatus) => void>();
const tokens = new Map<GoogleApp, { token: string; until: number }>();

function setStatus(next: GoogleAppsStatus) {
  status = next;
  // A switched-off app must not keep using a token it got earlier
  (Object.keys(next.apps) as GoogleApp[]).forEach(a => { if (!next.apps[a]) tokens.delete(a); });
  listeners.forEach(fn => fn(next));
}

export function loadGoogleApps(force = false): Promise<GoogleAppsStatus> {
  if (status && !force) return Promise.resolve(status);
  loading ??= callWorker<GoogleAppsStatus>('/google/status')
    .then(s => { setStatus({ ...EMPTY, ...s }); return status!; })
    .catch(err => {
      if (err instanceof WorkerError && err.status === 503) { setStatus({ ...EMPTY, notSetUp: true }); return status!; }
      throw err;
    })
    .finally(() => { loading = null; });
  return loading;
}

/** The link status, loaded once and kept up to date */
export function useGoogleApps() {
  const [current, setCurrent] = useState<GoogleAppsStatus | null>(status);
  const [error, setError] = useState(false);
  useEffect(() => {
    listeners.add(setCurrent);
    loadGoogleApps().then(setCurrent, () => setError(true));
    return () => { listeners.delete(setCurrent); };
  }, []);
  return { status: current, error, retry: () => { setError(false); loadGoogleApps(true).then(setCurrent, () => setError(true)); } };
}

const reason = (err: unknown) => (err instanceof WorkerError ? err.message : '');

/** Links an app. Opens Google's permission screen only when Google isn't linked yet. */
export async function linkGoogleApp(app: GoogleApp, attempt = 0): Promise<GoogleAppsStatus> {
  try {
    // Already linked for the other app: the same permission is switched on for this one
    if (attempt === 0 && status?.linked) {
      const next = await callWorker<GoogleAppsStatus>('/google/link', { app });
      setStatus({ ...EMPTY, ...next });
      return status!;
    }
    const { code, native } = await googleAppsCode(SCOPE);
    const next = await callWorker<GoogleAppsStatus>('/google/link', { app, code, native });
    setStatus({ ...EMPTY, ...next });
    return status!;
  } catch (err) {
    const why = reason(err);
    if (why === 'needsCode' && attempt === 0) return linkGoogleApp(app, 1);
    // Google sent no lasting permission; the server reset it, so asking once more gets one
    if (why === 'retry' && attempt < 2) return linkGoogleApp(app, attempt + 1);
    if (why === 'wrongAccount') throw new WrongGoogleAccountError();
    if (why === 'noPermission') throw new GoogleNoPermissionError();
    throw err;
  }
}

export async function unlinkGoogleApp(app: GoogleApp): Promise<GoogleAppsStatus> {
  const next = await callWorker<GoogleAppsStatus>('/google/unlink', { app });
  setStatus({ ...EMPTY, ...next });
  return status!;
}

/** A Google access token for one app, reused until shortly before it runs out */
export async function googleAccessToken(app: GoogleApp, fresh = false): Promise<string> {
  const kept = tokens.get(app);
  if (!fresh && kept && kept.until > Date.now()) return kept.token;
  try {
    const { accessToken, expiresIn } = await callWorker<{ accessToken: string; expiresIn: number }>('/google/token', { app });
    tokens.set(app, { token: accessToken, until: Date.now() + (expiresIn - 120) * 1000 });
    return accessToken;
  } catch (err) {
    if (reason(err) === 'notLinked') {
      loadGoogleApps(true).catch(() => {});
      throw new GoogleNotLinkedError();
    }
    throw err;
  }
}

/** Calls a Google API for an app, getting a new token once if the old one stopped working */
export async function googleFetch(app: GoogleApp, url: string, init: RequestInit = {}): Promise<Response> {
  const go = async (fresh: boolean) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${await googleAccessToken(app, fresh)}` },
  });
  let res = await go(false);
  if (res.status === 401) res = await go(true);
  if (!res.ok) throw new Error(`Google ${app} error ${res.status}: ${await res.text().catch(() => '')}`);
  return res;
}
