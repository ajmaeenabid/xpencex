import { describe, it, expect } from 'vitest';
import { MAX_LABEL_LENGTH, changedLabels, cleanLabel, cleanLabels, hasLabel, labelFields, labelTotals, recentLabels } from './labels';

describe('cleaning labels', () => {
  it('tidies spaces and keeps labels short', () => {
    expect(cleanLabel('  Eid   trip ')).toBe('Eid trip');
    expect(cleanLabel('x'.repeat(50))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('refuses empty text, other types and secret codes', () => {
    expect(cleanLabel('   ')).toBeUndefined();
    expect(cleanLabel(5)).toBeUndefined();
    expect(cleanLabel('OTP 482913')).toBeUndefined();
  });

  it('keeps at most 3, without repeats in other capitals', () => {
    expect(cleanLabels(['Eid', 'eid', 'Trip', 'Office', 'Wedding'])).toEqual(['Eid', 'Trip', 'Office']);
    expect(cleanLabels('Eid')).toEqual([]);
  });

  it('saves nothing for an entry with no labels', () => {
    expect(labelFields([])).toEqual({});
    expect(labelFields(undefined)).toEqual({});
    expect(labelFields(['Eid'])).toEqual({ labels: ['Eid'] });
  });

  it('finds a label whatever its capitals', () => {
    expect(hasLabel(['Eid Trip'], 'eid trip')).toBe(true);
    expect(hasLabel(undefined, 'eid')).toBe(false);
  });
});

describe('recent labels', () => {
  it('lists the newest first, once each', () => {
    const entries = [
      { date: '2026-11-01', labels: ['Old'] },
      { date: '2026-11-10', labels: ['New', 'Old'] },
      { date: '2026-11-05' },
    ];
    expect(recentLabels(entries)).toEqual(['New', 'Old']);
  });

  it('stops at the limit', () => {
    expect(recentLabels([{ date: '2026-11-01', labels: ['A', 'B', 'C'] }], 2)).toEqual(['A', 'B']);
  });
});

describe('label totals', () => {
  const expenses = [
    { amount: 1000, date: '2026-11-02', labels: ['Trip'] },
    { amount: 500.5, date: '2026-11-03', labels: ['trip', 'Food'] },
    { amount: 90, date: '2026-11-04' },
  ];
  const incomes = [{ amount: 2000, date: '2026-11-05', labels: ['Trip'] }];

  it('adds up spent, received and the difference, across capitals', () => {
    const trip = labelTotals(expenses, incomes).find(x => x.label === 'Trip')!;
    expect(trip).toMatchObject({ spent: 1500.5, received: 2000, net: 499.5, count: 3 });
    expect(trip.spellings.sort()).toEqual(['Trip', 'trip']);
  });

  it('counts an entry in each of its labels, and lists the latest first', () => {
    const totals = labelTotals(expenses, incomes);
    expect(totals.map(x => x.label)).toEqual(['Trip', 'Food']);
    expect(totals[1].spent).toBe(500.5);
  });

  it('is empty when nothing has a label', () => {
    expect(labelTotals([{ amount: 1, date: '2026-11-01' }], [])).toEqual([]);
  });
});

describe('renaming and removing', () => {
  it('renames every spelling and keeps other labels', () => {
    expect(changedLabels(['trip', 'Food'], ['Trip', 'trip'], 'Cox trip')).toEqual(['Cox trip', 'Food']);
  });

  it('does not repeat a label when renamed to one already there', () => {
    expect(changedLabels(['Trip', 'Food'], ['Trip'], 'food')).toEqual(['food']);
  });

  it('removes a label', () => {
    expect(changedLabels(['Trip', 'Food'], ['Trip'], null)).toEqual(['Food']);
    expect(changedLabels(['Trip'], ['Trip'], null)).toEqual([]);
  });
});
