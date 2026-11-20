import { describe, expect, it, vi } from 'vitest';
import { createBackStack } from './backButton';

describe('the back button', () => {
  it('closes only the newest window, then the one under it', () => {
    const stack = createBackStack();
    const accounts = vi.fn(), editAccount = vi.fn();
    stack.add(accounts);
    const closeEdit = stack.add(editAccount);
    expect(stack.back()).toBe(true);
    expect(editAccount).toHaveBeenCalledOnce();
    expect(accounts).not.toHaveBeenCalled();
    closeEdit(); // the edit window closed itself
    stack.back();
    expect(accounts).toHaveBeenCalledOnce();
  });

  it('says when nothing is open, so the app can go Home instead', () => {
    const stack = createBackStack();
    expect(stack.back()).toBe(false);
    const remove = stack.add(() => {});
    remove();
    remove(); // closing twice is harmless
    expect(stack.size).toBe(0);
    expect(stack.back()).toBe(false);
  });

  it('keeps the order when a window under the top one closes first', () => {
    const stack = createBackStack();
    const first = vi.fn(), second = vi.fn();
    const removeFirst = stack.add(first);
    stack.add(second);
    removeFirst();
    stack.back();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
