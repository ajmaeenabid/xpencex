import { describe, expect, it } from 'vitest';
import { isSpendingTab, lastSpendingSide, rememberSpendingSide } from './spending';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('Spending tab', () => {
  it('counts both pages as the one tab', () => {
    expect(isSpendingTab('expenses')).toBe(true);
    expect(isSpendingTab('reports')).toBe(true);
    expect(isSpendingTab('home')).toBe(false);
  });

  it('opens on Expenses the first time, then on the side used last', () => {
    const store = memory();
    expect(lastSpendingSide(store)).toBe('expenses');
    rememberSpendingSide('reports', store);
    expect(lastSpendingSide(store)).toBe('reports');
    rememberSpendingSide('expenses', store);
    expect(lastSpendingSide(store)).toBe('expenses');
  });

  it('falls back to Expenses when nothing can be stored', () => {
    expect(lastSpendingSide(null)).toBe('expenses');
    expect(() => rememberSpendingSide('reports', null)).not.toThrow();
  });
});
