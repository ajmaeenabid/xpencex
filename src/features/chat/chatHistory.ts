import type { ChatMessage, Chat } from '../../shared/types';

// What the assistant remembers of a chat, and how many chats are kept.
export const MEMORY_DAYS = 10;
export const MEMORY_MESSAGES = 10;
export const MAX_SAVED_CHATS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPOKEN_CHARS = 500;

export type MemoryTurn = { role: 'user' | 'assistant'; content: string };

const isRecent = (message: ChatMessage, now: number) => message.timestamp >= now - MEMORY_DAYS * DAY_MS;

/** The recent messages sent along with a new question. Older messages stay on screen but aren't sent. */
export function memoryFor(messages: ChatMessage[], now: number): MemoryTurn[] {
  const turns: MemoryTurn[] = [];
  for (const message of messages) {
    if (!isRecent(message, now) || message.liveDuration !== undefined) continue;
    // A voice message has no words of its own, only the written version of what was said
    const content = message.voiceDuration !== undefined ? message.spokenText : message.content;
    if (content) turns.push({ role: message.role, content });
  }
  return turns.slice(-MEMORY_MESSAGES);
}

/**
 * Where to show "I only remember newer messages": the position of the first message still remembered.
 * -1 when nothing in the chat is old enough, and the end of the chat when everything is.
 */
export function memoryBoundary(messages: ChatMessage[], now: number): number {
  if (!messages.length || isRecent(messages[0], now)) return -1;
  const first = messages.findIndex(m => isRecent(m, now));
  return first < 0 ? messages.length : first;
}

/** The written version of a voice message, ready to keep. Null when it's empty or holds a code. */
export function cleanSpokenText(
  text: unknown,
  containsSecret: (value: string) => boolean,
  mask: (value: string) => string,
): string | null {
  if (typeof text !== 'string' || !text.trim() || containsSecret(text)) return null;
  return mask(text.trim()).slice(0, MAX_SPOKEN_CHARS);
}

export const pinnedCount = (chats: Chat[]) => chats.filter(c => c.pinned).length;

export const canPinMore = (chats: Chat[]) => pinnedCount(chats) < MAX_SAVED_CHATS;

/**
 * What starting one more saved chat means, given the chats already saved. It can't be saved when
 * every place is taken by a pinned chat. Otherwise the unpinned chats unused for longest make room.
 */
export function planNewChat(saved: Chat[]): { canSave: boolean; remove: Chat[] } {
  if (pinnedCount(saved) >= MAX_SAVED_CHATS) return { canSave: false, remove: [] };
  const extra = saved.length + 1 - MAX_SAVED_CHATS;
  if (extra <= 0) return { canSave: true, remove: [] };
  const oldestFirst = saved.filter(c => !c.pinned).sort((a, b) => a.updatedAt - b.updatedAt);
  return { canSave: true, remove: oldestFirst.slice(0, extra) };
}
