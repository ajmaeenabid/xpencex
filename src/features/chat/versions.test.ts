import { describe, it, expect } from 'vitest';
import { actionsFor, allMessages, chatIsFull, packMessages, savedInAnotherVersion, startVersion, switchVersion, unpackMessages } from './versions';
import { chatUsage } from './limits';
import type { ChatMessage } from '../../shared/types';

const msg = (id: string, role: 'user' | 'assistant', content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, role, content, timestamp: 0, type: 'text', ...extra });
const chat = () => [msg('a', 'user', 'first'), msg('b', 'assistant', 'answer 1'), msg('c', 'user', 'second'), msg('d', 'assistant', 'answer 2')];
const words = (list: ChatMessage[]) => list.map(m => m.content);

describe('startVersion', () => {
  it('replaces the prompt and clears everything below it', () => {
    const next = startVersion(chat(), 'a', 'changed');
    expect(words(next)).toEqual(['changed']);
    expect(next[0].versionIndex).toBe(1);
    expect(next[0].versions).toHaveLength(2);
  });
  it('leaves messages above the prompt alone', () => {
    expect(words(startVersion(chat(), 'c', 'changed'))).toEqual(['first', 'answer 1', 'changed']);
  });
  it('resending keeps the same words as a new version', () => {
    const next = startVersion(chat(), 'c', 'second');
    expect(next[2].content).toBe('second');
    expect(next[2].versions).toHaveLength(2);
  });
  it('ignores a message that is not there', () => {
    expect(words(startVersion(chat(), 'zzz', 'x'))).toEqual(words(chat()));
  });
});

describe('switchVersion', () => {
  it('brings back the old prompt with its replies, and returns to the new one', () => {
    let list = startVersion(chat(), 'a', 'changed');
    list = [...list, msg('e', 'assistant', 'new answer')];
    list = switchVersion(list, 'a', 0);
    expect(words(list)).toEqual(['first', 'answer 1', 'second', 'answer 2']);
    list = switchVersion(list, 'a', 1);
    expect(words(list)).toEqual(['changed', 'new answer']);
  });
  it('handles versions inside versions', () => {
    let list = startVersion(chat(), 'c', 'second v2');
    list = [...list, msg('e', 'assistant', 'answer v2')];
    list = startVersion(list, 'a', 'first v2');
    list = switchVersion(list, 'a', 0);
    expect(words(list)).toEqual(['first', 'answer 1', 'second v2', 'answer v2']);
    list = switchVersion(list, 'c', 0);
    expect(words(list)).toEqual(['first', 'answer 1', 'second', 'answer 2']);
  });
  it('ignores a version that does not exist', () => {
    const list = startVersion(chat(), 'a', 'changed');
    expect(switchVersion(list, 'a', 5)).toBe(list);
    expect(switchVersion(list, 'a', -1)).toBe(list);
  });
});

describe('limits and versions', () => {
  it('editing above a voice, live or file message does not give it back', () => {
    const list = [
      msg('a', 'user', 'first'),
      msg('v', 'user', 'voice', { voiceDuration: 3 }),
      msg('l', 'user', 'live', { liveDuration: 20 }),
      msg('f', 'user', 'file', { attachment: { name: 'a.pdf', kind: 'pdf' } }),
    ];
    const next = startVersion(list, 'a', 'changed');
    expect(words(next)).toEqual(['changed']);
    expect(chatUsage(next)).toEqual({ voice: 1, live: 1, file: 1 });
  });
  it('counts each message once while a version is showing', () => {
    const list = switchVersion(startVersion(chat(), 'a', 'changed'), 'a', 0);
    expect(allMessages(list)).toHaveLength(4); // the new version has no replies yet
  });
});

describe('saving', () => {
  it('stores versions as text, and restores them exactly', () => {
    let list = startVersion(chat(), 'c', 'second v2');
    list = startVersion(list, 'a', 'first v2');
    const saved = packMessages(list);
    expect(saved[0].versions).toBeUndefined();
    expect(typeof saved[0].versionsText).toBe('string');
    const back = switchVersion(unpackMessages(saved), 'a', 0);
    expect(words(back)).toEqual(['first', 'answer 1', 'second v2']);
  });
  it('survives very deep editing that would break a nesting limit', () => {
    let list = [msg('a', 'user', 'v0'), msg('b', 'user', 'x')];
    for (let i = 0; i < 30; i++) list = [...startVersion(list, 'a', `v${i + 1}`), msg(`n${i}`, 'user', 'y')];
    const depth = (value: unknown): number => (value && typeof value === 'object'
      ? 1 + Math.max(0, ...Object.values(value).map(depth)) : 0);
    expect(depth(packMessages(list))).toBeLessThan(20);
  });
  it('drops undefined fields, which the database refuses', () => {
    const saved = packMessages([msg('a', 'user', 'x', { steps: undefined })]);
    expect('steps' in saved[0]).toBe(false);
  });
  it('keeps working if saved versions are damaged', () => {
    expect(unpackMessages([msg('a', 'user', 'x', { versionsText: '{bad' })])[0].content).toBe('x');
  });
  it('knows when a chat has no more room', () => {
    expect(chatIsFull(chat())).toBe(false);
    // Bangla takes three bytes a letter, so this is measured in bytes
    expect(chatIsFull([msg('a', 'user', 'ক'.repeat(320_000))])).toBe(true);
  });
});

describe('actionsFor', () => {
  const none = { copy: false, resend: false, edit: false, share: false };
  it('gives typed and spoken text copy, resend and edit', () => {
    expect(actionsFor(msg('a', 'user', 'hello'))).toEqual({ copy: true, resend: true, edit: true, share: false });
  });
  it('gives nothing to voice and live time messages', () => {
    expect(actionsFor(msg('a', 'user', 'Voice', { voiceDuration: 3 }))).toEqual(none);
    expect(actionsFor(msg('a', 'user', 'Live', { liveDuration: 3 }))).toEqual(none);
  });
  it('lets a file prompt copy only its text, with no resend', () => {
    const file = { name: 'a.pdf', kind: 'pdf' as const };
    expect(actionsFor(msg('a', 'user', 'add this', { attachment: file }))).toEqual({ ...none, copy: true });
    expect(actionsFor(msg('a', 'user', 'a.pdf', { attachment: file }))).toEqual(none);
  });
  it('gives written AI replies copy and share', () => {
    expect(actionsFor(msg('a', 'assistant', 'answer'))).toEqual({ ...none, copy: true, share: true });
  });
  it('gives errors and confirm cards nothing', () => {
    expect(actionsFor(msg('a', 'assistant', 'oops', { type: 'error' }))).toEqual(none);
    expect(actionsFor(msg('a', 'assistant', 'ok?', { type: 'expense_confirmation' }))).toEqual(none);
    expect(actionsFor(msg('a', 'assistant', 'ok?', { type: 'income_confirmation' }))).toEqual(none);
  });
});

describe('savedInAnotherVersion', () => {
  const card = (id: string, extra: Partial<ChatMessage> = {}) => msg(id, 'assistant', 'Look right?', { type: 'expense_confirmation', ...extra });
  it('warns on a new card when an earlier version saved the expense', () => {
    let list = [msg('a', 'user', 'lunch 200'), card('b', { resolved: true, saved: true })];
    list = [...startVersion(list, 'a', 'lunch 200'), card('c')];
    expect(savedInAnotherVersion(list, 'c')).toBe(true);
  });
  it('warns on an old card when a newer version saved the expense', () => {
    let list = [msg('a', 'user', 'lunch 200'), card('b')];
    list = [...startVersion(list, 'a', 'lunch 200'), card('c', { resolved: true, saved: true })];
    list = switchVersion(list, 'a', 0);
    expect(savedInAnotherVersion(list, 'b')).toBe(true);
  });
  it('stays quiet when the earlier card was cancelled, not saved', () => {
    let list = [msg('a', 'user', 'lunch 200'), card('b', { resolved: true })];
    list = [...startVersion(list, 'a', 'lunch 200'), card('c')];
    expect(savedInAnotherVersion(list, 'c')).toBe(false);
  });
  it('stays quiet for a first card, and for a different prompt further up', () => {
    const list = [
      msg('a', 'user', 'tea 20'), card('b', { resolved: true, saved: true }),
      msg('c', 'user', 'lunch 200'), card('d'),
    ];
    expect(savedInAnotherVersion(list, 'd')).toBe(false);
  });
});
