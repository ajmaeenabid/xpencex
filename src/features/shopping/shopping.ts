// Shopping lists (chosen 2026-11-18): named lists of items with an optional quantity and price. Ticked items become
// one expense when the person finishes shopping, and leave the list. Plain rules, no database calls, so they can be tested.

import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';

export const MAX_LISTS = 20;
export const MAX_ITEMS = 100;
export const MAX_LIST_NAME = 60;
export const MAX_ITEM_NAME = 60;
export const MAX_QTY = 20;

export interface ShoppingItem {
  id: string;
  name: string;
  qty?: string; // "2 kg"
  price?: number; // what it is expected to cost, for the whole line
  paid?: number; // what it really cost, set after ticking
  done: boolean;
}

export interface ShoppingList {
  id: string;
  uid: string;
  name: string;
  items: ShoppingItem[];
  createdAt: string;
  updatedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const newId = () => Math.random().toString(36).slice(2, 10);

/** Text that can be saved: one short line with codes refused and numbers hidden, or undefined */
export function cleanShoppingText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string' || containsSecret(raw)) return undefined;
  return maskSensitive(raw.replace(/\s+/g, ' ').trim()).slice(0, max).trim() || undefined;
}

/** A price from a box or the AI: above zero, or undefined */
export function cleanPrice(raw: unknown): number | undefined {
  const value = typeof raw === 'string' ? parseFloat(raw.replace(/[^\d.]/g, '')) : Number(raw);
  return Number.isFinite(value) && value > 0 ? round2(value) : undefined;
}

/** A new item, or null when its name can't be used. Empty fields are left out, as the database needs. */
export function makeItem(raw: { name: unknown; qty?: unknown; price?: unknown }): ShoppingItem | null {
  const name = cleanShoppingText(raw.name, MAX_ITEM_NAME);
  if (!name) return null;
  const qty = cleanShoppingText(raw.qty, MAX_QTY);
  const price = cleanPrice(raw.price);
  return { id: newId(), name, ...(qty && { qty }), ...(price !== undefined && { price }), done: false };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds items, skipping any still waiting on the list, up to the most a list can hold */
export function addItems(items: ShoppingItem[], added: ShoppingItem[]): ShoppingItem[] {
  const out = [...items];
  for (const item of added) {
    if (out.length >= MAX_ITEMS) break;
    if (!out.some(i => !i.done && sameName(i.name, item.name))) out.push(item);
  }
  return out;
}

/** Ticks or unticks an item. Unticking forgets the price paid. */
export function toggleItem(items: ShoppingItem[], id: string): ShoppingItem[] {
  return items.map(item => {
    if (item.id !== id) return item;
    const { paid: _paid, ...rest } = item;
    return { ...rest, done: !item.done };
  });
}

/** Sets what a ticked item really cost; an empty box goes back to the expected price */
export function setPaid(items: ShoppingItem[], id: string, raw: unknown): ShoppingItem[] {
  const paid = cleanPrice(raw);
  return items.map(item => {
    if (item.id !== id) return item;
    const { paid: _old, ...rest } = item;
    return paid === undefined ? rest : { ...rest, paid };
  });
}

export const removeItem = (items: ShoppingItem[], id: string) => items.filter(item => item.id !== id);

/** What an item cost: the price paid, else the price expected */
export const costOf = (item: ShoppingItem) => item.paid ?? item.price ?? 0;

export function listTotals(items: ShoppingItem[]) {
  const bought = items.filter(i => i.done);
  return {
    estimate: round2(items.reduce((sum, i) => sum + (i.price ?? 0), 0)),
    spent: round2(bought.reduce((sum, i) => sum + costOf(i), 0)),
    left: items.length - bought.length,
    bought: bought.length,
    unpriced: bought.filter(i => i.paid === undefined && i.price === undefined).length,
  };
}

/** The expense's note: what was bought */
export const boughtNote = (items: ShoppingItem[]) =>
  items.filter(i => i.done).map(i => (i.qty ? `${i.name} ${i.qty}` : i.name)).join(', ').slice(0, 500);

/** What stays on the list after the bought items are saved */
export const afterShopping = (items: ShoppingItem[]) => items.filter(i => !i.done);
