import type { ChatMessage, MessageVersion } from '../../shared/types';

// Editing or resending a prompt keeps the old one, with its replies, as an earlier version.
// `messages` is always the path on screen; each prompt holds the versions that aren't showing.

const MAX_CHAT_BYTES = 900_000; // a saved chat can hold about 1 MB

const versionsOf = (message: ChatMessage): MessageVersion[] =>
  message.versions?.map(v => ({ ...v })) ?? [{ content: message.content, after: [] }];

const currentOf = (message: ChatMessage) => message.versionIndex ?? 0;

/** Keeps what's showing as an earlier version and starts a new one with nothing below it */
export function startVersion(messages: ChatMessage[], id: string, content: string): ChatMessage[] {
  const index = messages.findIndex(m => m.id === id);
  if (index < 0) return messages;
  const message = messages[index];
  const versions = versionsOf(message);
  versions[currentOf(message)] = { content: message.content, after: messages.slice(index + 1) };
  versions.push({ content, after: [] });
  return [...messages.slice(0, index), { ...message, content, versions, versionIndex: versions.length - 1 }];
}

/** Shows another version of a prompt, with the replies that belong to it */
export function switchVersion(messages: ChatMessage[], id: string, target: number): ChatMessage[] {
  const index = messages.findIndex(m => m.id === id);
  if (index < 0) return messages;
  const message = messages[index];
  const versions = versionsOf(message);
  if (target < 0 || target >= versions.length || target === currentOf(message)) return messages;
  versions[currentOf(message)] = { content: message.content, after: messages.slice(index + 1) };
  const chosen = versions[target];
  versions[target] = { content: chosen.content, after: [] };
  return [...messages.slice(0, index), { ...message, content: chosen.content, versions, versionIndex: target }, ...chosen.after];
}

/** Every message in the chat, including those in versions that aren't showing */
export function allMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap(m => [m, ...allMessages((m.versions || []).flatMap(v => v.after))]);
}

/**
 * For saving. Versions sit inside versions, and the database refuses data nested more than 20 levels
 * deep, so they're stored as text. Also removes the undefined fields the database rejects.
 */
export function packMessages(messages: ChatMessage[]): ChatMessage[] {
  return JSON.parse(JSON.stringify(messages.map(({ versions, ...rest }) =>
    versions ? { ...rest, versionsText: JSON.stringify(versions) } : rest)));
}

/** Reverses packMessages when a saved chat is opened */
export function unpackMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({ versionsText, ...rest }) => {
    if (!versionsText) return rest;
    try {
      return { ...rest, versions: JSON.parse(versionsText) as MessageVersion[] };
    } catch {
      return rest; // damaged: the version on screen still works
    }
  });
}

/** True when another version might not fit in the saved chat */
export const chatIsFull = (messages: ChatMessage[]) =>
  new TextEncoder().encode(JSON.stringify(packMessages(messages))).length > MAX_CHAT_BYTES;

export type MessageActions = { copy: boolean; resend: boolean; edit: boolean; share: boolean };

const NONE: MessageActions = { copy: false, resend: false, edit: false, share: false };

/**
 * True when a confirm card's prompt has another version that already saved something,
 * so confirming this card too would add the same spending twice.
 */
export function savedInAnotherVersion(messages: ChatMessage[], cardId: string): boolean {
  const index = messages.findIndex(m => m.id === cardId);
  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    return allMessages((message.versions || []).flatMap(v => v.after)).some(m => m.saved);
  }
  return false;
}

/** Which buttons a message gets */
export function actionsFor(message: ChatMessage): MessageActions {
  if (message.voiceDuration !== undefined || message.liveDuration !== undefined) return NONE;
  if (message.role === 'user') {
    if (!message.attachment) return { copy: true, resend: true, edit: true, share: false };
    // A file can't be sent again, because it isn't kept. With no message, the name is all that's there.
    return { ...NONE, copy: message.content !== message.attachment.name };
  }
  const written = !message.type || message.type === 'text';
  return written && message.content ? { ...NONE, copy: true, share: true } : NONE;
}
