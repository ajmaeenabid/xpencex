import { describe, it, expect } from 'vitest';
import { createScrollLock } from './scrollLock';

describe('locking the page scroll', () => {
  it('locks, and puts back what was there', () => {
    const style = { overflow: 'auto' };
    const unlock = createScrollLock(style)();
    expect(style.overflow).toBe('hidden');
    unlock();
    expect(style.overflow).toBe('auto');
  });

  it('stays locked until the last window lets go', () => {
    const style = { overflow: '' };
    const lock = createScrollLock(style);
    const first = lock();
    const second = lock();
    first();
    expect(style.overflow).toBe('hidden');
    second();
    expect(style.overflow).toBe('');
  });

  it('scrolls again when two open windows refresh at the same moment', () => {
    // A window with a sheet on top: both let go, then both lock again, then both close
    const style = { overflow: '' };
    const lock = createScrollLock(style);
    let window = lock();
    let sheet = lock();
    window();
    sheet();
    window = lock();
    sheet = lock();
    sheet();
    window();
    expect(style.overflow).toBe('');
  });

  it('ignores letting go twice', () => {
    const style = { overflow: '' };
    const lock = createScrollLock(style);
    const first = lock();
    const second = lock();
    first();
    first();
    expect(style.overflow).toBe('hidden');
    second();
    expect(style.overflow).toBe('');
  });
});
