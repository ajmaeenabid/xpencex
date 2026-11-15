// Voice messages are written out here first (Groq's Whisper, then Cloudflare's), so the words can go
// through the normal text chain instead of using Gemini's small allowance. The app checks the words for
// codes and numbers before anything else happens with them. If both fail, the app falls back to Gemini.

import type { Outcome, ProviderEnv } from './providers';

// The more accurate Whisper for languages other than English (Groq's guide), which matters for Bangla
export const GROQ_WHISPER = 'whisper-large-v3';
export const CLOUDFLARE_WHISPER = '@cf/openai/whisper-large-v3-turbo';
const TIMEOUT_MS = 30_000;

// Whisper sometimes "hears" one of these in silence or noise. A message that is only this is treated as empty.
const SILENCE_PHRASES = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|ধন্যবাদ।?)$/i;

/** The words, or '' when the recording held nothing usable */
export function cleanTranscript(text: unknown): string {
  if (typeof text !== 'string') return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return SILENCE_PHRASES.test(trimmed) ? '' : trimmed;
}

const fileName = (mimeType: string) => `voice.${mimeType.split('/')[1]?.split(';')[0] || 'webm'}`;

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function groqTranscribe(env: ProviderEnv, data: string, mimeType: string): Promise<Outcome> {
  const form = new FormData();
  form.append('file', new Blob([decodeBase64(data)], { type: mimeType }), fileName(mimeType));
  form.append('model', GROQ_WHISPER);
  form.append('response_format', 'json');
  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, status: 0, detail: String(err) };
  }
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 500) };
  const body = (await res.json().catch(() => null)) as { text?: unknown } | null;
  return { ok: true, text: cleanTranscript(body?.text) };
}

export async function cloudflareTranscribe(env: ProviderEnv, data: string): Promise<Outcome> {
  try {
    const body = (await (env.AI as any).run(CLOUDFLARE_WHISPER, { audio: data })) as { text?: unknown };
    return { ok: true, text: cleanTranscript(body?.text) };
  } catch (err) {
    return { ok: false, status: 502, detail: String(err).slice(0, 500) };
  }
}

/** The words in a recording, or '' when no service could write them out (or it was silent) */
export async function transcribe(env: ProviderEnv, data: string, mimeType: string): Promise<string> {
  const tries: (() => Promise<Outcome>)[] = [];
  if (env.GROQ_API_KEY) tries.push(() => groqTranscribe(env, data, mimeType));
  if (env.AI) tries.push(() => cloudflareTranscribe(env, data));
  for (const attempt of tries) {
    const outcome = await attempt();
    if (outcome.ok && outcome.text) return outcome.text;
    if (!outcome.ok) console.error('Transcription failed', outcome.status, outcome.detail);
  }
  return '';
}
