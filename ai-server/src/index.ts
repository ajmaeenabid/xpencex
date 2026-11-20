import { DurableObject } from 'cloudflare:workers';
import { handleAdmin, handleDeleteAccount } from './admin';
import { deviceIsApproved, handleDevice, handleUsername } from './devices';
import { processDueLoans } from './loans';
import { refreshRates } from './rates';
import { google } from './google';
import { handleLive } from './live';
import { verifyFirebaseToken } from './auth';
import { recordRun } from './health';
import { handleRestoreLoans } from './restore';
import { forgetGoogleLink, handleGoogleApps } from './googleApps';
import { bdDay } from './loanDates';
import { deleteUserReceipts, handleReceipts } from './receipts';
import { cutoffFor, deleteErrorReports, handleErrorReport } from './errorReports';
import { DAY_FULL_MESSAGE, DayCount, LIMIT_KINDS, LimitKind, MAX_AUDIO_BYTES, MAX_BODY_BYTES, MinuteWindow, TOO_FAST_MESSAGE, base64Bytes, checkRequest, classifyParts, dailyLimits, firstBlocked, limitsView, requestLimits } from './usage';
import { answer } from './providers';
import { withSafetyHeaders } from './safety';
import { countActivity } from './activity';
import { transcribe } from './transcribe';

interface Env {
  GEMINI_API_KEY: string;
  // The other AI services (src/providers.ts). Each one is skipped while its key or binding is missing.
  GROQ_API_KEY?: string;
  GROQ_MODELS?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: string;
  CLOUDFLARE_AI_MODEL?: string;
  AI?: Ai;
  FIREBASE_PROJECT_ID: string;
  DAILY_LIMIT: string;
  DAILY_VOICE_LIMIT?: string;
  DAILY_FILE_LIMIT?: string;
  DAILY_LIVE_LIMIT?: string;
  REQUESTS_PER_MINUTE?: string;
  REQUESTS_PER_DAY?: string;
  ACTIVITY_ALERT_PER_HOUR?: string;
  // The welcome email (src/welcomeEmail.ts): secrets GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  MAIL_FROM_ADDRESS?: string;
  LIVE_MODEL?: string;
  LIVE_SECONDS?: string;
  ALLOWED_ORIGINS: string;
  ADMIN_UIDS?: string;
  REQUIRE_FIRST_DEVICE_APPROVAL?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  // Linked Google apps (Drive backups, Sheets exports). See src/googleApps.ts
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEY?: string;
  LIMITER: DurableObjectNamespace<UsageLimiter>;
  // Receipt photos and PDFs (src/receipts.ts). Missing until the bucket is made: receipts then say they are off.
  RECEIPTS?: R2Bucket;
}

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

  /**
   * Uses one of each kind, or none of them when any has nothing left. Returns the kind that was full.
   * `alsoNeeds` must have room too but isn't used up here (a voice message's AI request comes in a second call).
   */
  async take(kinds: LimitKind[], limits: Record<LimitKind, number>, alsoNeeds: LimitKind[] = []): Promise<{ blocked: LimitKind | null; used: Record<LimitKind, number> }> {
    const day = bdDay();
    const used = await this.counts();
    const blocked = firstBlocked([...kinds, ...alsoNeeds], limits, used);
    if (blocked) return { blocked, used };
    for (const kind of kinds) {
      used[kind] += 1;
      await this.ctx.storage.put(`usage:${kind}`, { day, count: used[kind] });
    }
    return { blocked: null, used };
  }

  // Give requests back when the AI failed, so an outage doesn't use up the user's day
  async refund(kinds: LimitKind[]): Promise<void> {
    const day = bdDay();
    for (const kind of kinds) {
      const count = await this.read(kind, day);
      if (count > 0) await this.ctx.storage.put(`usage:${kind}`, { day, count: count - 1 });
    }
  }

  // How many receipts this person keeps (src/receipts.ts). Not reset daily.
  // Storage reads and writes here can't interleave with another request, so two uploads can't both take the last slot.
  async reserveReceipt(max: number): Promise<{ ok: boolean; used: number }> {
    const used = (await this.ctx.storage.get<number>('receipts')) ?? 0;
    if (used >= max) return { ok: false, used };
    await this.ctx.storage.put('receipts', used + 1);
    return { ok: true, used: used + 1 };
  }

  async releaseReceipt(): Promise<void> {
    const used = (await this.ctx.storage.get<number>('receipts')) ?? 0;
    await this.ctx.storage.put('receipts', Math.max(0, used - 1));
  }

  // Error reports (src/errorReports.ts): a few different ones per person per day; the same one again is a repeat
  async takeErrorSlot(fingerprint: string, max: number): Promise<'new' | 'repeat' | 'full'> {
    const day = bdDay();
    const stored = await this.ctx.storage.get<{ day: string; prints: string[] }>('errors');
    const prints = stored?.day === day ? stored.prints : [];
    if (prints.includes(fingerprint)) return 'repeat';
    if (prints.length >= max) return 'full';
    await this.ctx.storage.put('errors', { day, prints: [...prints, fingerprint] });
    return 'new';
  }

  // This minute's requests stay in memory only: no storage write, and losing them when the counter
  // sleeps just starts a fresh minute. The day's count is stored, so a pause can't reset it.
  private minute: MinuteWindow | undefined;

  /** Counts one request to the server, or refuses it when this minute or today is full (see checkRequest) */
  async takeRequest(limits: { perMinute: number; perDay: number }, countMinute: boolean): Promise<{ ok: true } | { ok: false; reason: 'minute' | 'day'; retryAfter: number }> {
    const day = bdDay();
    const today = await this.ctx.storage.get<DayCount>('requests');
    const result = checkRequest(this.minute, today, { now: Date.now(), day, ...limits, countMinute });
    if (!result.ok) return result;
    this.minute = result.minute;
    await this.ctx.storage.put('requests', result.today);
    return { ok: true };
  }

  // Called when the admin deletes the user
  async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
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

/** Answers one request; fetch below adds the safety headers to whatever this returns */
async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        if (!(await limiterFor(verified.uid).takeRequest(requestLimits(env), true)).ok) return { error: 'busy' };
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

  // Every request counts against this person's minute and day before any database work.
  // Receipt photos skip the minute: a gallery loads many at once.
  const slot = await limiterFor(uid).takeRequest(requestLimits(env), path !== '/receipts/open');
  if (!slot.ok) {
    return new Response(JSON.stringify({ error: slot.reason === 'minute' ? TOO_FAST_MESSAGE : DAY_FULL_MESSAGE, tooMany: slot.reason }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(slot.retryAfter) },
    });
  }

  // The routes for accounts and devices, as opposed to the AI and loan routes below
  const isAccountRoute = path.startsWith('/device/') || path.startsWith('/admin/') || path.startsWith('/google/') || path === '/account/username' || path === '/account/delete' || path === '/account/restore-loans' || path === '/errors/report';
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
    if (path === '/account/username') return await handleUsername(uid, claims, body, env, json, (job) => ctx.waitUntil(job));
    // Errors can happen before a device is approved (sign-in and waiting screens), so a Google sign-in is enough
    if (path === '/errors/report') {
      if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: true });
      return await handleErrorReport(uid, body, google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID), limiterFor(uid), bdDay(), json);
    }

    if (!(await deviceIsApproved(uid, claims, env))) return json({ error: 'This device is not approved.', device: true }, 403);

    // Runs when an account is deleted: forget its daily counts and its linked Google apps
    const clearLimiter = async (id: string) => {
      await forgetGoogleLink(env, id).catch((err) => console.error('Could not remove the Google link', err));
      await deleteUserReceipts(env.RECEIPTS, id);
      await env.LIMITER.get(env.LIMITER.idFromName(id)).clear();
    };
    // A separate, fresh Google sign-in that proves the person is here right now. It must be this same user.
    const verifyGoogle = async (googleToken: unknown) => {
      const fresh = typeof googleToken === 'string' ? await verifyFirebaseToken(googleToken, env.FIREBASE_PROJECT_ID) : null;
      return fresh?.uid === uid ? fresh.claims : null;
    };
    if (path === '/account/delete') return await handleDeleteAccount(uid, body, env, json, clearLimiter, verifyGoogle);
    if (path === '/account/restore-loans') return await handleRestoreLoans(uid, body, env, json);
    if (path.startsWith('/google/')) return await handleGoogleApps(path, uid, body, env, json);
    if (path.startsWith('/receipts/')) return await handleReceipts(path, new URL(request.url), uid, request, env, json, cors, limiterFor(uid));
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
  const reachedMessage = (kind: LimitKind) =>
    `${{ ai: 'Daily AI limit reached.', voice: "You've used today's voice messages.", file: "You've used today's file uploads.", live: "You've used today's live chats." }[kind]} It resets at midnight.`;

  // A voice message, written out (src/transcribe.ts). It uses the day's voice limit here; the answer
  // that follows is a normal text request, which uses one of the AI requests. Empty text means the app
  // should send the recording to Gemini instead, which then counts the voice message itself.
  if (path === '/transcribe') {
    let audio: unknown;
    let mimeType: unknown;
    try {
      ({ audio, mimeType } = (await request.json()) as { audio: unknown; mimeType: unknown });
    } catch {
      return json({ error: 'Bad request.' }, 400);
    }
    if (typeof audio !== 'string' || typeof mimeType !== 'string' || !mimeType.startsWith('audio/') || !audio) return json({ error: 'Bad request.' }, 400);
    if (base64Bytes(audio) > MAX_AUDIO_BYTES) return json({ error: 'That voice message is too long.' }, 400);
    const limiter = limiterFor(uid);
    const { blocked, used } = await limiter.take(['voice'], limits, ['ai']);
    if (blocked) return json({ error: reachedMessage(blocked), limits: limitsView(limits, used) }, 429);
    const text = await transcribe(env, audio, mimeType);
    if (!text) {
      await limiter.refund(['voice']);
      used.voice -= 1;
    }
    return json({ text, limits: limitsView(limits, used) });
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
  if (blocked) return json({ error: reachedMessage(blocked), limits: limitsView(limits, used) }, 429);

  // Groq, then Gemini, then Cloudflare, then OpenRouter (files and recordings: Gemini only). See src/providers.ts.
  // Which service answered isn't shown to the user (the owner's choice), only logged.
  const result = await answer(env, parts, schema);
  if (!result.ok) {
    await limiter.refund(kinds);
    return json({ error: result.error }, result.status);
  }
  console.log(`Answered by ${result.service} ${result.model}`);
  return json({ text: result.text, limits: limitsView(limits, used) });
}

export default {
  // Every reply gets the safety headers (src/safety.ts)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withSafetyHeaders(await handle(request, env, ctx));
  },

  // Runs on the schedule in wrangler.toml: takes every user's loan installments that have come due,
  // and refreshes exchange rates once they are 10 days old
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return;
    const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);
    // Each run is noted in meta/health, so the admin panel can warn when a job fails or stops running
    const noted = (job: 'loans' | 'rates' | 'activity', error?: unknown) =>
      recordRun(g, job, error).catch((err) => console.error('Could not record the job run', job, err));
    ctx.waitUntil(
      processDueLoans(g)
        .then((taken) => { if (taken) console.log(`Took ${taken} loan installments`); return noted('loans'); })
        .catch((err) => { console.error('Scheduled loan processing failed', err); return noted('loans', err); }),
    );
    // Error reports are kept 30 days
    ctx.waitUntil(
      deleteErrorReports(g, cutoffFor(new Date()))
        .then((n) => { if (n) console.log(`Removed ${n} old error reports`); })
        .catch((err) => console.error('Could not remove old error reports', err)),
    );
    ctx.waitUntil(
      refreshRates(g)
        .then((updated) => { if (updated) console.log('Exchange rates updated'); return noted('rates'); })
        .catch((err) => { console.error('Scheduled rate refresh failed', err); return noted('rates', err); }),
    );
    // How many new items people added in the last hour, for the admin panel (src/activity.ts)
    ctx.waitUntil(
      countActivity(g)
        .then((result) => { if (result) console.log(`New items in the last hour: ${result.added}`); return noted('activity'); })
        .catch((err) => { console.error('Activity count failed', err); return noted('activity', err); }),
    );
  },
};
