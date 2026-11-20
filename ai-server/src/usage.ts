// The daily limits and the checks on what the app sends. Plain functions, so they can be tested.

export const LIMIT_KINDS = ['ai', 'voice', 'file', 'live'] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];
export type LimitsView = Record<LimitKind, { used: number; limit: number }>;

const MB = 1024 * 1024;
export const MAX_FILE_BYTES = 5 * MB;
// A 30 second voice message is far smaller than this; it stops someone sending long audio
export const MAX_AUDIO_BYTES = 2 * MB;
// A 5 MB file grows by a third when encoded for sending, and the question and spending list come with it
export const MAX_BODY_BYTES = 8 * MB;

// CSV and Excel files are turned into text on the phone, so they arrive as text/plain
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];

/** Bytes of a base64 string, without decoding it */
export const base64Bytes = (data: string) => Math.floor((data.length * 3) / 4);

type Part = { text?: string; inlineData?: { data: string; mimeType: string } };

/** Which daily limit a request uses besides the 30, or an error for something the app never sends */
export function classifyParts(parts: Part[]): { kind: 'voice' | 'file' | null; error?: string } {
  const media = parts.filter((p) => p.inlineData);
  if (media.length === 0) return { kind: null };
  if (media.length > 1) return { kind: null, error: 'Please send one file at a time.' };
  const { data, mimeType } = media[0].inlineData!;
  if (mimeType.startsWith('audio/')) {
    return base64Bytes(data) > MAX_AUDIO_BYTES
      ? { kind: 'voice', error: 'That voice message is too long.' }
      : { kind: 'voice' };
  }
  if (!FILE_TYPES.includes(mimeType)) return { kind: 'file', error: 'That file type is not supported.' };
  return base64Bytes(data) > MAX_FILE_BYTES
    ? { kind: 'file', error: 'That file is larger than 5 MB.' }
    : { kind: 'file' };
}

export interface LimitEnv {
  DAILY_LIMIT?: string;
  DAILY_VOICE_LIMIT?: string;
  DAILY_FILE_LIMIT?: string;
  DAILY_LIVE_LIMIT?: string;
}

/** Each number can be changed in wrangler.toml */
export function dailyLimits(env: LimitEnv): Record<LimitKind, number> {
  return {
    ai: Number(env.DAILY_LIMIT) || 30,
    voice: Number(env.DAILY_VOICE_LIMIT) || 5,
    file: Number(env.DAILY_FILE_LIMIT) || 3,
    live: Number(env.DAILY_LIVE_LIMIT) || 3,
  };
}

export function limitsView(limits: Record<LimitKind, number>, used: Partial<Record<LimitKind, number>>): LimitsView {
  const view = {} as LimitsView;
  for (const kind of LIMIT_KINDS) view[kind] = { used: used[kind] || 0, limit: limits[kind] };
  return view;
}

/** The first limit in `kinds` with nothing left, or null when all of them have room */
export function firstBlocked(kinds: LimitKind[], limits: Record<LimitKind, number>, used: Partial<Record<LimitKind, number>>): LimitKind | null {
  return kinds.find((kind) => (used[kind] || 0) >= limits[kind]) || null;
}

// ---------------------------------------------------------------------------
// Request limits: how often one person may call this server at all, whatever the route.
// They stop a script from using up the free daily database reads (each request checks the device pass).
// ---------------------------------------------------------------------------

export interface RequestLimitEnv {
  REQUESTS_PER_MINUTE?: string;
  REQUESTS_PER_DAY?: string;
}

export const requestLimits = (env: RequestLimitEnv) => ({
  perMinute: Number(env.REQUESTS_PER_MINUTE) || 60,
  perDay: Number(env.REQUESTS_PER_DAY) || 2000,
});

const MINUTE_MS = 60_000;

/** One minute's count, starting at the first request in it */
export type MinuteWindow = { start: number; count: number };
/** One day's count (Bangladesh time) */
export type DayCount = { day: string; count: number };

export type RequestCheck =
  | { ok: true; minute: MinuteWindow; today: DayCount }
  | { ok: false; reason: 'minute' | 'day'; retryAfter: number };

/**
 * Whether one more request fits, and the counts after it. A refused request uses nothing.
 * `countMinute` false skips the per-minute limit (receipt photos: a gallery loads many at once).
 */
export function checkRequest(
  minute: MinuteWindow | undefined,
  today: DayCount | undefined,
  { now, day, perMinute, perDay, countMinute }: { now: number; day: string; perMinute: number; perDay: number; countMinute: boolean },
): RequestCheck {
  const dayCount = today?.day === day ? today.count : 0;
  if (dayCount >= perDay) return { ok: false, reason: 'day', retryAfter: 3600 };

  const current = minute && now - minute.start < MINUTE_MS ? minute : { start: now, count: 0 };
  if (countMinute && current.count >= perMinute) {
    return { ok: false, reason: 'minute', retryAfter: Math.max(1, Math.ceil((current.start + MINUTE_MS - now) / 1000)) };
  }
  return {
    ok: true,
    minute: countMinute ? { start: current.start, count: current.count + 1 } : current,
    today: { day, count: dayCount + 1 },
  };
}

export const TOO_FAST_MESSAGE = "You're going a bit fast. Please wait a minute and try again.";
export const DAY_FULL_MESSAGE = "You've used today's limit for online features. It resets at midnight. You can still add expenses.";

// Only what a conversation needs may pass from the app to Gemini; the server alone chooses the setup
export const isAllowedLiveMessage = (data: unknown) =>
  typeof data === 'string' && (data.startsWith('{"realtimeInput"') || data.startsWith('{"toolResponse"'));
