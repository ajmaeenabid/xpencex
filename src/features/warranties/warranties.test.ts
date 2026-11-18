import { describe, it, expect } from 'vitest';
import { splitWarranties, warrantyDaysLeft, warrantyEnd, warrantyFromAi, warrantyOnDay, warrantyTooEarly } from './warranties';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const day = (iso?: string) => { const d = new Date(iso!); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

describe('warranty dates', () => {
  it('counts months from the day of purchase', () => {
    expect(day(warrantyEnd(at(2026, 11, 18), 6))).toEqual([2027, 5, 18]);
    expect(day(warrantyEnd(at(2026, 11, 18), 24))).toEqual([2028, 11, 18]);
  });

  it('uses the last day of a shorter month', () => {
    expect(day(warrantyEnd(at(2026, 8, 31), 6))).toEqual([2027, 2, 28]);
  });

  it('must end after the day of purchase', () => {
    expect(warrantyTooEarly(warrantyOnDay('2026-11-18'), '2026-11-18')).toBe(true);
    expect(warrantyTooEarly(warrantyOnDay('2026-11-19'), '2026-11-18')).toBe(false);
  });

  it('counts the days left', () => {
    const now = new Date(2026, 10, 18, 22);
    expect(warrantyDaysLeft(at(2026, 11, 18), now)).toBe(0);
    expect(warrantyDaysLeft(at(2026, 11, 25), now)).toBe(7);
    expect(warrantyDaysLeft(at(2026, 11, 17), now)).toBe(-1);
  });
});

describe('warranties from the AI', () => {
  const bought = at(2026, 11, 18);

  it('reads months or an end date', () => {
    expect(day(warrantyFromAi({ warrantyMonths: 24 }, bought))).toEqual([2028, 11, 18]);
    expect(day(warrantyFromAi({ warrantyUntil: '2027-01-05' }, bought))).toEqual([2027, 1, 5]);
  });

  it('adds nothing when none was mentioned or the value makes no sense', () => {
    expect(warrantyFromAi({}, bought)).toBeUndefined();
    expect(warrantyFromAi({ warrantyMonths: 0 }, bought)).toBeUndefined();
    expect(warrantyFromAi({ warrantyMonths: 500 }, bought)).toBeUndefined();
    expect(warrantyFromAi({ warrantyMonths: 1.5 }, bought)).toBeUndefined();
    expect(warrantyFromAi({ warrantyUntil: 'soon' }, bought)).toBeUndefined();
    expect(warrantyFromAi({ warrantyUntil: '2026-11-01' }, bought)).toBeUndefined();
  });
});

describe('listing warranties', () => {
  it('puts the soonest active first, then the latest ended, and skips entries with none', () => {
    const now = new Date(2026, 10, 18, 10);
    const list = [
      { id: 'late', warrantyUntil: at(2028, 1, 1) }, { id: 'soon', warrantyUntil: at(2026, 12, 1) },
      { id: 'old', warrantyUntil: at(2024, 1, 1) }, { id: 'recent', warrantyUntil: at(2026, 10, 1) },
      { id: 'today', warrantyUntil: at(2026, 11, 18) }, { id: 'none' },
    ];
    const { active, ended } = splitWarranties(list, now);
    expect(active.map(e => e.id)).toEqual(['today', 'soon', 'late']);
    expect(ended.map(e => e.id)).toEqual(['recent', 'old']);
  });
});
