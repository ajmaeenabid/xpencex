import { describe, it, expect, vi } from 'vitest';

vi.mock('../../shared/firebase', () => ({ db: {} }));
const { windowStart } = await import('./expenseQueries');

describe('windowStart', () => {
  const now = new Date(2026, 10, 11, 15, 30); // 11 Nov 2026, local time

  it('covers this month and the ones before it', () => {
    expect(new Date(windowStart(3, now)).getMonth()).toBe(8); // 1 September
    expect(new Date(windowStart(3, now)).getDate()).toBe(1);
    expect(new Date(windowStart(1, now)).getMonth()).toBe(10); // just this month
  });

  it('goes back across the year', () => {
    const start = new Date(windowStart(12, now));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2025, 11, 1]); // 1 December 2025
  });
});
