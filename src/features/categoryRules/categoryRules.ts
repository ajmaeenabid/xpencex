// Category rules (chosen 2026-11-18): "a title with these words goes in this category". They fill the category on
// SMS and AI cards and on the Add screen, where it can still be changed. Past entries are never touched.
// The app offers a rule after the same title is corrected to the same category twice. Plain rules, so they can be tested.

import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';

export const MAX_RULES = 50;
export const MIN_WORDS = 2;
export const MAX_WORDS = 60;
export const CORRECTIONS_TO_OFFER = 2;
const MAX_REMEMBERED = 40;

export interface CategoryRule {
  id: string;
  uid: string;
  words: string;
  category: string;
  createdAt: string;
}

/** Capitals and extra spaces don't count */
export const normalizeWords = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** True when the words stand on their own in the title: "bus" is in "Bus fare" but not in "Abus" */
export function titleHasWords(title: string, words: string): boolean {
  const text = normalizeWords(title);
  const wanted = normalizeWords(words);
  if (!wanted) return false;
  for (let at = text.indexOf(wanted); at !== -1; at = text.indexOf(wanted, at + 1)) {
    const before = [...text.slice(0, at)].pop();
    const after = [...text.slice(at + wanted.length)][0];
    if ((!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after))) return true;
  }
  return false;
}

/** The rule for a title: the longest matching wording wins, then the newest */
export function matchRule<T extends Pick<CategoryRule, 'words' | 'category' | 'createdAt'>>(title: string, rules: T[]): T | undefined {
  return rules
    .filter(r => titleHasWords(title, r.words))
    .sort((a, b) => normalizeWords(b.words).length - normalizeWords(a.words).length || b.createdAt.localeCompare(a.createdAt))[0];
}

/** The category a rule gives this title, unless that category has since been deleted */
export function ruleCategoryFor(title: string | undefined, rules: Pick<CategoryRule, 'words' | 'category' | 'createdAt'>[], categories: string[]): string | undefined {
  if (!title) return undefined;
  const category = matchRule(title, rules)?.category;
  return categories.find(c => c.toLowerCase() === category?.toLowerCase());
}

/** Words that can be saved: one short line, numbers hidden, or undefined */
export function cleanWords(raw: string): string | undefined {
  if (containsSecret(raw)) return undefined;
  const words = maskSensitive(raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_WORDS).trim();
  return words.length >= MIN_WORDS ? words : undefined;
}

export type RuleProblem = 'full' | 'secret' | 'words' | 'same';

/** Why a rule can't be saved yet, or null. `editingId` is the rule being changed. */
export function ruleProblem(words: string, rules: Pick<CategoryRule, 'id' | 'words'>[], editingId?: string): RuleProblem | null {
  if (!editingId && rules.length >= MAX_RULES) return 'full';
  if (containsSecret(words)) return 'secret';
  const clean = cleanWords(words);
  if (!clean) return 'words';
  return rules.some(r => r.id !== editingId && normalizeWords(r.words) === normalizeWords(clean)) ? 'same' : null;
}

/**
 * The words a rule offer should use. Money SMS titles keep only the shop or person ("bKash Payment to Shwapno" gives
 * "Shwapno"). Titles with no name in them ("Bank payment"), or with long numbers, can't make a useful rule.
 */
export function ruleWordsFrom(title: string): string | undefined {
  const text = title.replace(/\s+/g, ' ').trim();
  const isSms = /^(?:bkash|nagad|rocket|upay|bank|card purchase|atm)\b/i.test(text);
  const named = isSms ? text.match(/\b(?:to|at)\s+(.+)$/i)?.[1] : text;
  if (!named || /\d{4,}|[*•]/.test(named)) return undefined;
  return cleanWords(named);
}

export interface CorrectionMemory {
  seen: Record<string, { category: string; count: number }>;
  declined: string[]; // offers the person said no to
}

export const NO_CORRECTIONS: CorrectionMemory = { seen: {}, declined: [] };

const offerKey = (words: string, category: string) => `${normalizeWords(words)}|${category.toLowerCase()}`;

/** Notes one correction, and says whether it is time to offer a rule */
export function recordCorrection(memory: CorrectionMemory, words: string, category: string): { memory: CorrectionMemory; offer: boolean } {
  const key = normalizeWords(words);
  if (memory.declined.includes(offerKey(words, category))) return { memory, offer: false };
  const last = memory.seen[key];
  const count = last?.category.toLowerCase() === category.toLowerCase() ? last.count + 1 : 1;
  const { [key]: _old, ...others } = memory.seen;
  if (count >= CORRECTIONS_TO_OFFER) return { memory: { ...memory, seen: others }, offer: true };
  // The newest are kept, so this list can't grow forever
  const kept = Object.entries(others).slice(-(MAX_REMEMBERED - 1));
  return { memory: { ...memory, seen: { ...Object.fromEntries(kept), [key]: { category, count } } }, offer: false };
}

/** The person said no, so this offer never comes back */
export const declineOffer = (memory: CorrectionMemory, words: string, category: string): CorrectionMemory =>
  ({ ...memory, declined: [...memory.declined, offerKey(words, category)].slice(-MAX_REMEMBERED) });
