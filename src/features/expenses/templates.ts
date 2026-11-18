// Favourites ("templates") for the Add screen: one tap fills the form, then the person taps Save.
// Owner's choices (2026-11-16): the person's own favourites (up to 12, kept in the account) plus suggestions the app
// makes from what is added often; for expenses and income; shown on the Add screen only.
// Plain rules, no database calls, so they can be tested (saves are in templateService.ts).

export type TemplateKind = 'expense' | 'income';

/** A saved favourite (Firestore `templates`) */
export interface Template {
  id: string;
  uid: string;
  kind: TemplateKind;
  title: string;
  amount: number;
  category: string;
  accountId?: string;
  createdAt: string;
}

/** One chip in the Quick add row: a saved favourite, or a suggestion */
export interface QuickEntry {
  key: string;
  kind: TemplateKind;
  title: string;
  amount: number;
  category: string;
  accountId?: string;
  templateId?: string; // set for saved favourites
  times?: number; // suggestions: how often it was added recently
}

export const MAX_TEMPLATES = 12;
export const SUGGEST_MIN_TIMES = 3; // added at least this often...
export const SUGGEST_DAYS = 60; // ...within this many days
export const ROW_MAX = 10; // chips in the row

/** The same entry whatever the capitals or spaces: "Rickshaw  " 50 Transport = "rickshaw" 50 Transport */
export const entryKey = (e: { title: string; amount: number; category: string }) =>
  `${e.title.trim().replace(/\s+/g, ' ').toLowerCase()}|${Math.round(e.amount * 100) / 100}|${e.category}`;

/** Entries added at least 3 times in the last 60 days, most often first (then most recent) */
export function suggestions(
  recent: { title?: string; amount: number; category?: string; accountId?: string; date: string }[],
  kind: TemplateKind,
  now = new Date(),
): QuickEntry[] {
  const since = now.getTime() - SUGGEST_DAYS * 24 * 60 * 60 * 1000;
  const groups = new Map<string, QuickEntry & { last: number }>();
  for (const r of recent) {
    const title = (r.title || '').trim().replace(/\s+/g, ' ');
    const time = new Date(r.date).getTime();
    if (!title || !r.category || !(r.amount > 0) || time < since) continue;
    const key = entryKey({ title, amount: r.amount, category: r.category });
    const g = groups.get(key);
    if (g) {
      g.times = (g.times || 0) + 1;
      // The newest one decides the spelling and the account
      if (time > g.last) Object.assign(g, { title, accountId: r.accountId, last: time });
    } else {
      groups.set(key, { key, kind, title, amount: r.amount, category: r.category, accountId: r.accountId, times: 1, last: time });
    }
  }
  return [...groups.values()]
    .filter(g => (g.times || 0) >= SUGGEST_MIN_TIMES)
    .sort((a, b) => (b.times || 0) - (a.times || 0) || b.last - a.last)
    .map(({ last: _last, ...entry }) => entry);
}

/** The Quick add row: saved favourites first (oldest first, so they keep their place), then new suggestions */
export function quickRow(templates: Template[], suggested: QuickEntry[], kind: TemplateKind): QuickEntry[] {
  const saved: QuickEntry[] = templates
    .filter(t => t.kind === kind)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(t => ({ key: entryKey(t), kind, title: t.title, amount: t.amount, category: t.category, accountId: t.accountId, templateId: t.id }));
  const have = new Set(saved.map(s => s.key));
  return [...saved, ...suggested.filter(s => !have.has(s.key))].slice(0, Math.max(ROW_MAX, saved.length));
}

/** Why the form can't be saved as a favourite, or null */
export function favouriteProblem(
  form: { title: string; amount: number; category: string },
  templates: Template[],
  kind: TemplateKind,
): 'incomplete' | 'full' | 'exists' | null {
  if (!form.title.trim() || !(form.amount > 0) || !form.category) return 'incomplete';
  if (templates.some(t => t.kind === kind && entryKey(t) === entryKey(form))) return 'exists';
  if (templates.length >= MAX_TEMPLATES) return 'full';
  return null;
}
