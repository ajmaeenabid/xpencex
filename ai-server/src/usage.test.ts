import { describe, it, expect } from 'vitest';
import { classifyParts, firstBlocked, isAllowedLiveMessage, dailyLimits, limitsView, MAX_FILE_BYTES } from './usage';
import { bdDay } from './loanDates';

const b64 = (bytes: number) => 'A'.repeat(Math.ceil((bytes * 4) / 3));
const part = (mimeType: string, bytes = 10) => ({ inlineData: { mimeType, data: b64(bytes) } });

describe('classifyParts', () => {
  it('leaves plain text outside the voice and file limits', () => {
    expect(classifyParts([{ text: 'hello' }])).toEqual({ kind: null });
  });
  it('counts audio as voice and documents as files', () => {
    expect(classifyParts([{ text: 'x' }, part('audio/webm')]).kind).toBe('voice');
    expect(classifyParts([{ text: 'x' }, part('application/pdf')]).kind).toBe('file');
    expect(classifyParts([{ text: 'x' }, part('text/plain')]).kind).toBe('file');
  });
  it('allows exactly 5 MB and refuses anything above it', () => {
    expect(classifyParts([part('image/jpeg', MAX_FILE_BYTES)]).error).toBeUndefined();
    expect(classifyParts([part('image/jpeg', MAX_FILE_BYTES + 3)]).error).toMatch(/5 MB/);
  });
  it('refuses other file types, several files, and long audio', () => {
    expect(classifyParts([part('application/zip')]).error).toBeTruthy();
    expect(classifyParts([part('image/png'), part('image/png')]).error).toBeTruthy();
    expect(classifyParts([part('audio/webm', 3 * 1024 * 1024)]).error).toBeTruthy();
  });
});

describe('limits', () => {
  const limits = dailyLimits({});
  it('uses the agreed numbers by default', () => {
    expect(limits).toEqual({ ai: 30, voice: 5, file: 3, live: 3 });
  });
  it('blocks voice when either its own limit or the 30 is used up', () => {
    expect(firstBlocked(['voice', 'ai'], limits, { voice: 4, ai: 29 })).toBeNull();
    expect(firstBlocked(['voice', 'ai'], limits, { voice: 5, ai: 1 })).toBe('voice');
    expect(firstBlocked(['voice', 'ai'], limits, { voice: 1, ai: 30 })).toBe('ai');
  });
  it('shows zero used for anything not yet counted', () => {
    expect(limitsView(limits, { live: 2 }).live).toEqual({ used: 2, limit: 3 });
    expect(limitsView(limits, {}).ai).toEqual({ used: 0, limit: 30 });
  });
});

describe('daily reset', () => {
  it('starts a new day at midnight in Bangladesh, not 6 AM', () => {
    expect(bdDay(Date.UTC(2026, 10, 5, 17, 59))).toBe('2026-11-05'); // 11:59 PM there
    expect(bdDay(Date.UTC(2026, 10, 5, 18, 0))).toBe('2026-11-06'); // 12:00 AM there
  });
});

describe('live relay', () => {
  it('passes conversation messages and refuses a replacement setup', () => {
    expect(isAllowedLiveMessage('{"realtimeInput":{"audio":{}}}')).toBe(true);
    expect(isAllowedLiveMessage('{"toolResponse":{}}')).toBe(true);
    expect(isAllowedLiveMessage('{"setup":{"model":"other"}}')).toBe(false);
    expect(isAllowedLiveMessage(new ArrayBuffer(4))).toBe(false);
  });
});
