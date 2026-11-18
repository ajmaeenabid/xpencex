import { describe, it, expect } from 'vitest';
import { MAX_SAVED_FILTERS, applySaved, cleanFilterName, isFiltering, isShowing, readFilters, savedFilterProblem } from './savedFilters';
import { NO_FILTERS } from './transactionFilters';

describe('reading saved filters', () => {
  it('keeps what was saved', () => {
    const filters = { ...NO_FILTERS, accountId: 'a1', date: { preset: 'thisMonth' as const }, type: 'expense' as const, minAmount: 100, receiptOnly: true, feeling: 'regret' as const, label: 'Eid' };
    expect(readFilters(filters)).toEqual(filters);
  });

  it('keeps a custom range, and drops an unfinished one', () => {
    expect(readFilters({ date: { preset: 'custom', from: '2026-01-01', to: '2026-02-01' } }).date).toEqual({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' });
    expect(readFilters({ date: { preset: 'custom', from: '2026-01-01' } }).date).toBeNull();
  });

  it('falls back to no filter for anything it does not know', () => {
    expect(readFilters({ type: 'other', feeling: 'sad', minAmount: 'x', date: { preset: 'soon' }, label: 5 })).toEqual(NO_FILTERS);
    expect(readFilters(null)).toEqual(NO_FILTERS);
  });
});

describe('using saved filters', () => {
  it('knows when something is being filtered', () => {
    expect(isFiltering(NO_FILTERS, 'All')).toBe(false);
    expect(isFiltering(NO_FILTERS, 'Food')).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, receiptOnly: true }, 'All')).toBe(true);
  });

  it('knows which saved filter is on screen', () => {
    const saved = { filters: { ...NO_FILTERS, label: 'Eid' }, category: 'Food' };
    expect(isShowing(saved, { ...NO_FILTERS, label: 'Eid' }, 'Food')).toBe(true);
    expect(isShowing(saved, { ...NO_FILTERS, label: 'Eid' }, 'All')).toBe(false);
    expect(isShowing(saved, NO_FILTERS, 'Food')).toBe(false);
  });

  it('leaves out an account that was deleted', () => {
    const saved = { filters: { ...NO_FILTERS, accountId: 'gone', label: 'Eid' } };
    expect(applySaved(saved, ['a1'])).toEqual({ ...NO_FILTERS, label: 'Eid' });
    expect(applySaved({ filters: { ...NO_FILTERS, accountId: 'a1' } }, ['a1']).accountId).toBe('a1');
  });
});

describe('naming saved filters', () => {
  const saved = [{ id: 's1', name: 'Eid bills' }];

  it('tidies the name', () => {
    expect(cleanFilterName('  Eid   bills ')).toBe('Eid bills');
    expect(cleanFilterName('x'.repeat(50))).toHaveLength(30);
  });

  it('refuses an empty name, a secret code or the same name twice', () => {
    expect(savedFilterProblem(' ', saved)).toBe('name');
    expect(savedFilterProblem('OTP 482913', saved)).toBe('secret');
    expect(savedFilterProblem('eid BILLS', saved)).toBe('same');
    expect(savedFilterProblem('eid BILLS', saved, 's1')).toBeNull();
  });

  it('stops at the most a person can keep, but still allows renaming', () => {
    const full = Array.from({ length: MAX_SAVED_FILTERS }, (_, i) => ({ id: `s${i}`, name: `Filter ${i}` }));
    expect(savedFilterProblem('New', full)).toBe('full');
    expect(savedFilterProblem('New', full, 's0')).toBeNull();
  });
});
