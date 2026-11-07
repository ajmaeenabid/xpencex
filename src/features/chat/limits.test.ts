import { describe, it, expect } from 'vitest';
import { aiMessagesLeft, blockedBy, chatUsage, isGentleNote, Limits, warningFor } from './limits';
import type { ChatMessage } from '../../shared/types';

const limits = (over: Partial<Record<keyof Limits, number>> = {}): Limits => ({
  ai: { used: over.ai ?? 0, limit: 30 },
  voice: { used: over.voice ?? 0, limit: 5 },
  live: { used: over.live ?? 0, limit: 3 },
  file: { used: over.file ?? 0, limit: 3 },
});
const none = { voice: 0, live: 0, file: 0 };

describe('chatUsage', () => {
  it('counts voice messages, live chats and files in this chat', () => {
    const base = { id: 'x', role: 'user', content: 'x', timestamp: 0 } as ChatMessage;
    expect(chatUsage([
      { ...base, voiceDuration: 3 },
      { ...base, voiceDuration: 5 },
      { ...base, liveDuration: 40 },
      { ...base, attachment: { name: 'a.pdf', kind: 'pdf' } },
      base,
    ])).toEqual({ voice: 2, live: 1, file: 1 });
  });
});

describe('blockedBy', () => {
  it('allows use while nothing is used up', () => {
    expect(blockedBy('voice', limits(), none)).toBeNull();
    expect(blockedBy('voice', null, none)).toBeNull(); // limits not loaded yet: the server still checks
  });
  it('stops at 2 voice, 2 live and 1 file in one chat', () => {
    expect(blockedBy('voice', limits(), { ...none, voice: 1 })).toBeNull();
    expect(blockedBy('voice', limits(), { ...none, voice: 2 })).toBe('limit.voice.chatDone');
    expect(blockedBy('live', limits(), { ...none, live: 2 })).toBe('limit.live.chatDone');
    expect(blockedBy('file', limits(), { ...none, file: 1 })).toBe('limit.file.chatDone');
  });
  it('stops at 5 voice, 3 live and 3 files in one day', () => {
    expect(blockedBy('voice', limits({ voice: 5 }), none)).toBe('limit.voice.dayDone');
    expect(blockedBy('live', limits({ live: 3 }), none)).toBe('limit.live.dayDone');
    expect(blockedBy('file', limits({ file: 3 }), none)).toBe('limit.file.dayDone');
  });
  it('needs a daily AI request for voice and files, but not for live chat', () => {
    expect(blockedBy('voice', limits({ ai: 30 }), none)).toBe('limit.ai.done');
    expect(blockedBy('file', limits({ ai: 30 }), none)).toBe('limit.ai.done');
    expect(blockedBy('live', limits({ ai: 30 }), none)).toBeNull();
  });
});

describe('warningFor', () => {
  it('says nothing when plenty is left, including 1 file on a new chat', () => {
    expect(warningFor('voice', limits(), none)).toBeNull();
    expect(warningFor('live', limits(), none)).toBeNull();
    expect(warningFor('file', limits(), none)).toBeNull();
  });
  it('warns when exactly 1 is left, for a chat or a day', () => {
    expect(warningFor('voice', limits(), { ...none, voice: 1 })).toBe('limit.voice.chatWarn');
    expect(warningFor('live', limits(), { ...none, live: 1 })).toBe('limit.live.chatWarn');
    expect(warningFor('voice', limits({ voice: 4 }), none)).toBe('limit.voice.dayWarn');
    expect(warningFor('live', limits({ live: 2 }), none)).toBe('limit.live.dayWarn');
    expect(warningFor('file', limits({ file: 2 }), none)).toBe('limit.file.dayWarn');
  });
  it('mentions the day first when both are nearly used', () => {
    expect(warningFor('voice', limits({ voice: 4 }), { ...none, voice: 1 })).toBe('limit.voice.dayWarn');
  });
  it('waits until the limits have loaded', () => {
    expect(warningFor('voice', null, none)).toBeNull();
  });
});

describe('notes', () => {
  it('tells gentle notes from limits that are used up', () => {
    expect(isGentleNote('limit.voice.chatWarn')).toBe(true);
    expect(isGentleNote('limit.ai.warn')).toBe(true);
    expect(isGentleNote('limit.ai.done')).toBe(false);
    expect(isGentleNote('limit.file.size')).toBe(false);
  });
  it('counts the AI messages left', () => {
    expect(aiMessagesLeft(null)).toBeNull();
    expect(aiMessagesLeft(limits({ ai: 29 }))).toBe(1);
    expect(aiMessagesLeft(limits({ ai: 40 }))).toBe(0);
  });
});
