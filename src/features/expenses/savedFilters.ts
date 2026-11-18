// Saved filters on the Expenses screen (chosen 2026-11-18): up to 5 named filters on the account, each remembering the
// filter sheet and the category chip. "This month" stays relative; a custom range keeps its dates. The search text is
// not saved. Plain rules, no database calls, so they can be tested.

import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { DatePreset, NO_FILTERS, TransactionFilters, activeCount } from './transactionFilters';

export const MAX_SAVED_FILTERS = 5;
export const MAX_FILTER_NAME = 30;
export const ALL_CATEGORIES = 'All';

export interface SavedFilter {
  id: string;
  uid: string;
  name: string;
  filters: TransactionFilters;
  category: string; // the category chip: 'All', the income chip or a category's name
  createdAt: string;
}

const PRESETS: DatePreset[] = ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'custom'];
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

/** Saved filters as the app can use them, whatever an old backup holds */
export function readFilters(raw: unknown): TransactionFilters {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = (f.date && typeof f.date === 'object' ? f.date : null) as Record<string, unknown> | null;
  const preset = PRESETS.find(p => p === d?.preset);
  const custom = preset === 'custom' && text(d?.from) && text(d?.to);
  const date = !preset || (preset === 'custom' && !custom) ? null
    : custom ? { preset, from: d!.from as string, to: d!.to as string } : { preset };
  return {
    ...NO_FILTERS,
    accountId: text(f.accountId),
    date,
    type: f.type === 'expense' || f.type === 'income' ? f.type : 'all',
    minAmount: number(f.minAmount),
    maxAmount: number(f.maxAmount),
    receiptOnly: f.receiptOnly === true,
    feeling: f.feeling === 'worth' || f.feeling === 'regret' ? f.feeling : null,
    label: text(f.label),
  };
}

/** Whether anything is being filtered right now, so there is something to save */
export const isFiltering = (filters: TransactionFilters, category: string) => activeCount(filters) > 0 || category !== ALL_CATEGORIES;

/** Whether the screen is showing exactly this saved filter */
export const isShowing = (saved: Pick<SavedFilter, 'filters' | 'category'>, filters: TransactionFilters, category: string) =>
  saved.category === category && JSON.stringify(readFilters(saved.filters)) === JSON.stringify(readFilters(filters));

/** A saved filter's settings to apply, leaving out an account that has since been deleted */
export function applySaved(saved: Pick<SavedFilter, 'filters'>, accountIds: string[]): TransactionFilters {
  const filters = readFilters(saved.filters);
  return filters.accountId && !accountIds.includes(filters.accountId) ? { ...filters, accountId: null } : filters;
}

/** A name that can be saved, or undefined */
export function cleanFilterName(raw: string): string | undefined {
  if (containsSecret(raw)) return undefined;
  return maskSensitive(raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_FILTER_NAME).trim() || undefined;
}

export type SavedFilterProblem = 'full' | 'secret' | 'name' | 'same';

/** Why a name can't be saved yet, or null. `editingId` is the saved filter being renamed. */
export function savedFilterProblem(name: string, saved: Pick<SavedFilter, 'id' | 'name'>[], editingId?: string): SavedFilterProblem | null {
  if (!editingId && saved.length >= MAX_SAVED_FILTERS) return 'full';
  if (containsSecret(name)) return 'secret';
  const clean = cleanFilterName(name);
  if (!clean) return 'name';
  return saved.some(s => s.id !== editingId && s.name.toLowerCase() === clean.toLowerCase()) ? 'same' : null;
}
