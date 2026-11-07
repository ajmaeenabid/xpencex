import { DurableObject } from 'cloudflare:workers';
import { handleAdmin, handleDeleteAccount } from './admin';
import { deviceIsApproved, handleDevice, handleUsername } from './devices';
import { processDueLoans } from './loans';
import { refreshRates } from './rates';
import { google } from './google';
import { handleLive } from './live';
import { bdDay } from './loanDates';
import { LIMIT_KINDS, LimitKind, MAX_BODY_BYTES, classifyParts, dailyLimits, firstBlocked, limitsView } from './usage';

interface Env {
  GEMINI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  DAILY_LIMIT: string;
  DAILY_VOICE_LIMIT?: string;
  DAILY_FILE_LIMIT?: string;
  DAILY_LIVE_LIMIT?: string;
  LIVE_MODEL?: string;
  LIVE_SECONDS?: string;
  ALLOWED_ORIGINS: string;
  ADMIN_UIDS?: string;
  REQUIRE_FIRST_DEVICE_APPROVAL?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  LIMITER: DurableObjectNamespace<UsageLimiter>;
}

const MODEL = 'gemini-3.1-flash-lite'; // Google lists its earliest shutdown as May 7, 2027
// Tried in order when MODEL is still busy after a retry, retired, or out of free quota. Each runs on
// separate capacity. The last one is Google's "latest" alias, which keeps pointing at a current model
// even after the named ones are retired.
const BACKUP_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
// Busy (5xx), retired (404) or out of quota (429): another model may still answer
const tryNextModel = (status: number) => status >= 500 || status === 404 || status === 429;

// ---------------------------------------------------------------------------
// Per-user daily counter. One instance per user, so counts never mix.
// ---------------------------------------------------------------------------
export class UsageLimiter extends DurableObject<Env> {
  private async read(kind: LimitKind, day: string): Promise<number> {
    const stored = await this.ctx.storage.get<{ day: string; count: number }>(`usage:${kind}`);
    return stored?.day === day ? stored.count : 0;
  }

  /** How much of each limit is used today (Bangladesh time) */
  async counts(): Promise<Record<LimitKind, number>> {
    const day = bdDay();
    const used = {} as Record<LimitKind, number>;
    for (const kind of LIMIT_KINDS) used[kind] = await this.read(kind, day);
    return used;
  }

  /** Uses one of each kind, or none of them when any has nothing left. Returns the kind that was full. */
  async take(kinds: LimitKind[], limits: Record<LimitKind, number>): Promise<{ blocked: LimitKind | null; used: Record<LimitKind, number> }> {
    const day = bdDay();
    const used = await this.counts();
    const blocked = firstBlocked(kinds, limits, used);
    if (blocked) return { blocked, used };
    for (const kind of kinds) {
      used[kind] += 1;
      await this.ctx.storage.put(`usage:${kind}`, { day, count: used[kind] });
    }
    return { blocked: null, used };
  }

  // Give requests back when Gemini failed, so an outage doesn't use up the user's day
  async refund(kinds: LimitKind[]): Promise<void> {
    const day = bdDay();
    for (const kind of kinds) {
      const count = await this.read(kind, day);
      if (count > 0) await this.ctx.storage.put(`usage:${kind}`, { day, count: count - 1 });
    }
  }

  // Called when the admin deletes the user
  async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

// ---------------------------------------------------------------------------
// Firebase login check: the app sends the user's ID token, we verify its signature
// against Google's public keys and return the user's id and claims.
// ---------------------------------------------------------------------------
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache: { keys: (JsonWebKey & { kid: string })[]; expires: number } | null = null;

async function getKeys() {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  jwksCache = { keys: data.keys, expires: Date.now() + 60 * 60 * 1000 };
  return data.keys;
}

function b64urlToBytes(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

type Verified = { uid: string; claims: Record<string, unknown> };

async function verifyFirebaseToken(token: string, projectId: string): Promise<Verified | null> {
  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = decodeJson(h);
    const payload = decodeJson(p);
    if (header.alg !== 'RS256') return null;

    const jwk = (await getKeys()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    return typeof payload.sub === 'string' && payload.sub ? { uid: payload.sub, claims: payload } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const isPart = (p: any) =>
  p && (typeof p.text === 'string' || (typeof p.inlineData?.data === 'string' && typeof p.inlineData?.mimeType === 'string'));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const limits = dailyLimits(env);
    const limiterFor = (uid: string) => env.LIMITER.get(env.LIMITER.idFromName(uid));

    // Live chat is a lasting two-way connection, so its login arrives as the first message instead of a header
    if (path === '/live' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
      if (!allowed.includes(request.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403 });
      return handleLive(env, {
        signIn: async (token) => {
          const verified = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
          if (!verified) return { error: 'auth' };
          return (await deviceIsApproved(verified.uid, verified.claims, env)) ? { uid: verified.uid } : { error: 'device' };
        },
        take: async (uid) => {
          const { blocked, used } = await limiterFor(uid).take(['live'], limits);
          return blocked ? null : limitsView(limits, used);
        },
        refund: (uid) => limiterFor(uid).refund(['live']),
      });
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const verified = token ? await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID) : null;
    if (!verified) return json({ error: 'Please sign in again.' }, 401);
    const { uid, claims } = verified;

    // The routes for accounts and devices, as opposed to the AI and loan routes below
    const isAccountRoute = path.startsWith('/device/') || path.startsWith('/admin/') || path === '/account/username' || path === '/account/delete';
    let body: Record<string, unknown> = {};
    if (isAccountRoute) {
      try {
        body = ((await request.json()) as Record<string, unknown>) || {};
      } catch {
        // no body is fine for /admin/me and /admin/users
      }
    }

    try {
      // A device that isn't approved can only do these two things
      if (path.startsWith('/device/')) return await handleDevice(path, uid, body, request.headers.get('User-Agent') || '', env, json);
      if (path === '/account/username') return await handleUsername(uid, claims, body, env, json);

      if (!(await deviceIsApproved(uid, claims, env))) return json({ error: 'This device is not approved.', device: true }, 403);

      const clearLimiter = (id: string) => env.LIMITER.get(env.LIMITER.idFromName(id)).clear();
      // A separate, fresh Google sign-in that proves the person is here right now. It must be this same user.
      const verifyGoogle = async (googleToken: unknown) => {
        const fresh = typeof googleToken === 'string' ? await verifyFirebaseToken(googleToken, env.FIREBASE_PROJECT_ID) : null;
        return fresh?.uid === uid ? fresh.claims : null;
      };
      if (path === '/account/delete') return await handleDeleteAccount(uid, body, env, json, clearLimiter, verifyGoogle);
      if (path.startsWith('/admin/')) return await handleAdmin(path, uid, claims, body, env, json, clearLimiter, verifyGoogle);
    } catch (err) {
      console.error('Account route failed', path, err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }

    // The app shows how much of each daily limit is left
    if (path === '/limits') return json({ limits: limitsView(limits, await limiterFor(uid).counts()) });

    // The app asks for this user's due loan installments to be taken when it opens (the hourly cron does everyone)
    if (path === '/loans/process') {
      if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ taken: 0 });
      try {
        return json({ taken: await processDueLoans(google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID), uid) });
      } catch (err) {
        console.error('Loan processing failed', err);
        return json({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }
    // The app asks for this when its saved rates are missing or older than 10 days (the hourly cron also checks)
    if (path === '/rates/refresh') {
      if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ updated: false });
      try {
        return json({ updated: await refreshRates(google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID)) });
      } catch (err) {
        console.error('Rate refresh failed', err);
        return json({ error: 'Could not update exchange rates.' }, 502);
      }
    }
    if (path !== '/') return json({ error: 'Not found.' }, 404);

    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY_BYTES) return json({ error: 'That file is too large.' }, 413);

    let parts: unknown;
    let schema: unknown;
    try {
      ({ parts, schema } = (await request.json()) as { parts: unknown; schema?: unknown });
    } catch {
      return json({ error: 'Bad request.' }, 400);
    }
    if (!Array.isArray(parts) || parts.length === 0 || parts.length > 4 || !parts.every(isPart)) {
      return json({ error: 'Bad request.' }, 400);
    }
    // Optional reply template from the app; kept small so it can't be abused to send huge requests
    if (schema !== undefined && (typeof schema !== 'object' || schema === null || JSON.stringify(schema).length > 4000)) {
      return json({ error: 'Bad request.' }, 400);
    }

    const media = classifyParts(parts);
    if (media.error) return json({ error: media.error }, 400);

    // A voice message or file uses its own daily limit and one of the daily AI requests too
    const kinds: LimitKind[] = media.kind ? [media.kind, 'ai'] : ['ai'];
    const limiter = limiterFor(uid);
    const { blocked, used } = await limiter.take(kinds, limits);
    if (blocked) {
      const reached = { ai: 'Daily AI limit reached.', voice: "You've used today's voice messages.", file: "You've used today's file uploads.", live: "You've used today's live chats." }[blocked];
      return json({ error: `${reached} It resets at midnight.`, limits: limitsView(limits, used) }, 429);
    }

    const callGemini = (model: string) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(schema ? { responseSchema: schema } : {}),
          },
        }),
      });

    let res = await callGemini(MODEL);
    let model = MODEL;
    // Gemini is sometimes briefly overloaded (5xx). One quick retry usually gets through;
    // if not, the backup models are tried in turn and the app tells the user which one answered
    if (res.status >= 500) {
      console.error('Gemini error, retrying once', res.status);
      await new Promise((r) => setTimeout(r, 1000));
      res = await callGemini(MODEL);
    }
    for (const next of BACKUP_MODELS) {
      if (!tryNextModel(res.status)) break;
      console.error(`${model} failed (${res.status}), switching to ${next}`, await res.text());
      model = next;
      res = await callGemini(model);
    }
    if (!res.ok) {
      console.error('Gemini error', model, res.status, await res.text());
      await limiter.refund(kinds);
      // These messages are shown in the chat, so they say what happened in plain words
      if (res.status === 429) return json({ error: 'Every AI model has used up its free quota for now. Please try again later.' }, 503);
      if (res.status >= 500) return json({ error: 'All AI models are busy on the server right now. Please try again in a minute.' }, 503);
      if (res.status === 404) return json({ error: 'The AI models this app uses are no longer available. The app needs an update.' }, 502);
      return json({ error: `The AI returned an error (code ${res.status}). Please try again.` }, 502);
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return json({ text, limits: limitsView(limits, used), ...(model !== MODEL ? { model } : {}) });
  },

  // Runs on the schedule in wrangler.toml: takes every user's loan installments that have come due,
  // and refreshes exchange rates once they are 10 days old
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return;
    const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);
    ctx.waitUntil(
      processDueLoans(g)
        .then((taken) => { if (taken) console.log(`Took ${taken} loan installments`); })
        .catch((err) => console.error('Scheduled loan processing failed', err)),
    );
    ctx.waitUntil(
      refreshRates(g)
        .then((updated) => { if (updated) console.log('Exchange rates updated'); })
        .catch((err) => console.error('Scheduled rate refresh failed', err)),
    );
  },
};
