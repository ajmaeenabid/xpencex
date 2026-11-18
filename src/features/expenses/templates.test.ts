import { describe, expect, it } from 'vitest';
import { MAX_TEMPLATES, Template, favouriteProblem, quickRow, suggestions } from './templates';

const NOW = new Date('2026-11-16T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const tpl = (id: string, extra: Partial<Template> = {}): Template => ({
  id, uid: 'u', kind: 'expense', title: 'Lunch', amount: 120, category: 'Food', createdAt: `2026-11-0${id.length}T00:00:00Z`, ...extra,
});

describe('favourites', () => {
  it('suggests what was added 3 times in 60 days, most often first', () => {
    const recent = [
      ...[1, 2, 3, 4].map(n => ({ title: 'Rickshaw', amount: 50, category: 'Transport', date: daysAgo(n) })),
      ...[1, 5, 9].map(n => ({ title: 'lunch ', amount: 120, category: 'Food', date: daysAgo(n) })),
      ...[1, 2].map(n => ({ title: 'Tea', amount: 20, category: 'Food', date: daysAgo(n) })), // only twice
      ...[70, 71, 72].map(n => ({ title: 'Old', amount: 10, category: 'Food', date: daysAgo(n) })), // too long ago
    ];
    const s = suggestions(recent, 'expense', NOW);
    expect(s.map(x => [x.title, x.times])).toEqual([['Rickshaw', 4], ['lunch', 3]]);
  });

  it('treats different amounts or categories as different entries', () => {
    const recent = [50, 50, 60].map((amount, i) => ({ title: 'Rickshaw', amount, category: 'Transport', date: daysAgo(i) }));
    expect(suggestions(recent, 'expense', NOW)).toEqual([]);
  });

  it('puts saved favourites first and never shows a suggestion twice', () => {
    const saved = [tpl('b', { title: 'Rickshaw', amount: 50, category: 'Transport', createdAt: '2026-11-02T00:00:00Z' }), tpl('a', { createdAt: '2026-11-01T00:00:00Z' })];
    const suggested = suggestions([1, 2, 3].map(n => ({ title: 'rickshaw', amount: 50, category: 'Transport', date: daysAgo(n) })), 'expense', NOW);
    const row = quickRow(saved, suggested, 'expense');
    expect(row.map(r => r.title)).toEqual(['Lunch', 'Rickshaw']);
    expect(row.every(r => r.templateId)).toBe(true);
    expect(quickRow(saved, [], 'income')).toEqual([]);
  });

  it('saves a favourite only when complete, new, and there is room', () => {
    const form = { title: 'Recharge', amount: 100, category: 'Bills' };
    expect(favouriteProblem({ ...form, title: ' ' }, [], 'expense')).toBe('incomplete');
    expect(favouriteProblem({ ...form, amount: 0 }, [], 'expense')).toBe('incomplete');
    expect(favouriteProblem({ title: 'lunch', amount: 120, category: 'Food' }, [tpl('a')], 'expense')).toBe('exists');
    const full = Array.from({ length: MAX_TEMPLATES }, (_, i) => tpl(`t${i}`, { title: `T${i}` }));
    expect(favouriteProblem(form, full, 'expense')).toBe('full');
    expect(favouriteProblem(form, [tpl('a')], 'expense')).toBeNull();
  });
});
