import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { TKey } from '../../shared/i18n';
import { parseTransactionSms } from '../../shared/lib/smsParser';
import { fetchLimits, onLimitsChange } from './aiService';
import { Limits, MediaKind, aiMessagesLeft, blockedBy, warningFor } from './limits';
import { isOnline } from '../../shared/lib/offlineSave';

const LIMIT_NOTE_MS = 3000;

/** Today's limits from the server, and the short notes shown when something is at its limit */
export function useLimitNotes(user: User | null, active: boolean, usage: Record<MediaKind, number>, categories: string[]) {
  // How much of each daily limit is used, from the server
  const [limits, setLimits] = useState<Limits | null>(null);
  // A one-off limit message, such as a file that's too big
  const [limitNote, setLimitNote] = useState<TKey | null>(null);
  const [limitNoteVars, setLimitNoteVars] = useState<Record<string, string | number> | undefined>();
  // Each "only 1 left" note shows once per chat, so it doesn't nag
  const warnedRef = useRef<Set<TKey>>(new Set());

  useEffect(() => {
    if (!user) return;
    onLimitsChange(setLimits);
    return () => onLimitsChange(null);
  }, [user]);

  // Limit messages appear when something is tapped, and don't stay on the screen
  useEffect(() => {
    if (!limitNote) return;
    const timer = window.setTimeout(() => setLimitNote(null), LIMIT_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [limitNote]);

  // Refreshed each time the chat opens, because the limits reset at midnight
  useEffect(() => {
    if (!user || !active) return;
    fetchLimits().then(setLimits).catch(err => console.error('Could not load limits', err));
  }, [user, active]);

  const warnOnce = (key: TKey | null) => {
    if (!key || warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    setLimitNote(key);
  };

  // Tapping something at its limit says why, instead of doing nothing. With 1 left, it says so once and carries on.
  const explainIfBlocked = (kind: MediaKind) => {
    // Voice, live chat and files all go to the server
    if (!isOnline()) {
      setLimitNote('chat.offlineMedia');
      return true;
    }
    const reason = blockedBy(kind, limits, usage);
    if (reason) {
      setLimitNote(reason);
      return true;
    }
    // The file menu would cover this note, so files show it once a file is picked
    if (kind !== 'file') warnOnce(warningFor(kind, limits, usage));
    return false;
  };

  // A wallet or bank SMS is read on the phone, so it doesn't need one of the daily AI messages
  const explainIfNoAiLeft = (text: string) => {
    const left = aiMessagesLeft(limits);
    if (left === null || left > 1 || parseTransactionSms(text, categories)) return false;
    if (left === 0) {
      setLimitNote('limit.ai.done');
      return true;
    }
    warnOnce('limit.ai.warn');
    return false;
  };

  return { limits, setLimits, limitNote, setLimitNote, limitNoteVars, setLimitNoteVars, warnedRef, warnOnce, explainIfBlocked, explainIfNoAiLeft };
}
