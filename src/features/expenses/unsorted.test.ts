import { describe, it, expect } from 'vitest';
import { needsCategory, suggestCategory } from './unsorted';

const categories = ['Food', 'Transport', 'Shopping', 'Other'];
const past = (title: string, category: string) => ({ title, category });

describe('which entries need a category', () => {
  it('finds entries left in Other', () => {
    expect(needsCategory({ category: 'Other' })).toBe(true);
    expect(needsCategory({ category: 'Food' })).toBe(false);
  });

  it('leaves out ones kept in Other, and lend and borrow entries', () => {
    expect(needsCategory({ category: 'Other', categoryKept: true })).toBe(false);
    expect(needsCategory({ category: 'Other', debtId: 'd1' })).toBe(false);
  });
});

describe('suggesting a category', () => {
  it('uses the person\'s own rule first', () => {
    const rules = [{ words: 'shwapno', category: 'Shopping', createdAt: '2026-11-01' }];
    expect(suggestCategory('Shwapno Mirpur', [past('Shwapno Mirpur', 'Food')], categories, rules)).toBe('Shopping');
  });

  it('uses what was picked most for the same title', () => {
    expect(suggestCategory('uber', [past('Uber', 'Transport'), past('UBER', 'Transport'), past('Uber', 'Food')], categories)).toBe('Transport');
  });

  it('uses a shared word when the title is new', () => {
    expect(suggestCategory('bKash Payment to Star Kabab', [past('Lunch at Star Kabab', 'Food')], categories)).toBe('Food');
  });

  it('ignores words every money message shares', () => {
    expect(suggestCategory('bKash Payment to Rahim', [past('bKash Payment to Shwapno', 'Shopping')], categories)).toBeUndefined();
  });

  it('never suggests Other or a deleted category', () => {
    expect(suggestCategory('Uber', [past('Uber', 'Other')], categories)).toBeUndefined();
    expect(suggestCategory('Uber', [past('Uber', 'Gone')], categories)).toBeUndefined();
  });

  it('has nothing to suggest without history', () => {
    expect(suggestCategory('Uber', [], categories)).toBeUndefined();
  });
});
