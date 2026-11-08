import { google } from './google';
import type { AdminEnv } from './admin';
import { GoogleApp, GOOGLE_APPS, anyOn, appsAfter, grantedDriveFile, idTokenEmail, isGoogleApp, lockToken, sameAccount, unlockToken } from './googleAppsRules';

// ---------------------------------------------------------------------------
// Google apps a user links to their XpenceX account (Drive for backups, Sheets for exports).
//
// 1. The app asks Google for a one-time code (Google's own pop-up, or a native plugin in the phone app).
// 2. /google/link swaps the code for a long-lasting refresh token, checks it is the same Google account
//    the person signed in with, and keeps it locked in googleLinks/{uid}. Only this server reads that
//    collection (firestore.rules), and the token is encrypted with GOOGLE_TOKEN_KEY.
// 3. /google/token gives the app a one-hour access token when it backs up or exports. The app then
//    talks to Drive and Sheets itself, so this server never sees the person's money records.
// 4. Unlinking both apps (or deleting the account) revokes the token at Google and removes it.
// ---------------------------------------------------------------------------

export interface GoogleAppsEnv extends AdminEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEY?: string;
}

type Json = (body: unknown, status?: number) => Response;
type G = ReturnType<typeof google>;
const COLLECTION = 'googleLinks';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const ready = (env: GoogleAppsEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_KEY && env.FIREBASE_SERVICE_ACCOUNT);

const appsOf = (doc: Record<string, string> | null): Record<GoogleApp, boolean> =>
  Object.fromEntries(GOOGLE_APPS.map((a) => [a, doc?.[a] === 'true'])) as Record<GoogleApp, boolean>;

const view = (doc: Record<string, string> | null) => ({ linked: !!doc, email: doc?.email || null, apps: appsOf(doc) });

async function tokenCall(env: GoogleAppsEnv, params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Tells Google to forget the permission. Failing is fine: the token is deleted here either way. */
const revoke = (token: string) =>
  fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);

async function save(g: G, uid: string, email: string, lockedToken: string, apps: Record<GoogleApp, boolean>, linkedAt: string) {
  await g.setDoc(COLLECTION, uid, {
    uid, email, token: lockedToken, linkedAt,
    ...Object.fromEntries(GOOGLE_APPS.map((a) => [a, String(apps[a])])),
  });
}

/** Removes the link and revokes it at Google. Also used when an account is deleted. */
export async function forgetGoogleLink(env: GoogleAppsEnv, uid: string) {
  if (!ready(env)) return;
  const g = google(env.FIREBASE_SERVICE_ACCOUNT!, env.FIREBASE_PROJECT_ID);
  const doc = await g.getDoc(COLLECTION, uid);
  if (!doc) return;
  try { await revoke(await unlockToken(doc.token, env.GOOGLE_TOKEN_KEY!)); } catch { /* deleted below anyway */ }
  await g.deleteDoc(COLLECTION, uid);
}

export async function handleGoogleApps(path: string, uid: string, body: Record<string, unknown>, env: GoogleAppsEnv, json: Json) {
  if (!ready(env)) return json({ error: 'Google apps are not set up on the server yet.', notSetUp: true }, 503);
  const g = google(env.FIREBASE_SERVICE_ACCOUNT!, env.FIREBASE_PROJECT_ID);
  const doc = await g.getDoc(COLLECTION, uid);

  if (path === '/google/status') return json(view(doc));

  const app = body.app;
  if (!isGoogleApp(app)) return json({ error: 'Bad request.' }, 400);

  // Link an app. With a code: first link (or a fresh one). Without: the other app is already linked,
  // so the same permission is simply switched on for this one.
  if (path === '/google/link') {
    if (typeof body.code !== 'string' || !body.code) {
      if (!doc) return json({ error: 'needsCode', needsCode: true }, 409);
      await save(g, uid, doc.email, doc.token, appsAfter(appsOf(doc), app, true), doc.linkedAt);
      return json(view({ ...doc, [app]: 'true' }));
    }

    // 'postmessage' is what Google's pop-up uses; the phone app's native plugin sends none
    const { ok, data } = await tokenCall(env, {
      code: body.code,
      grant_type: 'authorization_code',
      ...(body.native !== true && { redirect_uri: 'postmessage' }),
    });
    if (!ok || typeof data.access_token !== 'string') {
      // e.g. invalid_client (wrong client secret), redirect_uri_mismatch, invalid_grant (code already used)
      console.error('Google code swap failed', data.error, data.error_description);
      return json({ error: 'Google did not accept the code. Please try again.', google: data.error }, 400);
    }

    const user = await g.getUser(uid);
    if (!sameAccount(idTokenEmail(data.id_token), user?.email)) {
      await revoke(data.access_token);
      return json({ error: 'wrongAccount', wrongAccount: true }, 400);
    }
    if (!grantedDriveFile(data.scope)) {
      await revoke(data.access_token);
      return json({ error: 'noPermission', noPermission: true }, 400);
    }

    // Google only sends a refresh token the first time. Without one (and none kept), revoking resets
    // the permission so the next try gets one; the app retries once by itself.
    let locked = doc?.token;
    if (typeof data.refresh_token === 'string') locked = await lockToken(data.refresh_token, env.GOOGLE_TOKEN_KEY!);
    if (!locked) {
      await revoke(data.access_token);
      return json({ error: 'retry', retry: true }, 409);
    }

    const apps = appsAfter(appsOf(doc), app, true);
    const email = user!.email!.toLowerCase();
    await save(g, uid, email, locked, apps, doc?.linkedAt || new Date().toISOString());
    return json({ ...view({ email, ...Object.fromEntries(GOOGLE_APPS.map((a) => [a, String(apps[a])])) } as Record<string, string>), linked: true });
  }

  if (path === '/google/unlink') {
    if (!doc) return json(view(null));
    const apps = appsAfter(appsOf(doc), app, false);
    if (anyOn(apps)) {
      await save(g, uid, doc.email, doc.token, apps, doc.linkedAt);
      return json(view({ ...doc, [app]: 'false' }));
    }
    await forgetGoogleLink(env, uid);
    return json(view(null));
  }

  // A one-hour access token for an app that is switched on
  if (path === '/google/token') {
    if (!doc || !appsOf(doc)[app]) return json({ error: 'notLinked', notLinked: true }, 409);
    let refresh: string;
    try {
      refresh = await unlockToken(doc.token, env.GOOGLE_TOKEN_KEY!);
    } catch {
      await g.deleteDoc(COLLECTION, uid);
      return json({ error: 'notLinked', notLinked: true }, 409);
    }
    const { ok, data } = await tokenCall(env, { refresh_token: refresh, grant_type: 'refresh_token' });
    if (!ok || typeof data.access_token !== 'string') {
      // The person removed XpenceX in their Google account settings: start over
      if (data.error === 'invalid_grant') {
        await g.deleteDoc(COLLECTION, uid);
        return json({ error: 'notLinked', notLinked: true }, 409);
      }
      console.error('Google token refresh failed', data.error, data.error_description);
      return json({ error: 'Google is not answering. Please try again.' }, 502);
    }
    return json({ accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 });
  }

  return json({ error: 'Not found.' }, 404);
}
