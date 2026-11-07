import { describe, it, expect } from 'vitest';
import { bytesToBase64, parseLiveMessage, pcmBase64ToFloat, toPcm16 } from './liveAudio';

describe('sound conversion', () => {
  it('shrinks 48 kHz microphone sound to 16 kHz', () => {
    const out = toPcm16(new Float32Array(4800).fill(0.5), 48000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBe(Math.floor(0.5 * 0x7fff));
  });
  it('keeps samples inside the allowed range', () => {
    const out = toPcm16(Float32Array.from([2, -2]), 16000);
    expect(Array.from(out)).toEqual([0x7fff, -0x8000]);
  });
  it('reads back what was sent', () => {
    const pcm = Int16Array.from([0, 16384, -16384, -32768]);
    const floats = pcmBase64ToFloat(bytesToBase64(new Uint8Array(pcm.buffer)));
    expect(Array.from(floats)).toEqual([0, 0.5, -0.5, -1]);
  });
});

describe('parseLiveMessage', () => {
  it('ignores anything unreadable', () => {
    expect(parseLiveMessage('not json')).toEqual({});
    expect(parseLiveMessage('null')).toEqual({});
  });
  it('separates this server\'s messages from Gemini\'s', () => {
    expect(parseLiveMessage('{"xpencex":{"error":"limit"}}').server).toEqual({ error: 'limit' });
    expect(parseLiveMessage('{"setupComplete":{}}').ready).toBe(true);
  });
  it('reads sound, captions, and the end of a turn', () => {
    const event = parseLiveMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] },
        inputTranscription: { text: 'hello' },
        outputTranscription: { text: 'hi' },
        turnComplete: true,
      },
    }));
    expect(event).toEqual({ audio: ['AAA='], heard: 'hello', said: 'hi', turnComplete: true });
  });
  it('notices being interrupted and closing soon', () => {
    expect(parseLiveMessage('{"serverContent":{"interrupted":true}}').interrupted).toBe(true);
    expect(parseLiveMessage('{"goAway":{"timeLeft":"5s"}}').closingSoon).toBe(true);
  });
  it('reads a request to show an expense', () => {
    const event = parseLiveMessage('{"toolCall":{"functionCalls":[{"id":"1","name":"record_expense","args":{"amount":200}}]}}');
    expect(event.toolCalls).toEqual([{ id: '1', name: 'record_expense', args: { amount: 200 } }]);
  });
});
