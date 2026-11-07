// Order of the movable cards on a page. Pure functions, so they can be tested.

/**
 * The saved order, cleaned up: ids that no longer exist are dropped, and cards added to the app
 * after the order was saved slot in after the card they follow by default (or first).
 */
export function mergeOrder(saved: string[] | undefined, defaults: string[]): string[] {
  const known = (saved || []).filter((id, i, all) => defaults.includes(id) && all.indexOf(id) === i);
  const result = [...known];
  defaults.forEach((id, i) => {
    if (result.includes(id)) return;
    const before = defaults.slice(0, i).reverse().find(prev => result.includes(prev));
    result.splice(before ? result.indexOf(before) + 1 : 0, 0, id);
  });
  return result;
}

/**
 * Applies a new order of the cards on screen to the full order. Cards that are hidden right now
 * (for example the loan card when there are no loans) keep their slots.
 */
export function placeVisible(full: string[], visibleInNewOrder: string[]): string[] {
  const visible = new Set(visibleInNewOrder);
  const queue = [...visibleInNewOrder];
  return full.map(id => (visible.has(id) ? queue.shift()! : id));
}
