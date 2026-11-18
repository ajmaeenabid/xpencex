// Labels (chosen 2026-11-18): optional words on an expense or income that group entries for one event, such as
// "Eid 2027" or "Cox's Bazar trip". Up to 3 per entry. Plain rules, no database calls, so they can be tested.

import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';

export const MAX_LABELS = 3;
export const MAX_LABEL_LENGTH = 30;

const key = (label: string) => label.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

export const sameLabel = (a: string, b: string) => key(a) === key(b);
export const hasLabel = (labels: string[] | undefined, label: string) => (labels || []).some(l => sameLabel(l, label));

/** A label that can be saved: one short line with codes refused and numbers hidden, or undefined */
export function cleanLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || containsSecret(raw)) return undefined;
  return maskSensitive(raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_LABEL_LENGTH).trim() || undefined;
}

/** Only usable labels, without repeats (capitals don't count), at most 3 */
export function cleanLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const label = cleanLabel(item);
    if (label && !hasLabel(out, label) && out.length < MAX_LABELS) out.push(label);
  }
  return out;
}

/** What to save on a new entry: nothing at all when it has no labels */
export const labelFields = (labels: string[] | undefined): { labels?: string[] } => (labels?.length ? { labels } : {});

interface Labelled { labels?: string[]; date: string }

/** The labels used most recently, newest first */
export function recentLabels(entries: Labelled[], max = 8): string[] {
  const out: string[] = [];
  for (const entry of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const label of entry.labels || []) {
      if (!hasLabel(out, label)) out.push(label);
      if (out.length === max) return out;
    }
  }
  return out;
}

export interface LabelTotal {
  label: string; // the newest spelling
  spellings: string[]; // every spelling found, so a rename catches them all
  spent: number;
  received: number;
  net: number; // received minus spent
  count: number;
  lastDate: string;
}

/** Spent, received and the difference for each label, most recently used first */
export function labelTotals(expenses: (Labelled & { amount: number })[], incomes: (Labelled & { amount: number })[]): LabelTotal[] {
  const totals = new Map<string, LabelTotal>();
  const add = (entry: Labelled & { amount: number }, side: 'spent' | 'received') => {
    for (const label of new Set(entry.labels || [])) {
      const id = key(label);
      const total = totals.get(id) || { label, spellings: [], spent: 0, received: 0, net: 0, count: 0, lastDate: '' };
      if (!total.spellings.includes(label)) total.spellings.push(label);
      if (entry.date > total.lastDate) { total.label = label; total.lastDate = entry.date; }
      total[side] = round2(total[side] + entry.amount);
      total.net = round2(total.received - total.spent);
      total.count += 1;
      totals.set(id, total);
    }
  };
  expenses.forEach(e => add(e, 'spent'));
  incomes.forEach(d => add(d, 'received'));
  return [...totals.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** An entry's labels after a label is renamed, or removed when `to` is null */
export function changedLabels(labels: string[], spellings: string[], to: string | null): string[] {
  const next = labels.flatMap(l => (spellings.some(s => sameLabel(s, l)) ? (to ? [to] : []) : [l]));
  return cleanLabels(next);
}
