// Entries that need a category (chosen 2026-11-18): expenses left in "Other" over the last 3 money months. They are
// sorted one at a time, with a suggestion from the person's own history. Plain rules, so they can be tested.

import type { Expense } from '../../shared/types';
import { CategoryRule, normalizeWords, ruleCategoryFor } from '../categoryRules/categoryRules';

export const UNSORTED_MONTHS = 3;
export const OTHER_CATEGORY = 'Other';

// Words in money SMS titles that say nothing about what was bought
const COMMON_WORDS = new Set(['bkash', 'nagad', 'rocket', 'upay', 'bank', 'card', 'payment', 'purchase', 'send', 'money', 'cash', 'out', 'the', 'and', 'for', 'from']);

/** Other, unless it belongs to a lend and borrow entry or the person chose to keep it there */
export const needsCategory = (e: Pick<Expense, 'category' | 'categoryKept' | 'debtId'>) =>
  e.category === OTHER_CATEGORY && !e.categoryKept && !e.debtId;

const usefulWords = (title: string) => normalizeWords(title).split(/[^\p{L}\p{N}\p{M}]+/u).filter(w => w.length >= 3 && !COMMON_WORDS.has(w));

/**
 * The category to suggest: the person's own rule, else what they used most for the same title, else what they
 * used most for titles sharing a word. Nothing leaves the phone, and no AI is used.
 */
export function suggestCategory(
  title: string,
  history: Pick<Expense, 'title' | 'category'>[],
  categories: string[],
  rules: Pick<CategoryRule, 'words' | 'category' | 'createdAt'>[] = [],
): string | undefined {
  const ruled = ruleCategoryFor(title, rules, categories);
  if (ruled && ruled !== OTHER_CATEGORY) return ruled;
  const usable = history.filter(e => e.category !== OTHER_CATEGORY && categories.includes(e.category));
  const mostUsed = (list: typeof usable) => {
    const counts = new Map<string, number>();
    for (const e of list) counts.set(e.category, (counts.get(e.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const wanted = normalizeWords(title);
  const same = mostUsed(usable.filter(e => normalizeWords(e.title) === wanted));
  if (same) return same;
  const words = usefulWords(title);
  return words.length ? mostUsed(usable.filter(e => usefulWords(e.title).some(w => words.includes(w)))) : undefined;
}
