// Recent calculator sums. They stay only on this phone, separately for each account that signs in.

export interface HistoryEntry {
  expr: string;
  result: string; // as the calculator types it, so it can be used again
}

const MAX_ENTRIES = 20;
const keyFor = (uid: string) => `xpencex.calcHistory.${uid}`;

/** The newest goes first. Repeating the same sum doesn't add it twice. */
export function addHistory(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (list[0]?.expr === entry.expr && list[0]?.result === entry.result) return list;
  return [entry, ...list].slice(0, MAX_ENTRIES);
}

/** A number on its own isn't a sum worth remembering */
export const isWorthKeeping = (expr: string) => !/^−?[\d.]*$/.test(expr);

export function loadHistory(uid: string): HistoryEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(uid)) || '[]');
    return Array.isArray(saved)
      ? saved.filter(e => typeof e?.expr === 'string' && typeof e?.result === 'string').slice(0, MAX_ENTRIES)
      : [];
  } catch {
    return []; // storage blocked or damaged: the calculator still works, just without history
  }
}

export function saveHistory(uid: string, list: HistoryEntry[]) {
  try {
    if (list.length) localStorage.setItem(keyFor(uid), JSON.stringify(list));
    else localStorage.removeItem(keyFor(uid));
  } catch {
    // not saved: history just won't survive closing the app
  }
}
