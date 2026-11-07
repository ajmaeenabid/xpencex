import { describe, it, expect } from 'vitest';
import { canPinMore, cleanSpokenText, memoryBoundary, memoryFor, planNewChat } from './chatHistory';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import type { Chat, ChatMessage } from '../../shared/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20);
const msg = (id: string, daysAgo: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, role: 'user', content: id, timestamp: NOW - daysAgo * DAY, type: 'text', ...extra });

describe('memoryFor', () => {
  it('leaves out messages older than 10 days', () => {
    const turns = memoryFor([msg('old', 11), msg('edge', 10), msg('new', 1)], NOW);
    expect(turns.map(t => t.content)).toEqual(['edge', 'new']);
  });
  it('sends at most the last 10', () => {
    const list = Array.from({ length: 15 }, (_, i) => msg(`m${i}`, 0));
    const turns = memoryFor(list, NOW);
    expect(turns).toHaveLength(10);
    expect(turns[9].content).toBe('m14');
  });
  it('remembers a voice message by its written version', () => {
    const turns = memoryFor([msg('Voice message', 0, { voiceDuration: 4, spokenText: 'I spent 200 on lunch' })], NOW);
    expect(turns).toEqual([{ role: 'user', content: 'I spent 200 on lunch' }]);
  });
  it('skips a voice message with no written version, not sending "Voice message"', () => {
    expect(memoryFor([msg('Voice message', 0, { voiceDuration: 4 })], NOW)).toEqual([]);
  });
  it('skips live chat time markers but keeps what was said', () => {
    const turns = memoryFor([msg('Live chat', 0, { liveDuration: 30 }), msg('how much is left', 0)], NOW);
    expect(turns.map(t => t.content)).toEqual(['how much is left']);
  });
});

describe('memoryBoundary', () => {
  it('finds the first message still remembered', () => {
    expect(memoryBoundary([msg('a', 20), msg('b', 15), msg('c', 2)], NOW)).toBe(2);
  });
  it('says nothing for a chat with no old messages', () => {
    expect(memoryBoundary([msg('a', 2), msg('b', 1)], NOW)).toBe(-1);
    expect(memoryBoundary([], NOW)).toBe(-1);
  });
  it('points past the end when everything is old', () => {
    expect(memoryBoundary([msg('a', 20), msg('b', 15)], NOW)).toBe(2);
  });
});

describe('cleanSpokenText', () => {
  const clean = (text: unknown) => cleanSpokenText(text, containsSecret, maskSensitive);
  it('keeps normal words', () => {
    expect(clean('  I spent 200 on lunch ')).toBe('I spent 200 on lunch');
    expect(clean('আমি ২০০ টাকা খরচ করেছি')).toBeTruthy();
  });
  it('hides phone numbers', () => {
    expect(clean('call 01712345678 about food')).not.toContain('01712345678');
  });
  it('refuses a code, empty text and anything that is not text', () => {
    expect(clean('Your OTP is 482913')).toBeNull();
    expect(clean('   ')).toBeNull();
    expect(clean(undefined)).toBeNull();
    expect(clean(42)).toBeNull();
  });
  it('keeps it short', () => {
    expect(clean('word '.repeat(300))?.length).toBe(500);
  });
});

const chats = (count: number, pinned = 0, start = 0): Chat[] => Array.from({ length: count }, (_, i) => ({
  id: `c${start + i}`, uid: 'u', title: `Chat ${start + i}`, messages: [], createdAt: 0, updatedAt: start + i, pinned: i < pinned,
}));
const ids = (list: Chat[]) => list.map(c => c.id);

describe('planNewChat', () => {
  it('removes nothing with room left', () => {
    expect(planNewChat(chats(19))).toEqual({ canSave: true, remove: [] });
  });
  it('removes the unpinned chat unused for longest at 20', () => {
    const plan = planNewChat(chats(20));
    expect(plan.canSave).toBe(true);
    expect(ids(plan.remove)).toEqual(['c0']);
  });
  it('never removes a pinned chat', () => {
    expect(ids(planNewChat(chats(20, 5)).remove)).toEqual(['c5']);
    expect(ids(planNewChat(chats(20, 19)).remove)).toEqual(['c19']);
  });
  it('goes by last use, not by list order', () => {
    const list = chats(20);
    list[7].updatedAt = -5;
    expect(ids(planNewChat(list).remove)).toEqual(['c7']);
  });
  it('cannot save when all 20 are pinned', () => {
    expect(planNewChat(chats(20, 20))).toEqual({ canSave: false, remove: [] });
  });
  it('clears all the extras at once for someone already over the limit', () => {
    const plan = planNewChat(chats(25, 2));
    expect(plan.remove).toHaveLength(6);
    expect(plan.remove.every(c => !c.pinned)).toBe(true);
    expect(ids(plan.remove)[0]).toBe('c2');
  });
  it('removes nothing when 20 pinned chats fill it, even with unpinned ones', () => {
    expect(planNewChat(chats(23, 20))).toEqual({ canSave: false, remove: [] });
  });
});

describe('canPinMore', () => {
  it('allows up to 20 pins', () => {
    expect(canPinMore(chats(20, 19))).toBe(true);
    expect(canPinMore(chats(20, 20))).toBe(false);
  });
});
