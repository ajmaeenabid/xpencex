// Live voice chat. The phone connects here and this server connects on to Gemini, so the Gemini key
// never reaches the phone. The server chooses the model, tools and time limit; the app can't change them.
import { isAllowedLiveMessage } from './usage';
import type { LimitsView } from './usage';

const GEMINI_LIVE_URL = 'https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const DEFAULT_MODEL = 'gemini-3.8-live';
const MAX_INSTRUCTION_CHARS = 40_000;
const SIGN_IN_WAIT_MS = 10_000;
const CLOSE_GRACE_MS = 5_000; // the app ends the session itself; this catches one that doesn't

// The model shows these to the user as confirm cards. Nothing is saved until they tap Confirm.
const TOOLS = [{
  functionDeclarations: [
    {
      name: 'record_expense',
      description: 'Show the user an expense they just described, so they can confirm it on screen.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short name, in English' },
          amount: { type: 'NUMBER' },
          category: { type: 'STRING', description: 'One of the available categories' },
        },
        required: ['title', 'amount', 'category'],
      },
    },
    {
      name: 'record_income',
      description: 'Show the user money they just said they received, so they can confirm it on screen.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short name, in English' },
          amount: { type: 'NUMBER' },
        },
        required: ['title', 'amount'],
      },
    },
  ],
}];

export interface LiveEnv {
  GEMINI_API_KEY: string;
  LIVE_MODEL?: string;
  LIVE_SECONDS?: string;
}

export interface LiveDeps {
  // Checks the login and the device pass
  signIn: (token: string) => Promise<{ uid: string } | { error: 'auth' | 'device' }>;
  // Uses one of today's live sessions; returns the updated limits, or null when none are left
  take: (uid: string) => Promise<LimitsView | null>;
  refund: (uid: string) => Promise<void>;
}

export function handleLive(env: LiveEnv, deps: LiveDeps): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();

  let started = false;
  let upstream: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let closing = false;
  const closeAll = () => {
    closing = true;
    if (timer) clearTimeout(timer);
    try { upstream?.close(1000); } catch { /* already closed */ }
    try { server.close(1000); } catch { /* already closed */ }
  };
  // Messages from this server, as opposed to Gemini's, are wrapped in "xpencex"
  const tell = (message: object) => {
    try { server.send(JSON.stringify({ xpencex: message })); } catch { /* the phone has gone */ }
  };
  const fail = (error: string) => { tell({ error }); closeAll(); };

  timer = setTimeout(() => fail('auth'), SIGN_IN_WAIT_MS);

  const start = async (raw: unknown) => {
    let hello: { token?: unknown; instruction?: unknown };
    try { hello = JSON.parse(String(raw)); } catch { return fail('bad'); }
    const { token, instruction } = hello;
    if (typeof token !== 'string' || typeof instruction !== 'string' || instruction.length > MAX_INSTRUCTION_CHARS) return fail('bad');

    const who = await deps.signIn(token);
    if ('error' in who) return fail(who.error);
    const limits = await deps.take(who.uid);
    if (!limits) return fail('limit');
    tell({ limits });

    let ready = false;
    const giveBack = () => { if (!ready) { ready = true; deps.refund(who.uid).catch(() => {}); } };

    const res = await fetch(GEMINI_LIVE_URL, { headers: { Upgrade: 'websocket', 'x-goog-api-key': env.GEMINI_API_KEY } });
    const gemini = res.webSocket;
    if (!gemini) {
      console.error('Live connection failed', res.status, await res.text());
      giveBack();
      return fail('busy');
    }
    gemini.accept();
    upstream = gemini;

    gemini.addEventListener('message', (e) => {
      // A session is only counted once Gemini has really started it
      if (!ready) {
        const text = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
        if (text.includes('setupComplete')) ready = true;
      }
      try { server.send(e.data); } catch { closeAll(); }
    });
    gemini.addEventListener('close', (e) => {
      // Closing it ourselves also lands here, so only say Gemini did it when that's true
      if (!closing) console.log('Live session ended by Gemini', e.code, e.reason);
      if (!ready) { giveBack(); tell({ error: 'busy' }); }
      closeAll();
    });
    gemini.addEventListener('error', () => { giveBack(); fail('busy'); });

    gemini.send(JSON.stringify({
      setup: {
        model: `models/${env.LIVE_MODEL || DEFAULT_MODEL}`,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: instruction }] },
        tools: TOOLS,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    }));

    if (timer) clearTimeout(timer);
    const seconds = Number(env.LIVE_SECONDS) || 60;
    timer = setTimeout(() => { tell({ ended: 'time' }); closeAll(); }, seconds * 1000 + CLOSE_GRACE_MS);
  };

  server.addEventListener('message', (e) => {
    if (!started) {
      started = true;
      if (timer) clearTimeout(timer);
      start(e.data).catch((err) => { console.error('Live start failed', err); fail('busy'); });
      return;
    }
    if (upstream && isAllowedLiveMessage(e.data)) {
      try { upstream.send(e.data as string); } catch { closeAll(); }
    }
  });
  server.addEventListener('close', (e) => {
    console.log('Live session ended by the app', e.code, e.reason);
    closeAll();
  });
  server.addEventListener('error', closeAll);

  return new Response(null, { status: 101, webSocket: client });
}
