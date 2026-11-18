import { describe, it, expect } from 'vitest';
import {
  MAX_ITEMS, ShoppingItem, addItems, afterShopping, boughtNote, cleanPrice, cleanShoppingText, listTotals, makeItem, removeItem, setPaid, toggleItem,
} from './shopping';

const item = (id: string, extra: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, name: id, done: false, ...extra });

describe('making items', () => {
  it('keeps the name, quantity and price', () => {
    expect(makeItem({ name: ' Rice ', qty: '2 kg', price: '৳ 180' })).toMatchObject({ name: 'Rice', qty: '2 kg', price: 180, done: false });
  });

  it('leaves out empty fields, as the database needs', () => {
    const made = makeItem({ name: 'Oil', qty: ' ', price: 0 })!;
    expect('qty' in made).toBe(false);
    expect('price' in made).toBe(false);
  });

  it('refuses an empty name or a secret code', () => {
    expect(makeItem({ name: '  ' })).toBeNull();
    expect(makeItem({ name: 'OTP 482913' })).toBeNull();
    expect(cleanShoppingText(5, 10)).toBeUndefined();
  });

  it('accepts only prices above zero', () => {
    expect(cleanPrice('12.5')).toBe(12.5);
    expect(cleanPrice(-5)).toBeUndefined();
    expect(cleanPrice('free')).toBeUndefined();
  });
});

describe('changing a list', () => {
  it('does not add an item that is still waiting', () => {
    expect(addItems([item('Rice')], [item('rice'), item('Oil')]).map(i => i.name)).toEqual(['Rice', 'Oil']);
  });

  it('can add an item again after it was bought', () => {
    expect(addItems([item('Rice', { done: true })], [item('rice')])).toHaveLength(2);
  });

  it('stops at the most a list can hold', () => {
    const full = Array.from({ length: MAX_ITEMS }, (_, i) => item(`i${i}`));
    expect(addItems(full, [item('More')])).toHaveLength(MAX_ITEMS);
  });

  it('forgets the price paid when an item is unticked', () => {
    const [ticked] = setPaid(toggleItem([item('a')], 'a'), 'a', 90);
    expect(ticked).toMatchObject({ done: true, paid: 90 });
    const [back] = toggleItem([ticked], 'a');
    expect(back.done).toBe(false);
    expect('paid' in back).toBe(false);
  });

  it('goes back to the expected price when the box is emptied', () => {
    const [cleared] = setPaid([item('a', { done: true, paid: 90, price: 100 })], 'a', '');
    expect('paid' in cleared).toBe(false);
  });

  it('removes an item', () => {
    expect(removeItem([item('a'), item('b')], 'a').map(i => i.id)).toEqual(['b']);
  });
});

describe('totals and finishing', () => {
  const items = [
    item('Rice', { qty: '2 kg', price: 200, paid: 180, done: true }),
    item('Oil', { price: 150, done: true }),
    item('Salt', { done: true }),
    item('Egg', { price: 120 }),
  ];

  it('adds up the expected and the real cost', () => {
    expect(listTotals(items)).toEqual({ estimate: 470, spent: 330, left: 1, bought: 3, unpriced: 1 });
  });

  it('writes what was bought in the note', () => {
    expect(boughtNote(items)).toBe('Rice 2 kg, Oil, Salt');
  });

  it('keeps only what was not bought', () => {
    expect(afterShopping(items).map(i => i.name)).toEqual(['Egg']);
  });
});
