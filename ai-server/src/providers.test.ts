import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer, answerText, failureMessage, isJsonObject, planSteps, type ProviderEnv } from './providers';

const GOOD = '{"type":"chat","content":"Hi"}';
const noWait = async () => {};

// A fake fetch: each call takes the next reply from the list for that service, and records who was asked
function fakeFetch(replies: Partial<Record<'groq' | 'gemini' | 'openrouter', Response[]>>) {
  const asked: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const service = (['groq', 'openrouter'] as const).find((name) => url.includes(name)) || 'gemini';
    const model = service === 'gemini' ? url.split('/models/')[1].split(':')[0] : JSON.parse(String(init.body)).model;
    asked.push(`${service}:${model}`);
    const next = replies[service]?.shift();
    if (!next) throw new Error(`No reply set up for ${service}`);
    return next;
  }));
  return asked;
}

const openAiReply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
const geminiReply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
const status = (code: number) => new Response('error', { status: code });

const env = (extra: Partial<ProviderEnv> = {}): ProviderEnv => ({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', ...extra });

afterEach(() => vi.unstubAllGlobals());

describe('planSteps', () => {
  it('asks Groq, then Gemini, then Cloudflare, then OpenRouter', () => {
    const steps = planSteps(env({ AI: {} as Ai, OPENROUTER_API_KEY: 'o', OPENROUTER_MODELS: 'a:free, b:free' }), false);
    expect(steps.map((s) => `${s.service}:${s.model}`)).toEqual([
      'groq:openai/gpt-oss-120b',
      'groq:openai/gpt-oss-20b',
      'gemini:gemini-3.1-flash-lite',
      'gemini:gemini-3.5-flash-lite',
      'gemini:gemini-flash-lite-latest',
      'cloudflare:@cf/openai/gpt-oss-20b',
      'openrouter:a:free',
      'openrouter:b:free',
    ]);
  });

  it('skips a service whose key or binding is missing', () => {
    const steps = planSteps({ GEMINI_API_KEY: 'g', OPENROUTER_MODELS: 'a:free' }, false);
    expect(steps.every((s) => s.service === 'gemini')).toBe(true);
  });

  it('sends files and recordings to Gemini only', () => {
    expect(planSteps(env({ AI: {} as Ai }), true).every((s) => s.service === 'gemini')).toBe(true);
  });
});

describe('answer', () => {
  it('uses Groq when it answers', async () => {
    const asked = fakeFetch({ groq: [openAiReply(GOOD)], gemini: [], openrouter: [] });
    const result = await answer(env(), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, text: GOOD, service: 'groq' });
    expect(asked).toEqual(['groq:openai/gpt-oss-120b']);
  });

  it('moves to the second Groq model, then Gemini, when Groq is out of quota', async () => {
    const asked = fakeFetch({ groq: [status(429), status(429)], gemini: [geminiReply(GOOD)], openrouter: [] });
    const result = await answer(env(), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, service: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(asked).toEqual(['groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b', 'gemini:gemini-3.1-flash-lite']);
  });

  it('passes on an answer that is not JSON', async () => {
    fakeFetch({ groq: [openAiReply('Sure! Here you go'), openAiReply(GOOD)], gemini: [], openrouter: [] });
    const result = await answer(env(), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, model: 'openai/gpt-oss-20b' });
  });

  it('falls through to Cloudflare, then OpenRouter', async () => {
    fakeFetch({ groq: [status(429), status(429)], gemini: [status(429), status(429), status(429)], openrouter: [openAiReply(GOOD)] });
    const ai = { run: vi.fn(async () => { throw new Error('daily free allocation exceeded'); }) } as unknown as Ai;
    const result = await answer(env({ AI: ai, OPENROUTER_API_KEY: 'o', OPENROUTER_MODELS: 'x:free' }), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, service: 'openrouter', model: 'x:free' });
    expect((ai as any).run).toHaveBeenCalledOnce();
  });

  it("uses Cloudflare's answer", async () => {
    fakeFetch({ groq: [status(500), status(500)], gemini: [status(429), status(429), status(429)], openrouter: [] });
    const ai = { run: vi.fn(async () => ({ response: GOOD })) } as unknown as Ai;
    const result = await answer(env({ AI: ai }), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, service: 'cloudflare', text: GOOD });
  });

  it('retries the main Gemini model once when it is busy', async () => {
    const asked = fakeFetch({ groq: [], gemini: [status(503), geminiReply(GOOD)], openrouter: [] });
    const result = await answer({ GEMINI_API_KEY: 'g' }, [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, model: 'gemini-3.1-flash-lite' });
    expect(asked).toEqual(['gemini:gemini-3.1-flash-lite', 'gemini:gemini-3.1-flash-lite']);
  });

  it('never sends a recording to Groq', async () => {
    const asked = fakeFetch({ groq: [], gemini: [geminiReply(GOOD)], openrouter: [] });
    await answer(env(), [{ text: 'listen' }, { inlineData: { data: 'AAAA', mimeType: 'audio/webm' } }], undefined, noWait);
    expect(asked).toEqual(['gemini:gemini-3.1-flash-lite']);
  });

  it('skips the other Gemini models after a bad request, and still tries the rest', async () => {
    const asked = fakeFetch({ groq: [status(429), status(429)], gemini: [status(400)], openrouter: [openAiReply(GOOD)] });
    const result = await answer(env({ OPENROUTER_API_KEY: 'o', OPENROUTER_MODELS: 'x:free' }), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, service: 'openrouter' });
    expect(asked.filter((a) => a.startsWith('gemini'))).toHaveLength(1);
  });

  it('says every allowance is used up when everyone answered 429', async () => {
    fakeFetch({ groq: [status(429), status(429)], gemini: [status(429), status(429), status(429)], openrouter: [] });
    const result = await answer(env(), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(!result.ok && result.error).toMatch(/free allowance/);
  });
});

describe('answer, later services', () => {
  it('asks OpenRouter when the others are out, with its own key', async () => {
    const asked = fakeFetch({ groq: [status(429), status(429)], gemini: [status(429), status(429), status(429)], openrouter: [openAiReply(GOOD)] });
    const result = await answer(env({ OPENROUTER_API_KEY: 'o', OPENROUTER_MODELS: 'a:free' }), [{ text: 'hi' }], undefined, noWait);
    expect(result).toMatchObject({ ok: true, service: 'openrouter', model: 'a:free' });
    expect(asked.slice(-1)).toEqual(['openrouter:a:free']);
    const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const routerCall = calls.find(([url]) => url.includes('openrouter'))!;
    expect((routerCall[1].headers as Record<string, string>).Authorization).toBe('Bearer o');
  });
});

describe('helpers', () => {
  it('reads OpenAI-style and Cloudflare replies', () => {
    expect(answerText({ choices: [{ message: { content: 'a' } }] })).toBe('a');
    expect(answerText({ response: 'b' })).toBe('b');
    expect(answerText({ response: { type: 'chat' } })).toBe('{"type":"chat"}');
    expect(answerText(null)).toBe('');
  });

  it('accepts only a JSON object', () => {
    expect(isJsonObject('```json\n{"a":1}\n```')).toBe(true);
    expect(isJsonObject('[1]')).toBe(false);
    expect(isJsonObject('hello')).toBe(false);
  });

  it('explains failures in plain words', () => {
    expect(failureMessage([{ service: 'groq', status: 500 }, { service: 'gemini', status: 429 }]).error).toMatch(/busy/);
    expect(failureMessage([{ service: 'gemini', status: 404 }]).error).toMatch(/needs an update/);
    expect(failureMessage([{ service: 'gemini', status: 400 }]).error).toMatch(/code 400/);
  });
});
