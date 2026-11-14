import { describe, it, expect } from 'vitest';
import { dropIndex, mergeOrder, moveTo, placeVisible } from './sectionOrder';

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

describe('dropIndex and moveTo', () => {
  const centers = [100, 300, 500, 700];
  it('stays put until it passes the middle of a neighbour', () => {
    expect(dropIndex(centers, 1, 300)).toBe(1);
    expect(dropIndex(centers, 1, 499)).toBe(1);
    expect(dropIndex(centers, 1, 501)).toBe(2);
  });
  it('goes to the ends', () => {
    expect(dropIndex(centers, 1, -50)).toBe(0);
    expect(dropIndex(centers, 1, 9999)).toBe(3);
    expect(dropIndex(centers, 3, 50)).toBe(0);
  });
  it('moves an item', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(['a', 'b'], 0, 0)).toEqual(['a', 'b']);
  });
  it('keeps hidden cards in their slots when the shown ones move', () => {
    // "loan" is hidden; "a" moved below "c"
    expect(placeVisible(['a', 'loan', 'b', 'c'], moveTo(['a', 'b', 'c'], 0, 2))).toEqual(['b', 'loan', 'c', 'a']);
  });
});
