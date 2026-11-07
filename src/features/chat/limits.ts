import type { ChatMessage } from '../../shared/types';
import type { TKey } from '../../shared/i18n';
import { allMessages } from './versions';

// Daily limits are counted by the AI server (see ai-server/src/usage.ts), which can't be bypassed.
// The per-chat limits below are counted here, from the messages saved in the chat.
export const MAX_VOICE_SECONDS = 30;
export const MAX_LIVE_SECONDS = 60; // also LIVE_SECONDS in ai-server/wrangler.toml
export const TIME_WARNING_SECONDS = 10;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type MediaKind = 'voice' | 'live' | 'file';
export type LimitKind = MediaKind | 'ai';
export type Limits = Record<LimitKind, { used: number; limit: number }>;

const PER_CHAT: Record<MediaKind, number> = { voice: 2, live: 2, file: 1 };

const isVoice = (m: ChatMessage) => m.voiceDuration !== undefined;
const isLive = (m: ChatMessage) => m.liveDuration !== undefined;
const isFile = (m: ChatMessage) => m.attachment !== undefined;

/** How many voice messages, live chats and files this chat has used */
export function chatUsage(messages: ChatMessage[]): Record<MediaKind, number> {
  // Earlier versions count too, so editing a prompt above them doesn't hand the limit back
  const all = allMessages(messages);
  return {
    voice: all.filter(isVoice).length,
    live: all.filter(isLive).length,
    file: all.filter(isFile).length,
  };
}

const NOTICE_KEYS: Record<MediaKind, Record<'chat' | 'day', Record<'warning' | 'reached', TKey>>> = {
  voice: {
    chat: { warning: 'limit.voice.chatWarn', reached: 'limit.voice.chatDone' },
    day: { warning: 'limit.voice.dayWarn', reached: 'limit.voice.dayDone' },
  },
  live: {
    chat: { warning: 'limit.live.chatWarn', reached: 'limit.live.chatDone' },
    day: { warning: 'limit.live.dayWarn', reached: 'limit.live.dayDone' },
  },
  file: {
    chat: { warning: 'limit.file.chatDone', reached: 'limit.file.chatDone' },
    day: { warning: 'limit.file.dayWarn', reached: 'limit.file.dayDone' },
  },
};

const left = (limits: Limits | null, kind: LimitKind) =>
  limits ? Math.max(0, limits[kind].limit - limits[kind].used) : Infinity;

/** Why this can't be used right now, or null when it can. Voice and files need one of the daily AI requests too. */
export function blockedBy(kind: MediaKind, limits: Limits | null, usage: Record<MediaKind, number>): TKey | null {
  if (left(limits, kind) === 0) return NOTICE_KEYS[kind].day.reached;
  if (usage[kind] >= PER_CHAT[kind]) return NOTICE_KEYS[kind].chat.reached;
  if (kind !== 'live' && left(limits, 'ai') === 0) return 'limit.ai.done';
  return null;
}

/**
 * The "only 1 left" note for an option someone just tapped, or null. A limit of one has no note,
 * because it would show on every new chat. The daily limit comes first when both are nearly used.
 */
export function warningFor(kind: MediaKind, limits: Limits | null, usage: Record<MediaKind, number>): TKey | null {
  if (left(limits, kind) === 1) return NOTICE_KEYS[kind].day.warning;
  if (PER_CHAT[kind] > 1 && PER_CHAT[kind] - usage[kind] === 1) return NOTICE_KEYS[kind].chat.warning;
  return null;
}

/** True for the gentle "only 1 left" notes, as opposed to "used up" and error messages */
export const isGentleNote = (key: TKey) => /warn$/i.test(key) || key.startsWith('chat.removed') || key.startsWith('chat.offline');

/** How many daily AI messages are left, or null before the server has said */
export const aiMessagesLeft = (limits: Limits | null) => (limits ? Math.max(0, limits.ai.limit - limits.ai.used) : null);

export const formatClock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
