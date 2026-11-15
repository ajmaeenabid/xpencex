// The AI services the server can ask, and the order it asks them in.
// Text questions go to Groq first, then Gemini, then Cloudflare's own AI, then OpenRouter.
// Photos, PDFs and voice recordings only go to Gemini, the one service that reads them well.
// The order and the free limits are the owner's choices (2026-11-16).

export type Part = { text?: string; inlineData?: { data: string; mimeType: string } };

/** What one try returned: the answer, or the status code it failed with (0 = no reply or a timeout) */
export type Outcome = { ok: true; text: string } | { ok: false; status: number; detail: string };

export interface ProviderEnv {
  GEMINI_API_KEY: string;
  GROQ_API_KEY?: string;
  GROQ_MODELS?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: string;
  CLOUDFLARE_AI_MODEL?: string;
  AI?: Ai;
}

export const GEMINI_MODEL = 'gemini-3.1-flash-lite'; // Google lists its earliest shutdown as May 7, 2027
// Tried in order when GEMINI_MODEL is still busy after a retry, retired, or out of free quota. Each runs on
// separate capacity. The last one is Google's "latest" alias, which keeps pointing at a current model
// even after the named ones are retired.
export const GEMINI_BACKUPS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
// Groq counts its daily limit per model, so a second model is a second allowance
export const DEFAULT_GROQ_MODELS = 'openai/gpt-oss-120b,openai/gpt-oss-20b';
export const DEFAULT_CLOUDFLARE_MODEL = '@cf/openai/gpt-oss-20b';

// Room for a long answer, such as a 3-day trip plan with tables
const MAX_ANSWER_TOKENS = 3000;
// A service that hasn't answered by then is treated as busy, so the next one gets a turn
const TIMEOUT_MS = 30_000;

export const list = (value: string | undefined, fallback = '') =>
  (value ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// The order

export type Step =
  | { service: 'groq'; model: string }
  | { service: 'gemini'; model: string }
  | { service: 'cloudflare'; model: string }
  | { service: 'openrouter'; model: string };

/**
 * Who to ask, in order. A service without its key (or, for Cloudflare, without the AI binding) is skipped.
 * Anything with a file or recording, or with a Gemini reply template, goes to Gemini alone.
 */
export function planSteps(env: ProviderEnv, geminiOnly: boolean): Step[] {
  const gemini: Step[] = [GEMINI_MODEL, ...GEMINI_BACKUPS].map((model) => ({ service: 'gemini', model }));
  if (geminiOnly) return gemini;
  const groq: Step[] = env.GROQ_API_KEY ? list(env.GROQ_MODELS, DEFAULT_GROQ_MODELS).map((model) => ({ service: 'groq', model })) : [];
  const cloudflare: Step[] = env.AI ? [{ service: 'cloudflare', model: env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_MODEL }] : [];
  const openrouter: Step[] = env.OPENROUTER_API_KEY ? list(env.OPENROUTER_MODELS).map((model) => ({ service: 'openrouter', model })) : [];
  return [...groq, ...gemini, ...cloudflare, ...openrouter];
}

/** The app's question as one piece of text, for services that only take text */
export const partsToText = (parts: Part[]) => parts.map((p) => p.text || '').join('\n\n');

/** The app expects a JSON object; a reply that isn't one is passed on to the next service */
export function isJsonObject(text: string): boolean {
  const trimmed = text.replace(/```json|```/g, '').trim();
  try {
    const value = JSON.parse(trimmed);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

/** The answer text in an OpenAI-style reply, or in a Cloudflare Workers AI reply */
export function answerText(body: any): string {
  const choice = body?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice;
  const response = body?.response ?? body?.result?.response;
  if (typeof response === 'string') return response;
  // Some Cloudflare models hand back the JSON already read
  if (response && typeof response === 'object') return JSON.stringify(response);
  return '';
}

/** Gemini's 5xx, 404 (retired) and 429 (out of quota) mean another model may still answer */
export const geminiMayRecover = (status: number) => status >= 500 || status === 404 || status === 429;

/** What the user reads when nobody could answer. Based on every failure, not just the last one. */
export function failureMessage(failures: { service: Step['service']; status: number }[]): { status: number; error: string } {
  if (failures.length && failures.every((f) => f.status === 429)) {
    return { status: 503, error: 'Every AI service has used up its free allowance for now. Please try again later.' };
  }
  if (failures.some((f) => f.status >= 500 || f.status === 0 || f.status === 429)) {
    return { status: 503, error: 'All AI services are busy right now. Please try again in a minute.' };
  }
  if (failures.some((f) => f.service === 'gemini' && f.status === 404)) {
    return { status: 502, error: 'The AI models this app uses are no longer available. The app needs an update.' };
  }
  const last = failures[failures.length - 1];
  return { status: 502, error: `The AI returned an error (code ${last?.status ?? 0}). Please try again.` };
}

// ---------------------------------------------------------------------------
// One try at each service

async function fetchOutcome(url: string, init: RequestInit, read: (body: any) => string): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, status: 0, detail: String(err) };
  }
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 500) };
  const body = await res.json().catch(() => null);
  const text = read(body);
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'Empty answer' };
}

export function askGemini(env: ProviderEnv, model: string, parts: Part[], schema?: unknown): Promise<Outcome> {
  return fetchOutcome(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}) },
      }),
    },
    (body) => body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '',
  );
}

// Groq's guide for its gpt-oss models: everything in the user message, no system prompt.
// Low reasoning keeps answers fast and saves the daily token allowance; the thinking itself isn't sent back.
export function askGroq(env: ProviderEnv, model: string, prompt: string): Promise<Outcome> {
  return fetchOutcome(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: MAX_ANSWER_TOKENS,
      }),
    },
    answerText,
  );
}

export function askOpenRouter(env: ProviderEnv, model: string, prompt: string): Promise<Outcome> {
  return fetchOutcome(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: MAX_ANSWER_TOKENS,
      }),
    },
    answerText,
  );
}

// Cloudflare's own AI runs inside our server's account, so it needs no key, only the AI binding in wrangler.toml
export async function askCloudflare(env: ProviderEnv, model: string, prompt: string): Promise<Outcome> {
  try {
    const body = await (env.AI as any).run(model, {
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: MAX_ANSWER_TOKENS,
    });
    const text = answerText(body);
    return text ? { ok: true, text } : { ok: false, status: 502, detail: 'Empty answer' };
  } catch (err) {
    // Running out of the daily free allowance shows up as an error, not a status code
    const detail = String(err);
    return { ok: false, status: /limit|quota|429|exceeded/i.test(detail) ? 429 : 502, detail: detail.slice(0, 500) };
  }
}

// ---------------------------------------------------------------------------
// The whole chain

export type Answer = { ok: true; text: string; service: Step['service']; model: string } | ({ ok: false } & ReturnType<typeof failureMessage>);

/**
 * Asks each service in turn until one gives a usable answer.
 * `wait` is only swapped out in tests, so they don't sit through the pause before Gemini's retry.
 */
export async function answer(
  env: ProviderEnv,
  parts: Part[],
  schema?: unknown,
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<Answer> {
  const geminiOnly = parts.some((p) => p.inlineData) || schema !== undefined;
  const prompt = partsToText(parts);
  const failures: { service: Step['service']; status: number }[] = [];
  let geminiRetried = false;
  let skipGemini = false;

  for (const step of planSteps(env, geminiOnly)) {
    if (step.service === 'gemini' && skipGemini) continue;
    let outcome: Outcome;
    if (step.service === 'gemini') {
      outcome = await askGemini(env, step.model, parts, schema);
      // Gemini is sometimes briefly overloaded. One quick retry of the main model usually gets through.
      if (!outcome.ok && outcome.status >= 500 && !geminiRetried) {
        geminiRetried = true;
        console.error('Gemini error, retrying once', outcome.status);
        await wait(1000);
        outcome = await askGemini(env, step.model, parts, schema);
      }
    } else if (step.service === 'groq') {
      outcome = await askGroq(env, step.model, prompt);
    } else if (step.service === 'cloudflare') {
      outcome = await askCloudflare(env, step.model, prompt);
    } else {
      outcome = await askOpenRouter(env, step.model, prompt);
    }

    // Gemini's replies go to the app as before (it repairs small slips). Other services must send clean JSON.
    if (outcome.ok && (step.service === 'gemini' || isJsonObject(outcome.text))) {
      return { ok: true, text: outcome.text, service: step.service, model: step.model };
    }
    const failure = outcome.ok ? { status: 502, detail: `Not JSON: ${outcome.text.slice(0, 200)}` } : outcome;
    console.error(`${step.service} ${step.model} failed (${failure.status})`, failure.detail);
    failures.push({ service: step.service, status: failure.status });
    // A Gemini error that another Gemini model can't fix (a bad request, say) skips the rest of Gemini
    if (step.service === 'gemini' && !geminiMayRecover(failure.status)) skipGemini = true;
  }
  return { ok: false, ...failureMessage(failures) };
}
