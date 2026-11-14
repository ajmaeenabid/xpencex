// Recent searches in "Ask AI or search". They stay only on this phone, separately for each account,
// like the calculator's history. Two kinds: a place opened from the results (tap: open it again)
// and text sent to the AI with Ask (tap: back in the search box). Text is masked before it is kept,
// and text holding a secret (PIN, password, card number) is never kept.
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';

export type Recent = { kind: 'place'; id: string } | { kind: 'text'; text: string };

export const MAX_RECENTS = 8;
const MAX_TEXT = 120;
const keyFor = (uid: string) => `xpencex.recentSearches.${uid}`;

const same = (a: Recent, b: Recent) =>
  a.kind === 'place' && b.kind === 'place' ? a.id === b.id
    : a.kind === 'text' && b.kind === 'text' ? a.text.toLowerCase() === b.text.toLowerCase()
    : false;

/** The newest goes first; the same search again moves to the top instead of showing twice */
export function addRecent(list: Recent[], item: Recent): Recent[] {
  let entry = item;
  if (item.kind === 'text') {
    const text = item.text.trim().slice(0, MAX_TEXT);
    if (!text || containsSecret(text)) return list;
    entry = { kind: 'text', text: maskSensitive(text) };
  }
  return [entry, ...list.filter(r => !same(r, entry))].slice(0, MAX_RECENTS);
}

export function removeRecent(list: Recent[], item: Recent): Recent[] {
  return list.filter(r => !same(r, item));
}

/** Keeps only well-formed entries, and places that still exist */
export function cleanRecents(saved: unknown, placeIds: string[]): Recent[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((r): r is Recent =>
    (r?.kind === 'place' && typeof r.id === 'string' && placeIds.includes(r.id)) ||
    (r?.kind === 'text' && typeof r.text === 'string' && r.text.trim() !== ''),
  ).slice(0, MAX_RECENTS);
}

export function loadRecents(uid: string, placeIds: string[]): Recent[] {
  try {
    return cleanRecents(JSON.parse(localStorage.getItem(keyFor(uid)) || '[]'), placeIds);
  } catch {
    return []; // storage blocked or damaged: search still works, just without recents
  }
}

export function saveRecents(uid: string, list: Recent[]) {
  try {
    if (list.length) localStorage.setItem(keyFor(uid), JSON.stringify(list));
    else localStorage.removeItem(keyFor(uid));
  } catch {
    // not saved: recents just won't survive closing the app
  }
}
