import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleLive, LiveDeps } from './live';
import type { LimitsView } from './usage';

// Pretend sockets: the phone's connection to this server, and this server's connection to Gemini.
// Cloudflare's WebSocketPair and 101 responses don't exist in tests, so they are faked here.
type Listener = (e: any) => void;
class FakeSocket {
  sent: unknown[] = [];
  closed = false;
  private listeners: Record<string, Listener[]> = {};
  accept() {}
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn); }
  send(data: unknown) { if (this.closed) throw new Error('closed'); this.sent.push(data); }
  close() { this.closed = true; }
  emit(type: string, event: Record<string, unknown> = {}) { for (const fn of this.listeners[type] || []) fn(event); }
}

let phone: FakeSocket; // this server's side of the phone's connection
let gemini: FakeSocket | null;
let geminiCalls: { url: string; key: string | undefined }[];

const limits = { live: { used: 1, limit: 3 } } as unknown as LimitsView;
const env = { GEMINI_API_KEY: 'secret-key', LIVE_MODEL: 'gemini-test-live', LIVE_SECONDS: '60' };

function makeDeps(overrides: Partial<LiveDeps> = {}) {
  return {
    signIn: vi.fn(async (token: string) => (token === 'good' ? { uid: 'mim' } : token === 'no-device' ? { error: 'device' as const } : { error: 'auth' as const })),
    take: vi.fn(async () => limits),
    refund: vi.fn(async () => {}),
    ...overrides,
  };
}

/** What this server told the phone (its own messages, not Gemini's) */
const told = () => phone.sent
  .filter((m): m is string => typeof m === 'string' && m.startsWith('{"xpencex"'))
  .map((m) => JSON.parse(m).xpencex);

const hello = (token = 'good', instruction = 'You help with expenses.') => JSON.stringify({ token, instruction });
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  gemini = new FakeSocket();
  geminiCalls = [];
  vi.stubGlobal('WebSocketPair', class {
    constructor() {
      const client = new FakeSocket();
      phone = new FakeSocket();
      return { 0: client, 1: phone };
    }
  });
  vi.stubGlobal('Response', class {
    status: number;
    webSocket: unknown;
    constructor(_body: unknown, init: { status: number; webSocket?: unknown }) { this.status = init.status; this.webSocket = init.webSocket; }
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
    geminiCalls.push({ url, key: init.headers['x-goog-api-key'] });
    return gemini ? { webSocket: gemini } : { webSocket: null, status: 503, text: async () => 'busy' };
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live chat relay: starting', () => {
  it('opens a WebSocket for the phone', () => {
    expect((handleLive(env, makeDeps()) as unknown as { status: number }).status).toBe(101);
  });

  it('closes a connection that never signs in', async () => {
    handleLive(env, makeDeps());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(told()).toEqual([{ error: 'auth' }]);
    expect(phone.closed).toBe(true);
  });

  it('refuses a broken or oversized first message without calling Gemini', async () => {
    for (const first of ['not json', JSON.stringify({ token: 'good' }), hello('good', 'x'.repeat(40_001))]) {
      handleLive(env, makeDeps());
      phone.emit('message', { data: first });
      await flush();
      expect(told()).toEqual([{ error: 'bad' }]);
    }
    expect(geminiCalls).toHaveLength(0);
  });

  it('refuses a bad login or an unapproved device', async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello('fake') });
    await flush();
    expect(told()).toEqual([{ error: 'auth' }]);

    handleLive(env, makeDeps());
    phone.emit('message', { data: hello('no-device') });
    await flush();
    expect(told()).toEqual([{ error: 'device' }]);
    expect(geminiCalls).toHaveLength(0);
  });

  it("stops when today's live chats are used up", async () => {
    handleLive(env, makeDeps({ take: vi.fn(async () => null) }));
    phone.emit('message', { data: hello() });
    await flush();
    expect(told()).toEqual([{ error: 'limit' }]);
    expect(geminiCalls).toHaveLength(0);
  });
});

describe('live chat relay: talking to Gemini', () => {
  it("keeps the key on the server and uses the server's model and tools", async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello() });
    await flush();
    expect(told()).toEqual([{ limits }]);
    expect(geminiCalls[0].key).toBe('secret-key');
    expect(phone.sent.join('')).not.toContain('secret-key');

    const setup = JSON.parse(gemini!.sent[0] as string).setup;
    expect(setup.model).toBe('models/gemini-test-live');
    expect(setup.systemInstruction.parts[0].text).toBe('You help with expenses.');
    expect(setup.tools[0].functionDeclarations.map((f: { name: string }) => f.name)).toEqual(['record_expense', 'record_income']);
  });

  it('passes audio and tool answers on, but never a second setup from the phone', async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello() });
    await flush();
    phone.emit('message', { data: '{"realtimeInput":{"audio":{"data":"AAAA"}}}' });
    phone.emit('message', { data: '{"toolResponse":{"functionResponses":[]}}' });
    phone.emit('message', { data: '{"setup":{"model":"models/expensive-model"}}' });
    phone.emit('message', { data: '{"clientContent":{"turns":[]}}' });
    expect(gemini!.sent.slice(1)).toEqual([
      '{"realtimeInput":{"audio":{"data":"AAAA"}}}',
      '{"toolResponse":{"functionResponses":[]}}',
    ]);
  });

  it("passes Gemini's replies to the phone", async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello() });
    await flush();
    gemini!.emit('message', { data: '{"serverContent":{"outputTranscription":{"text":"Hi"}}}' });
    expect(phone.sent).toContain('{"serverContent":{"outputTranscription":{"text":"Hi"}}}');
  });

  it('ends the chat at the time limit, with a few seconds of grace', async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello() });
    await flush();
    await vi.advanceTimersByTimeAsync(64_000);
    expect(phone.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(told()).toContainEqual({ ended: 'time' });
    expect(phone.closed).toBe(true);
    expect(gemini!.closed).toBe(true);
  });

  it('closes Gemini when the phone hangs up', async () => {
    handleLive(env, makeDeps());
    phone.emit('message', { data: hello() });
    await flush();
    phone.emit('close', { code: 1000, reason: '' });
    expect(gemini!.closed).toBe(true);
  });
});

describe('live chat relay: giving the chat back when Gemini fails', () => {
  it('gives it back when Gemini cannot be reached', async () => {
    gemini = null;
    const deps = makeDeps();
    handleLive(env, deps);
    phone.emit('message', { data: hello() });
    await flush();
    expect(told()).toContainEqual({ error: 'busy' });
    expect(deps.refund).toHaveBeenCalledWith('mim');
  });

  it('gives it back when Gemini closes before the chat really started', async () => {
    const deps = makeDeps();
    handleLive(env, deps);
    phone.emit('message', { data: hello() });
    await flush();
    gemini!.emit('close', { code: 1011, reason: 'overloaded' });
    expect(deps.refund).toHaveBeenCalledTimes(1);
    expect(told()).toContainEqual({ error: 'busy' });
  });

  it('keeps it counted once Gemini has started, and gives it back only once', async () => {
    const deps = makeDeps();
    handleLive(env, deps);
    phone.emit('message', { data: hello() });
    await flush();
    gemini!.emit('message', { data: '{"setupComplete":{}}' });
    gemini!.emit('close', { code: 1000, reason: '' });
    expect(deps.refund).not.toHaveBeenCalled();

    gemini = new FakeSocket(); // a new chat gets a new connection
    const deps2 = makeDeps();
    handleLive(env, deps2);
    phone.emit('message', { data: hello() });
    await flush();
    gemini!.emit('error');
    gemini!.emit('close', { code: 1011, reason: '' });
    expect(deps2.refund).toHaveBeenCalledTimes(1);
  });
});
