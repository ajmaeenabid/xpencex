import { describe, expect, it } from 'vitest';
import { keyboardLooksOpen } from './keyboard';

describe('keyboardLooksOpen', () => {
  it('is open when the screen got much shorter while typing', () => {
    expect(keyboardLooksOpen(450, 800, true)).toBe(true);
  });

  it('ignores small changes, like the address bar of a browser', () => {
    expect(keyboardLooksOpen(740, 800, true)).toBe(false);
  });

  it('is closed when nobody is typing, whatever the height', () => {
    expect(keyboardLooksOpen(450, 800, false)).toBe(false);
  });
});
