// Error reports from people's phones (chosen 2026-11-11): what broke, on which screen, app version and phone model.
// No money data and no messages. Shown to the admin with the username only. The same error from the same person
// on the same day is one report with a count; at most 20 different reports per person per day; kept 30 days.
// Stored in errorReports/{id}, which only this server reads or writes (firestore.rules).

import { encodeFields, google } from './google';

type Json = (body: unknown, status?: number) => Response;
type G = ReturnType<typeof google>;

export const MAX_ERRORS_PER_DAY = 20;
export const KEEP_DAYS = 30;

const LIMITS = { message: 300, stack: 1500, screen: 40, version: 20, device: 80 };

/** Hides long numbers (account, card, phone) and anything that looks like an email, as a last guard */
export function scrub(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\d[\d -]{5,}\d/g, '[number]');
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? scrub(value).slice(0, max) : '');

export interface CleanReport { message: string; stack: string; screen: string; version: string; device: string }

/** The report as it will be kept, or null when it has no message */
export function cleanReport(body: Record<string, unknown>): CleanReport | null {
  const message = clip(body.message, LIMITS.message).trim();
  if (!message) return null;
  return {
    message,
    stack: clip(body.stack, LIMITS.stack),
    screen: clip(body.screen, LIMITS.screen),
    version: clip(body.version, LIMITS.version),
    device: clip(body.device, LIMITS.device),
  };
}

/** Same error = same message on the same screen; the stack's line numbers change between versions */
export function fingerprint(r: Pick<CleanReport, 'message' | 'screen'>) {
  return `${r.screen}|${r.message}`;
}

async function sha(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The per-person daily slots, kept by the UsageLimiter Durable Object */
export interface ErrorSlots {
  takeErrorSlot(fingerprint: string, max: number): Promise<'new' | 'repeat' | 'full'>;
}

/** POST /errors/report from the app */
export async function handleErrorReport(uid: string, body: Record<string, unknown>, g: G, slots: ErrorSlots, day: string, json: Json) {
  const report = cleanReport(body);
  if (!report) return json({ ok: true });
  const print = fingerprint(report);
  const slot = await slots.takeErrorSlot(print, MAX_ERRORS_PER_DAY);
  if (slot === 'full') return json({ ok: true }); // quietly dropped: the person already sent 20 today

  const id = await sha(`${uid}|${day}|${print}`);
  const now = new Date().toISOString();
  const [name] = await g.listByUid('usernames', uid);
  await g.commit([{
    update: {
      name: g.docName('errorReports', id),
      fields: encodeFields({ uid, username: name?.username || '', ...report, day, lastAt: now, ...(slot === 'new' && { firstAt: now }) }),
    },
    // A repeat keeps its first time and adds one to the count
    updateMask: { fieldPaths: ['uid', 'username', 'message', 'stack', 'screen', 'version', 'device', 'day', 'lastAt', ...(slot === 'new' ? ['firstAt'] : [])] },
    updateTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }],
  }]);
  return json({ ok: true });
}

/** Admin: the newest reports (with the username, never the user id) */
export async function listErrorReports(g: G) {
  const docs = await g.query({ from: [{ collectionId: 'errorReports' }], orderBy: [{ field: { fieldPath: 'lastAt' }, direction: 'DESCENDING' }], limit: 200 });
  return docs.map((d) => ({
    id: d.id,
    username: String(d.data.username || ''),
    message: String(d.data.message || ''),
    stack: String(d.data.stack || ''),
    screen: String(d.data.screen || ''),
    version: String(d.data.version || ''),
    device: String(d.data.device || ''),
    count: Number(d.data.count || 1),
    firstAt: String(d.data.firstAt || d.data.lastAt || ''),
    lastAt: String(d.data.lastAt || ''),
  }));
}

/** Removes reports older than 30 days (hourly job), or every report (admin's "Delete all"). Returns how many. */
export async function deleteErrorReports(g: G, olderThan?: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const docs = await g.query({
      from: [{ collectionId: 'errorReports' }],
      ...(olderThan && { where: { fieldFilter: { field: { fieldPath: 'lastAt' }, op: 'LESS_THAN', value: { stringValue: olderThan } } } }),
      select: { fields: [{ fieldPath: '__name__' }] },
      limit: 400,
    });
    if (docs.length === 0) return removed;
    await g.commit(docs.map((d) => ({ delete: d.name })));
    removed += docs.length;
  }
}

export const cutoffFor = (now: Date, days = KEEP_DAYS) => new Date(now.getTime() - days * 86_400_000).toISOString();
