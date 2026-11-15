import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanTranscript, transcribe } from './transcribe';

afterEach(() => vi.unstubAllGlobals());

describe('cleanTranscript', () => {
  it('tidies spaces and drops what Whisper "hears" in silence', () => {
    expect(cleanTranscript('  lunch   200 taka ')).toBe('lunch 200 taka');
    expect(cleanTranscript('Thank you.')).toBe('');
    expect(cleanTranscript('ধন্যবাদ।')).toBe('');
    expect(cleanTranscript(undefined)).toBe('');
  });
});

describe('transcribe', () => {
  it("uses Groq's Whisper first", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 'দুপুরের খাবার ২০০ টাকা' }))));
    const ai = { run: vi.fn() } as unknown as Ai;
    expect(await transcribe({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', AI: ai }, 'AAAA', 'audio/webm')).toBe('দুপুরের খাবার ২০০ টাকা');
    expect((ai as any).run).not.toHaveBeenCalled();
  });

  it("falls back to Cloudflare's Whisper, then gives up with ''", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('limit', { status: 429 })));
    const ai = { run: vi.fn(async () => ({ text: 'lunch 200' })) } as unknown as Ai;
    expect(await transcribe({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', AI: ai }, 'AAAA', 'audio/webm')).toBe('lunch 200');
    const broken = { run: vi.fn(async () => { throw new Error('down'); }) } as unknown as Ai;
    expect(await transcribe({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', AI: broken }, 'AAAA', 'audio/webm')).toBe('');
  });
});
