// Comments people send about Xpences (Profile > Send feedback). Plain rules, no database calls.
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';

export const MAX_FEEDBACK = 1000;

export interface Feedback {
  id: string;
  uid: string;
  text: string;
  createdAt: string;
}

export type FeedbackCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'tooLong' | 'secret' };

/**
 * What gets saved: trimmed, never an OTP, PIN or password (blocked), and account, card and phone
 * numbers hidden, the same as every other piece of text in the app.
 */
export function checkFeedback(raw: string): FeedbackCheck {
  const text = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_FEEDBACK) return { ok: false, reason: 'tooLong' };
  if (containsSecret(text)) return { ok: false, reason: 'secret' };
  return { ok: true, text: maskSensitive(text).slice(0, MAX_FEEDBACK) };
}
