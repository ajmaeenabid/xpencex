import { describe, it, expect } from 'vitest';
import { mergeOrder, placeVisible } from './sectionOrder';

describe('card order', () => {
  const defaults = ['budget', 'spending', 'accounts', 'calculator', 'recent'];

  it('uses the default order when nothing is saved', () => {
    expect(mergeOrder(undefined, defaults)).toEqual(defaults);
  });

  it('keeps the saved order, drops removed cards and slots in new ones', () => {
    const saved = ['recent', 'budget', 'old-card', 'accounts', 'spending'];
    // calculator is new: it follows accounts, as by default
    expect(mergeOrder(saved, defaults)).toEqual(['recent', 'budget', 'accounts', 'calculator', 'spending']);
    // recent is new and follows spending by default, wherever the user moved spending
    expect(mergeOrder(['spending', 'budget'], ['budget', 'spending', 'recent'])).toEqual(['spending', 'recent', 'budget']);
    // a new card that is first by default goes first
    expect(mergeOrder(['recent'], ['hello', 'recent'])).toEqual(['hello', 'recent']);
  });

  it('ignores duplicates in a saved order', () => {
    expect(mergeOrder(['budget', 'budget', 'recent'], ['budget', 'recent'])).toEqual(['budget', 'recent']);
  });

  it('moves only the visible cards, leaving hidden ones in their slots', () => {
    // loan is hidden; the user drags recent above budget
    const full = ['budget', 'loan', 'spending', 'recent'];
    expect(placeVisible(full, ['recent', 'budget', 'spending'])).toEqual(['recent', 'loan', 'budget', 'spending']);
  });
});
